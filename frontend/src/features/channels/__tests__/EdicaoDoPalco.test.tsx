import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { PalcoDoSlotPreview } from '@/features/editor/fase2/PalcoDoSlotPreview';
import { COMPONENTES_PADRAO } from '@/shared/palco/palcoLimpo';
import { estiloDoPreset, presetsDoEstilo } from '@/shared/palco/presetsPorEstilo';
import { DEFAULT_YOUTUBE_LAYOUT } from '@/shared/palco/youtubeLayout';
import type { PalcoComponentes } from '../api/canais';
import { componentesDoRascunho } from '../EdicaoDoPalco';
import { rascunhoDe } from '../PalcoComponentesSection';
import { RascunhoDoPalcoContext, usePalcoParaPrevia } from '../useChannels';

// D-921: o palco do canal editado dentro dos modais de posição (pós e short),
// com a prévia desenhando o rascunho e os presets separados por estilo.

function palco(extra: Partial<PalcoComponentes> = {}): PalcoComponentes {
  return {
    canal_id: 'default',
    estilo: 'atual',
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
      imagem_url: '',
      mostrar_imagem: true,
      mostrar_nome: true,
      mostrar_handle: true,
      escala: 1,
      posicao: { automatica: false, x: 64, y: 64 },
      posicao_short: { automatica: true, x: 0, y: 0 },
    },
    placa: { ativo: true, escala: 1, posicao: { automatica: true, x: 0, y: 0 } },
    contorno_short: 32,
    fundo_short: 'palco',
    fundos_do_short: ['palco', 'eco'],
    estilo_da_legenda: 'contorno',
    estilos_da_legenda: ['contorno', 'sombra'],
    cards: { ocultos: [], escala: 1, posicao: { automatica: true, x: 96, y: 112 } },
    tipos_de_cena: [],
    ...extra,
  };
}

describe('presets por estilo (D-921)', () => {
  const presets = [
    { id: 'velho', payload: { compartilhada: {} } },
    { id: 'atual', payload: { estilo: 'atual' } },
    { id: 'limpo', payload: { estilo: 'limpo' } },
  ];

  it('preset sem estilo conta como o de sempre', () => {
    expect(estiloDoPreset({})).toBe('atual');
    expect(estiloDoPreset(undefined)).toBe('atual');
  });

  it('trocar o estilo troca a lista', () => {
    expect(presetsDoEstilo(presets, 'atual').map((p) => p.id)).toEqual(['velho', 'atual']);
    expect(presetsDoEstilo(presets, 'limpo').map((p) => p.id)).toEqual(['limpo']);
  });
});

describe('o rascunho vira a prévia (D-921)', () => {
  it('a prévia segue o rascunho antes de salvar', () => {
    const rascunho = { ...rascunhoDe(palco()), estilo: 'limpo' as const, nome: 'Pedro', handle: 'pedro' };
    const componentes = componentesDoRascunho(palco(), rascunho);
    expect(componentes.estilo).toBe('limpo');
    expect(componentes.cabecalho.nome).toBe('Pedro');
    expect(componentes.cabecalho.handle).toBe('@pedro');
  });

  it('nome e @ vazios herdam a identidade do canal, como no render', () => {
    const componentes = componentesDoRascunho(palco(), rascunhoDe(palco()));
    expect(componentes.cabecalho.nome).toBe('Seu Canal');
    expect(componentes.cabecalho.handle).toBe('@seucanal');
  });
});

describe('a prévia do modal de posição segue o estilo (D-921)', () => {
  const desenhar = (estilo: 'atual' | 'limpo') =>
    renderToStaticMarkup(
      <PalcoDoSlotPreview
        config={DEFAULT_YOUTUBE_LAYOUT.compartilhada}
        currentTime={0}
        fundo="hud-forte"
        placa={{ nome: '', papel: '' }}
        palco={{ ...COMPONENTES_PADRAO, estilo }}
      />,
    );

  it('no limpo, janelas com a sombra do palco limpo, sem o chrome de sempre', () => {
    const limpo = desenhar('limpo');
    expect(limpo).toContain('drop-shadow(0 30px 60px');
    expect(desenhar('atual')).not.toContain('drop-shadow(0 30px 60px');
  });
});

describe('as prévias do short preferem o rascunho (D-921)', () => {
  function Estilo() {
    return <span>{usePalcoParaPrevia().estilo}</span>;
  }
  const com = (rascunho: typeof COMPONENTES_PADRAO | null) =>
    renderToStaticMarkup(
      <QueryClientProvider client={new QueryClient()}>
        <RascunhoDoPalcoContext.Provider value={rascunho}>
          <Estilo />
        </RascunhoDoPalcoContext.Provider>
      </QueryClientProvider>,
    );

  it('com rascunho, o rascunho; sem ele, o palco salvo (o padrão enquanto carrega)', () => {
    expect(com({ ...COMPONENTES_PADRAO, estilo: 'limpo' })).toContain('limpo');
    expect(com(null)).toContain('atual');
  });
});
