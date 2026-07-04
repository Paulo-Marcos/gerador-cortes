import { describe, expect, it } from 'vitest';
import type { PipelineStatusResponse } from '@/types/models';
import {
  alternarFase,
  descreverRequest,
  faseEhMeioObrigatorio,
  faseSelecionavel,
  fasePronta,
  intervaloContiguo,
  selecaoParaRequest,
  type FaseRender,
} from '../renderEtapas';

function status(fases: Partial<PipelineStatusResponse['fases']>): PipelineStatusResponse {
  return {
    fases: { raw: true, grade: false, overlays: false, compose: false, encode: false, ...fases },
    overlays_count: 0,
    tem_etapas_concluidas: false,
  };
}

const set = (...fases: FaseRender[]) => new Set<FaseRender>(fases);

describe('fasePronta / faseSelecionavel', () => {
  it('grade está sempre selecionável (parte do bruto)', () => {
    expect(faseSelecionavel('grade', undefined)).toBe(true);
  });

  it('overlays e render final exigem a grade pronta', () => {
    expect(faseSelecionavel('overlays', status({ grade: false }))).toBe(false);
    expect(faseSelecionavel('overlays', status({ grade: true }))).toBe(true);
    expect(faseSelecionavel('render_final', status({ grade: true }))).toBe(true);
  });

  it('render final pronto reconhece tanto encode quanto compose', () => {
    expect(fasePronta('render_final', status({ encode: true }))).toBe(true);
    expect(fasePronta('render_final', status({ compose: true }))).toBe(true);
    expect(fasePronta('render_final', status({}))).toBe(false);
  });
});

describe('intervaloContiguo', () => {
  it('vazio quando nada marcado', () => {
    expect(intervaloContiguo(set())).toEqual([]);
  });

  it('preenche o buraco entre pontas marcadas', () => {
    expect(intervaloContiguo(set('grade', 'render_final'))).toEqual([
      'grade',
      'overlays',
      'render_final',
    ]);
  });

  it('mantém um único item', () => {
    expect(intervaloContiguo(set('overlays'))).toEqual(['overlays']);
  });
});

describe('alternarFase', () => {
  it('marca uma fase nova', () => {
    expect([...alternarFase(set(), 'grade')]).toEqual(['grade']);
  });

  it('marcar grade + render final preenche overlays (contiguidade)', () => {
    const r = alternarFase(set('grade'), 'render_final');
    expect([...intervaloContiguo(r)]).toEqual(['grade', 'overlays', 'render_final']);
  });

  it('desmarcar uma ponta encolhe o intervalo', () => {
    const r = alternarFase(set('grade', 'overlays'), 'overlays');
    expect([...r]).toEqual(['grade']);
  });

  it('desmarcar a fase do meio é no-op', () => {
    const r = alternarFase(set('grade', 'overlays', 'render_final'), 'overlays');
    expect([...intervaloContiguo(r)]).toEqual(['grade', 'overlays', 'render_final']);
  });
});

describe('faseEhMeioObrigatorio', () => {
  it('overlays é obrigatório entre grade e render final', () => {
    expect(faseEhMeioObrigatorio(set('grade', 'overlays', 'render_final'), 'overlays')).toBe(true);
  });

  it('pontas nunca são obrigatórias', () => {
    expect(faseEhMeioObrigatorio(set('grade', 'overlays', 'render_final'), 'grade')).toBe(false);
    expect(faseEhMeioObrigatorio(set('grade', 'overlays', 'render_final'), 'render_final')).toBe(
      false,
    );
  });
});

describe('selecaoParaRequest', () => {
  it('null quando nada marcado', () => {
    expect(selecaoParaRequest(set(), { reaproveitarOverlays: true })).toBeNull();
  });

  it('só grade → startFrom=grade, pararEm=grade', () => {
    expect(selecaoParaRequest(set('grade'), { reaproveitarOverlays: true })).toEqual({
      startFrom: 'grade',
      pararEm: 'grade',
      continuar: true,
    });
  });

  it('só overlays → startFrom=overlays, pararEm=overlays, continuar reflete o toggle', () => {
    expect(selecaoParaRequest(set('overlays'), { reaproveitarOverlays: false })).toEqual({
      startFrom: 'overlays',
      pararEm: 'overlays',
      continuar: false,
    });
  });

  it('tudo (até render final) omite pararEm', () => {
    const r = selecaoParaRequest(set('grade', 'overlays', 'render_final'), {
      reaproveitarOverlays: false,
    });
    expect(r).toEqual({ startFrom: 'grade', pararEm: undefined, continuar: false });
  });

  it('grade+overlays para antes do render final', () => {
    const r = selecaoParaRequest(set('grade', 'overlays'), { reaproveitarOverlays: true });
    expect(r).toEqual({ startFrom: 'grade', pararEm: 'overlays', continuar: true });
  });
});

describe('descreverRequest', () => {
  it('descreve render parcial de uma etapa', () => {
    const r = selecaoParaRequest(set('grade'), { reaproveitarOverlays: true });
    expect(descreverRequest(r)).toContain('só');
  });

  it('descreve render completo', () => {
    const r = selecaoParaRequest(set('grade', 'overlays', 'render_final'), {
      reaproveitarOverlays: false,
    });
    expect(descreverRequest(r)).toContain('finaliza');
  });
});
