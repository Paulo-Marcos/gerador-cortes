import { describe, expect, it } from 'vitest';
import type { Corte, StatusExportCorte } from '@/types/models';
import {
  isCorteVideoPronto,
  pickPostProductionEntryCut,
  resolveCorteStagePath,
  resolveRenderCompletionPath,
  isCenaRemotion,
  parseCenasPayload,
  progressFromPipelineArtifacts,
} from '../postProductionNavigation';

const projetoId = 'projeto-1';

function cut(id: string, arquivo_clip_path = '', patch: Partial<Corte> = {}): Corte {
  return { id, arquivo_clip_path, ...patch } as Corte;
}

function status(corteId: string, patch: Partial<StatusExportCorte>): StatusExportCorte {
  return { corte_id: corteId, numero: 1, titulo: corteId, ...patch } as StatusExportCorte;
}

describe('postProductionNavigation', () => {
  it('ao entrar sem corte escolhido, prioriza cortes com render final', () => {
    const escolhido = pickPostProductionEntryCut(
      [cut('raw', 'clip_raw.mkv'), cut('final')],
      [
        status('raw', { raw_pronto: true, video_pronto: false }),
        status('final', { raw_pronto: true, video_pronto: true }),
      ],
    );

    expect(escolhido?.id).toBe('final');
  });

  it('apos render concluido, manda para a revisao final mesmo com fase=2 forcado', () => {
    expect(
      resolveRenderCompletionPath({
        projetoId,
        corteId: 'corte-rendered',
        finished: true,
      }),
    ).toBe('/projetos/projeto-1/final-review?corte=corte-rendered');
  });

  it('nao redireciona apos render se ainda nao terminou', () => {
    expect(
      resolveRenderCompletionPath({
        projetoId,
        corteId: 'corte-running',
        finished: false,
      }),
    ).toBeNull();
  });

  it('nao redireciona apos render se nao houver corte selecionado', () => {
    expect(
      resolveRenderCompletionPath({
        projetoId,
        corteId: undefined,
        finished: true,
      }),
    ).toBeNull();
  });

  it('isCorteVideoPronto considera is_pos_producao quando o corte ficou fora do exportStatus', () => {
    const corte = { id: 'x', is_pos_producao: 1 as const } as Corte;
    expect(isCorteVideoPronto(corte, undefined)).toBe(true);
  });

  it('isCorteVideoPronto retorna true quando exportStatus marca video_pronto', () => {
    const corte = { id: 'x' } as Corte;
    expect(isCorteVideoPronto(corte, status('x', { video_pronto: true }))).toBe(true);
  });

  it('isCorteVideoPronto retorna false quando nenhuma fonte indica render', () => {
    const corte = { id: 'x' } as Corte;
    expect(isCorteVideoPronto(corte, status('x', { video_pronto: false }))).toBe(false);
  });

  it('pickPostProductionEntryCut prioriza corte com is_pos_producao mesmo sem exportStatus do corte', () => {
    const cortes = [
      { id: 'raw', arquivo_clip_path: 'clip.mkv' } as Corte,
      { id: 'rendered-out-of-status', is_pos_producao: 1, arquivo_clip_path: 'clip.mkv' } as Corte,
    ];
    const escolhido = pickPostProductionEntryCut(cortes, [
      status('raw', { raw_pronto: true, video_pronto: false }),
    ]);
    expect(escolhido?.id).toBe('rendered-out-of-status');
  });

  describe('resolveCorteStagePath', () => {
    it('manda corte sem artefatos para Bruto', () => {
      expect(resolveCorteStagePath({ projetoId, corte: cut('draft') })).toBe(
        '/projetos/projeto-1/cortes/draft?fase=1',
      );
    });

    it('manda corte com bruto pronto para Pos', () => {
      expect(
        resolveCorteStagePath({
          projetoId,
          corte: cut('raw'),
          status: status('raw', { raw_pronto: true, video_pronto: false }),
        }),
      ).toBe('/projetos/projeto-1/post-production?corte=raw');
    });

    it('manda corte em grade ou overlays para Pos', () => {
      expect(
        resolveCorteStagePath({
          projetoId,
          corte: cut('grade'),
          status: status('grade', { raw_pronto: false, grade_pronta: true, video_pronto: false }),
        }),
      ).toBe('/projetos/projeto-1/post-production?corte=grade');
    });

    it('preserva fase=2 apenas quando o destino e Pos', () => {
      expect(
        resolveCorteStagePath({
          projetoId,
          corte: cut('raw', 'clip_raw.mkv'),
          forcePhase2: true,
        }),
      ).toBe('/projetos/projeto-1/post-production?corte=raw&fase=2');
    });

    it('manda corte com render final para Final', () => {
      expect(
        resolveCorteStagePath({
          projetoId,
          corte: cut('final', '', { is_pos_producao: 1 }),
        }),
      ).toBe('/projetos/projeto-1/final-review?corte=final');
    });
  });

  describe('isCenaRemotion', () => {
    it('valida uma cena remotion valida', () => {
      expect(isCenaRemotion({ tipo: 'tela_cheia', inicio: 0, fim: 10 })).toBe(true);
    });

    it('rejeita objetos invalidos ou nulos', () => {
      expect(isCenaRemotion(null)).toBe(false);
      expect(isCenaRemotion({})).toBe(false);
      expect(isCenaRemotion({ tipo: 'tela_cheia' })).toBe(false);
      expect(isCenaRemotion({ tipo: 'tela_cheia', inicio: '0', fim: 10 })).toBe(false);
    });
  });

  describe('parseCenasPayload', () => {
    it('faz o parse de array simples de cenas', () => {
      const parsed = parseCenasPayload([
        { tipo: 'tela_cheia', inicio: 0, fim: 5 },
        { tipo: 'barra_inferior', inicio: 5, fim: 10 },
      ]);
      expect(parsed.cenas).toHaveLength(2);
      expect(parsed.cenas[0].tipo).toBe('tela_cheia');
    });

    it('faz o parse de objeto complexo contendo formato, paleta e cenas', () => {
      const parsed = parseCenasPayload({
        formato: '9:16',
        paleta: { principal: '#ff0000' },
        cenas: [{ tipo: 'chamada_final', inicio: 10, fim: 15 }],
      });
      expect(parsed.formato).toBe('9:16');
      expect(parsed.paleta).toEqual({ principal: '#ff0000' });
      expect(parsed.cenas).toHaveLength(1);
      expect(parsed.cenas[0].tipo).toBe('chamada_final');
    });

    it('retorna array de cenas vazio para payloads invalidos', () => {
      expect(parseCenasPayload(null).cenas).toEqual([]);
      expect(parseCenasPayload('invalid').cenas).toEqual([]);
    });
  });

  describe('progressFromPipelineArtifacts', () => {
    it('calcula o progresso correto de acordo com as fases concluidas', () => {
      expect(progressFromPipelineArtifacts(undefined)).toBe(1);
      expect(
        progressFromPipelineArtifacts({
          raw: true,
          grade: false,
          overlays: false,
          compose: false,
          encode: false,
        }),
      ).toBe(8);
      expect(
        progressFromPipelineArtifacts({
          raw: true,
          grade: true,
          overlays: false,
          compose: false,
          encode: false,
        }),
      ).toBe(22);
      expect(
        progressFromPipelineArtifacts({
          raw: true,
          grade: true,
          overlays: true,
          compose: false,
          encode: false,
        }),
      ).toBe(55);
      expect(
        progressFromPipelineArtifacts({
          raw: true,
          grade: true,
          overlays: true,
          compose: true,
          encode: false,
        }),
      ).toBe(72);
      expect(
        progressFromPipelineArtifacts({
          raw: true,
          grade: true,
          overlays: true,
          compose: true,
          encode: true,
        }),
      ).toBe(100);
    });
  });
});
