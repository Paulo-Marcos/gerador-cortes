import { describe, expect, it } from 'vitest';
import type { StatusCorte } from '@/types/models';
import { descricaoDoRefazerTranscricao } from '../cortesDoWorkspace';

// D-1096: "Gerar pula, Refazer inclui". O Refazer transcrição sincroniza os
// riscados também (backend: test_refazer_transcricao_sincroniza_tambem_o_riscado);
// a conta do diálogo diz os cortes que ficam, e os riscados aparecem à parte.

const cortes = (...status: StatusCorte[]) => status.map((s) => ({ status: s }));

describe('o diálogo do Refazer transcrição (D-1096)', () => {
  it('conta só os cortes que ficam e avisa que os riscados vão junto', () => {
    expect(descricaoDoRefazerTranscricao(cortes('proposto', 'aprovado', 'rejeitado', 'processado'))).toBe(
      'As legendas são baixadas de novo e os 3 cortes são re-sincronizados com elas. Os riscados também, para voltarem com a legenda nova.',
    );
  });

  it('sem riscados, não fala deles', () => {
    expect(descricaoDoRefazerTranscricao(cortes('proposto', 'aprovado'))).toBe(
      'As legendas são baixadas de novo e os 2 cortes são re-sincronizados com elas.',
    );
  });

  it('um corte só fica no singular', () => {
    expect(descricaoDoRefazerTranscricao(cortes('aprovado', 'rejeitado'))).toBe(
      'As legendas são baixadas de novo e o corte é re-sincronizado com elas. Os riscados também, para voltarem com a legenda nova.',
    );
  });
});
