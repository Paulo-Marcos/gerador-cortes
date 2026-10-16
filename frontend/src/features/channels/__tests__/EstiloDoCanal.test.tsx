import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { gruposDoModal } from '@/features/editor/fase2/MenuDoModal';
import { PainelDoPalco } from '@/features/editor/fase2/PaineisDoPalco';
import type { usePalcoDoModal } from '@/features/channels/usePalcoDoModal';
import { DEFAULT_YOUTUBE_LAYOUT } from '@/shared/palco/youtubeLayout';
import type { PalcoComponentes } from '../api/canais';
import { EstiloNoModal } from '../EstiloNoModal';
import { EstiloPorTipo, ImagemDoCabecalho } from '../EstiloDoCanal';
import { layoutGlobalDe } from '../PadraoDoCanalModais';
import { rascunhoDe } from '../PalcoComponentesSection';

// D-938: a tela de Canais só escolhe o estilo por tipo; o detalhe e os presets
// moram no modal do tipo, que abre no alvo `canal` para editar o padrão.

function palco(extra: Partial<PalcoComponentes> = {}): PalcoComponentes {
  return {
    canal_id: 'default',
    estilo: 'limpo',
    estilos: ['atual', 'limpo'],
    fundo: 'reticula-aurora',
    fundos: ['reticula-aurora'],
    cabecalho: {
      ativo: true,
      nome: '',
      handle: '',
      imagem: '',
      nome_efetivo: 'Seu Canal',
      handle_efetivo: '@seucanal',
      imagem_url: '/api/channels/default/palco/imagem?v=1',
      escala: 1,
      posicao: { automatica: false, x: 64, y: 64 },
      posicao_short: { automatica: true, x: 0, y: 0 },
      mostrar_imagem: true,
      mostrar_nome: true,
      mostrar_handle: true,
    },
    placa: { ativo: true, escala: 1, posicao: { automatica: true, x: 0, y: 0 } },
    contorno_short: 32,
    fundo_short: 'palco',
    fundos_do_short: ['palco', 'eco'],
    estilo_da_legenda: 'contorno',
    estilos_da_legenda: ['contorno', 'sombra'],
    cards: { ocultos: [], escala: 1, posicao: { automatica: true, x: 96, y: 112 } },
    tipos_de_cena: [{ id: 'definicao_termo', nome: 'Definição' }],
    ...extra,
  };
}

const nada = () => undefined;

describe('a tela de Canais só escolhe o estilo (D-938)', () => {
  const tela = renderToStaticMarkup(
    <EstiloPorTipo estilo="limpo" estiloDaCapa="palco" onEstilo={nada} onEstiloDaCapa={nada} onEditar={nada} />,
  );

  it('mostra o estilo do vídeo e o da capa, com o escolhido marcado', () => {
    expect(tela).toContain('Vídeo horizontal e short');
    expect(tela).toContain('Atual');
    expect(tela).toContain('Limpo');
    expect(tela).toContain('aria-pressed="true"');
    expect(tela).toContain('aria-label="Estilo da capa do TikTok"');
    expect(tela).toMatch(/aria-checked="true"[^>]*>Igual ao palco/);
  });

  it('o detalhe não está na página: cabeçalho, placa, cards e janelas ficam no modal', () => {
    for (const detalhe of ['Posição no vídeo', 'Posição no short', 'Mostrar a placa', 'Contorno do fundo', 'Cards (cenas)']) {
      expect(tela).not.toContain(detalhe);
    }
  });

  it('cada tipo tem o botão que abre o modal do padrão do canal', () => {
    expect(tela).toContain('Editar o padrão do horizontal');
    expect(tela).toContain('Editar o padrão do short');
  });

  it('a imagem do cabeçalho (identidade do canal) continua na tela', () => {
    const mascote = renderToStaticMarkup(<ImagemDoCabecalho palco={palco()} enviando={false} onEnviar={nada} onRemover={nada} />);
    expect(mascote).toContain('pose padrão do mascote');
    expect(mascote).not.toContain('Voltar ao mascote');
    const propria = palco({ cabecalho: { ...palco().cabecalho, imagem: 'cabecalho.png' } });
    const html = renderToStaticMarkup(<ImagemDoCabecalho palco={propria} enviando={false} onEnviar={nada} onRemover={nada} />);
    expect(html).toContain('Voltar ao mascote');
  });
});

describe('o modal do horizontal no padrão do canal (D-938)', () => {
  it('sem as telas (são de cada vídeo); no atual, só os cards', () => {
    expect(gruposDoModal('limpo', true)).toEqual(['fundo', 'cabecalho', 'placa', 'cards']);
    expect(gruposDoModal('atual', true)).toEqual(['cards']);
    expect(gruposDoModal('limpo')).toContain('telas');
  });

  it('a troca de estilo no topo vale para o canal', () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <EstiloNoModal alvo="canal" estilo="limpo" origem="canal" onEstilo={nada} />
      </MemoryRouter>,
    );
    expect(html).toContain('Usar neste canal');
    expect(html).toContain('role="radio"');
    expect(html).not.toContain('href="/canais"');
  });

  it('a placa edita o componente do canal, sem o texto de cada corte', () => {
    const rascunho = rascunhoDe(palco());
    const contexto = { efetivo: palco(), rascunho, estilo: 'limpo', mudar: nada } as unknown as ReturnType<typeof usePalcoDoModal>;
    const html = renderToStaticMarkup(
      <PainelDoPalco grupo="placa" palco={contexto} global={false} canal editavel={false} fundo="hud-forte" placa={{ nome: '', papel: '' }} onFundo={nada} onPlaca={nada} />,
    );
    expect(html).toContain('Mostrar a placa');
    expect(html).not.toContain('Placa de nome');
    expect(html).not.toContain('Neste segmento');
  });

  it('a prévia parte do layout global; sem nada salvo, do padrão', () => {
    expect(layoutGlobalDe('')).toBe(DEFAULT_YOUTUBE_LAYOUT);
    expect(layoutGlobalDe('{lixo')).toBe(DEFAULT_YOUTUBE_LAYOUT);
    expect(layoutGlobalDe(JSON.stringify({ modo_padrao: 'compartilhada', fundo: 'hud-topo' })).fundo).toBe('hud-topo');
  });
});

describe('o layout da capa saiu dos Ajustes (D-938)', () => {
  it('os ajustes que salvam sozinhos não trazem mais o editor da capa', () => {
    const fonte = readFileSync(resolve(__dirname, '../../settings/AjustesQueSalvamSozinhos.tsx'), 'utf8');
    expect(fonte).not.toContain('CapaTikTokLayoutEditor');
  });
});
