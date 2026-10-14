import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import { BarraDePresets } from '@/features/editor/fase2/BarraDePresets';
import { COMPONENTES_PADRAO } from '@/shared/palco/palcoLimpo';
import type { LayoutPreset } from '@/types/presets';
import type { PalcoComponentes } from '../api/canais';
import { componentesDoRascunho } from '../EdicaoDoPalco';
import { EstiloNoModal } from '../EstiloNoModal';
import { PalcoComponentesForm, rascunhoDe } from '../PalcoComponentesSection';
import { paraComponentesDoPalco } from '../palcoDoCanal';
import { alvoDoEstiloPara } from '../palcoDoEscopo';
import { PalcoDoTipoNoModal, abasDoPalco } from '../PalcoDoTipoNoModal';
import { PalcoDoCorteContext, usePalcoDoCanalAtivoResolvido } from '../useChannels';

// D-923: o palco por projeto/corte e por tipo, o modal reorganizado e o
// cabeçalho que esconde o nome, o @ ou a imagem.

function palco(extra: Partial<PalcoComponentes> = {}, cabecalho = {}): PalcoComponentes {
  return {
    canal_id: 'default',
    estilo: 'limpo',
    estilos: ['atual', 'limpo'],
    fundo: 'reticula-aurora',
    fundos: ['reticula-aurora', 'reticula', 'aurora', 'linho', 'chapado'],
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
      ...cabecalho,
    },
    placa: { ativo: true, escala: 1, posicao: { automatica: true, x: 0, y: 0 } },
    contorno_short: 32,
    fundo_short: 'palco',
    fundos_do_short: ['palco', 'eco'],
    estilo_da_legenda: 'contorno',
    estilos_da_legenda: ['contorno', 'sombra'],
    cards: { ocultos: [], escala: 1, posicao: { automatica: true, x: 96, y: 112 } },
    tipos_de_cena: [{ id: 'conceito', nome: 'Conceito' }],
    ...extra,
  };
}

const comRota = (no: ReactNode) => renderToStaticMarkup(<MemoryRouter>{no}</MemoryRouter>);

describe('cabeçalho só com a imagem (D-923)', () => {
  it('nome e @ desligados somem da prévia; a imagem fica', () => {
    const previa = paraComponentesDoPalco(palco({}, { mostrar_nome: false, mostrar_handle: false }));
    expect([previa.cabecalho.nome, previa.cabecalho.handle]).toEqual(['', '']);
    expect(previa.cabecalho.imagemUrl).not.toBe('');
  });

  it('no rascunho, desligar a imagem a tira da prévia; religar a devolve', () => {
    const salvoSem = palco({}, { mostrar_imagem: false });
    const religada = componentesDoRascunho(salvoSem, { ...rascunhoDe(salvoSem), mostrarImagem: true });
    expect(religada.cabecalho.imagemUrl).not.toBe('');
    const sem = componentesDoRascunho(palco(), { ...rascunhoDe(palco()), mostrarImagem: false });
    expect(sem.cabecalho.imagemUrl).toBe('');
  });

  it('a tela de Canais oferece ligar e desligar imagem, nome e @', () => {
    const html = renderToStaticMarkup(
      <PalcoComponentesForm
        rascunho={rascunhoDe(palco())}
        palco={palco()}
        pendente={false}
        enviandoImagem={false}
        onMudar={() => undefined}
        onSalvar={() => undefined}
        onEnviarImagem={() => undefined}
        onRemoverImagem={() => undefined}
      />,
    );
    expect(html).toContain('aria-label="Itens do cabeçalho"');
  });
});

describe('cada tipo com o seu palco (D-923)', () => {
  it('o horizontal não mostra nada do short, e o short nada do horizontal', () => {
    expect(abasDoPalco('horizontal', 'limpo')).toEqual(['fundo', 'cabecalho', 'placa', 'cards']);
    expect(abasDoPalco('short', 'limpo')).toEqual(['fundo', 'cabecalho', 'janelas']);
  });

  it('no estilo atual não aparece nada do limpo', () => {
    expect(abasDoPalco('horizontal', 'atual')).toEqual(['cards']);
    expect(abasDoPalco('short', 'atual')).toEqual(['janelas']);
  });

  it('o editor do horizontal desenha as abas dele', () => {
    const html = renderToStaticMarkup(
      <PalcoDoTipoNoModal tipo="horizontal" rascunho={rascunhoDe(palco())} efetivo={palco()} onMudar={() => undefined} />,
    );
    expect(html).toContain('Placa');
    expect(html).not.toContain('Janelas e legenda');
  });

  it('segmento grava no corte; projeto e global no próprio nível', () => {
    expect(alvoDoEstiloPara('segmento')).toBe('corte');
    expect(alvoDoEstiloPara('projeto')).toBe('projeto');
    expect(alvoDoEstiloPara('global')).toBe('global');
  });
});

describe('a página desenha o palco do corte (D-923)', () => {
  function Estilo() {
    return <span>{usePalcoDoCanalAtivoResolvido().estilo}</span>;
  }
  it('com o palco do corte, ele vence o do canal', () => {
    const html = renderToStaticMarkup(
      <QueryClientProvider client={new QueryClient()}>
        <PalcoDoCorteContext.Provider value={{ ...COMPONENTES_PADRAO, estilo: 'limpo' }}>
          <Estilo />
        </PalcoDoCorteContext.Provider>
      </QueryClientProvider>,
    );
    expect(html).toContain('limpo');
  });
});

describe('o topo do modal diz o estilo e onde a troca vale (D-923)', () => {
  it('no corte, a troca é do corte', () => {
    const html = comRota(<EstiloNoModal alvo="corte" estilo="limpo" origem="canal" onEstilo={() => undefined} />);
    expect(html).toContain('Usar neste corte');
    expect(html).toContain('o palco global do canal');
  });

  it('no global, não troca aqui: aponta para Canais', () => {
    const html = comRota(<EstiloNoModal alvo="global" estilo="atual" origem="canal" onEstilo={() => undefined} />);
    expect(html).not.toContain('role="radio"');
    expect(html).toContain('href="/canais"');
  });
});

describe('presets como fichas (D-923)', () => {
  const preset = { id: 'p1', nome: 'Estúdio', tipo: 'posicionamento', payload: {} } as unknown as LayoutPreset;
  const barra = (presets: LayoutPreset[]) =>
    renderToStaticMarkup(
      <TooltipProvider>
      <BarraDePresets
        presets={presets}
        selecionado="p1"
        onAplicar={() => undefined}
        onRenomear={() => undefined}
        onRemover={() => undefined}
        renomeando={false}
        removendo={false}
        estilo="limpo"
      />
      </TooltipProvider>,
    );
  it('cada preset do estilo é um botão; o aplicado fica marcado', () => {
    expect(barra([preset])).toContain('aria-pressed="true"');
    expect(barra([preset])).toContain('Presets do estilo Limpo');
  });
  it('sem preset no estilo, diz como criar', () => {
    expect(barra([])).toContain('Nenhum preset neste estilo');
  });
});
