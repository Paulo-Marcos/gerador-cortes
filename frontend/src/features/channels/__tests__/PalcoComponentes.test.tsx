import { describe, expect, it } from 'vitest';
import type { PalcoComponentes } from '../api/canais';
import { edicaoDe, rascunhoDe } from '../PalcoComponentesSection';
import { paraComponentesDoPalco, urlDaImagem } from '../palcoDoCanal';

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
    tipos_de_cena: [
      { id: 'card_informacao', nome: 'Card de informação' },
      { id: 'pergunta_chat', nome: 'Pergunta do chat' },
    ],
    ...extra,
  };
}

describe('rascunho e edição do palco (D-911)', () => {
  it('o rascunho parte do que o canal gravou e a edição devolve tudo', () => {
    const rascunho = rascunhoDe(
      palco({
        estilo: 'limpo',
        placa: { ativo: false, escala: 1, posicao: { automatica: true, x: 0, y: 0 } },
      }),
    );
    expect(rascunho.estilo).toBe('limpo');
    expect(rascunho.placaAtiva).toBe(false);
    expect(
      edicaoDe({
        ...rascunho,
        nome: 'Pedro',
        handle: '@pedro',
        cabecalhoEscala: 1.5,
        placaPosicao: { automatica: false, x: 900, y: 40 },
        contornoShort: 0,
        fundoShort: 'eco',
        estiloDaLegenda: 'sombra',
        cards: { ocultos: ['pergunta_chat'], escala: 1.2, posicao: { automatica: false, x: 1200, y: 80 } },
      }),
    ).toEqual({
      estilo: 'limpo',
      fundo: 'reticula-aurora',
      contorno_short: 0,
      fundo_short: 'eco',
      estilo_da_legenda: 'sombra',
      cards: { ocultos: ['pergunta_chat'], escala: 1.2, posicao: { automatica: false, x: 1200, y: 80 } },
      cabecalho: {
        ativo: true,
        mostrar_imagem: true,
        mostrar_nome: true,
        mostrar_handle: true,
        nome: 'Pedro',
        handle: '@pedro',
        escala: 1.5,
        posicao: { automatica: false, x: 64, y: 64 },
        posicao_short: { automatica: true, x: 0, y: 0 },
      },
      placa: { ativo: false, escala: 1, posicao: { automatica: false, x: 900, y: 40 } },
    });
  });

  it('a resposta vira o que a prévia desenha, com a imagem na origem da API', () => {
    const componentes = paraComponentesDoPalco(palco({ estilo: 'limpo' }));
    expect(componentes.estilo).toBe('limpo');
    expect(componentes.fundo).toBe('reticula-aurora');
    expect(componentes.cabecalho.nome).toBe('Seu Canal');
    expect(componentes.cabecalho.handle).toBe('@seucanal');
    expect(componentes.cabecalho.imagemUrl).toMatch(/\/api\/channels\/default\/palco\/imagem\?v=1$/);
    expect(urlDaImagem('')).toBe('');
    expect(paraComponentesDoPalco(undefined).estilo).toBe('atual');
  });
});
