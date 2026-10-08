import { describe, expect, it } from 'vitest';
import type { EstadoItemLote, LotePublicacao } from '@/features/shorts/shortsApi';
import type { QueueJob } from '@/shared/filaGlobal/useWorkbenchQueue';
import { filaDoTrilho, lotePedeAtencao, resumoDaGaveta, resumoDoLote, textoDoLote } from '../cartaoDaFila';

// D-897: o lote de publicação entra no cartão da fila — é o que avisa o
// operador que trocou de projeto com o lote ainda andando.

function lote(estados: EstadoItemLote[], extra: Partial<LotePublicacao> = {}): LotePublicacao {
  return {
    lote_id: 'l1',
    criado_em: '2026-10-08T10:00:00',
    terminou: false,
    cancelado: false,
    tiktok_assistido: false,
    instagram_assistido: false,
    publicar_sozinho: false,
    raias: [
      {
        plataforma: 'youtube_shorts',
        rotulo: 'YouTube Shorts',
        exige_humano: false,
        aviso: '',
        itens: estados.map((estado, i) => ({
          alvo_id: `a${i}`,
          alvo_tipo: 'short',
          plataforma: 'youtube_shorts',
          plataforma_rotulo: 'YouTube Shorts',
          rotulo: `short ${i}`,
          estado,
          detalhe: '',
          url: '',
        })),
      },
    ],
    ...extra,
  };
}

function job(estado: QueueJob['estado'], progresso = 40): QueueJob {
  return { id: 'j', estado, progresso, rotuloTipo: 'Render' } as QueueJob;
}

describe('resumo do lote', () => {
  it('conta publicados, itens com o operador e o que já saiu da mão da máquina', () => {
    const r = resumoDoLote(lote(['publicado', 'sua_vez', 'conferir', 'preparando', 'aguardando']));

    expect(r).toMatchObject({ total: 5, publicados: 1, comVoce: 2, emCurso: true, progresso: 60 });
    expect(textoDoLote(r)).toBe('1/5 publicados · 2 com você');
  });

  it('terminado sem nada com o operador não pede atenção; com item esperando, pede', () => {
    expect(lotePedeAtencao(resumoDoLote(lote(['publicado', 'erro'], { terminou: true })))).toBe(false);
    expect(lotePedeAtencao(resumoDoLote(lote(['publicado', 'sua_vez'], { terminou: true })))).toBe(true);
    expect(lotePedeAtencao(null)).toBe(false);
  });
});

describe('cartão da fila no trilho', () => {
  const abrir = () => undefined;

  it('sem jobs, o lote em curso sozinho acende o cartão e abre a gaveta', () => {
    const cartao = filaDoTrilho([], false, abrir, resumoDoLote(lote(['publicado', 'aguardando'])));

    expect(cartao).toEqual({ titulo: 'Fila · lote', sub: '1/2 publicados', progresso: 50, onAbrir: abrir });
  });

  it('com jobs rodando, os jobs mandam no anel e o lote aparece no título', () => {
    const cartao = filaDoTrilho([job('rodando', 30)], false, abrir, resumoDoLote(lote(['aguardando'])));

    expect(cartao?.titulo).toBe('Fila · 1 job + lote');
    expect(cartao?.progresso).toBe(30);
  });

  it('lote resolvido não segura o cartão aceso', () => {
    const cartao = filaDoTrilho([], false, abrir, resumoDoLote(lote(['publicado'], { terminou: true })));

    expect(cartao).toBeUndefined();
  });
});

describe('subtítulo da gaveta', () => {
  it('com só o lote na fila, não diz "vazia"', () => {
    expect(resumoDaGaveta([], false)).toBe('vazia');
    expect(resumoDaGaveta([], true)).toBe('lote de publicação');
    expect(resumoDaGaveta([job('rodando')], true)).toBe('1 ativo · 1 na lista · lote de publicação');
  });
});
