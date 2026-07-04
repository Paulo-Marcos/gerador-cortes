import { describe, expect, it } from 'vitest';
import {
  OPCOES_REGERAR_VAZIAS,
  planejarRegeracaoBruto,
  type RegerarBrutoOpcoes,
} from '../regerarBrutoPlan';

describe('planejarRegeracaoBruto (D-160)', () => {
  it('sem nenhum opt-in marcado, regenera SÓ o bruto', () => {
    const plano = planejarRegeracaoBruto(OPCOES_REGERAR_VAZIAS);

    expect(plano.bruto).toEqual({ refazer_transcricao: false, refazer_cenas: false });
    expect(plano.metadados).toBe(false);
    expect(plano.desvios).toBe(false);
  });

  it('marcando só cenas, apenas cenas roda além do bruto', () => {
    const opts: RegerarBrutoOpcoes = { ...OPCOES_REGERAR_VAZIAS, cenas: true };

    const plano = planejarRegeracaoBruto(opts);

    expect(plano.bruto).toEqual({ refazer_transcricao: false, refazer_cenas: true });
    expect(plano.metadados).toBe(false);
    expect(plano.desvios).toBe(false);
  });

  it('marcando transcrição e metadados, só esses são planejados', () => {
    const opts: RegerarBrutoOpcoes = {
      transcricao: true,
      cenas: false,
      metadados: true,
      desvios: false,
    };

    const plano = planejarRegeracaoBruto(opts);

    expect(plano.bruto).toEqual({ refazer_transcricao: true, refazer_cenas: false });
    expect(plano.metadados).toBe(true);
    expect(plano.desvios).toBe(false);
  });

  it('marcando tudo, transcrição+cenas viram flags e metadados+desvios ligam', () => {
    const opts: RegerarBrutoOpcoes = {
      transcricao: true,
      cenas: true,
      metadados: true,
      desvios: true,
    };

    const plano = planejarRegeracaoBruto(opts);

    expect(plano.bruto).toEqual({ refazer_transcricao: true, refazer_cenas: true });
    expect(plano.metadados).toBe(true);
    expect(plano.desvios).toBe(true);
  });
});
