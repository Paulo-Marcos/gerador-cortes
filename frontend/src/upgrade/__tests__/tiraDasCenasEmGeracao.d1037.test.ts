import { describe, expect, it } from 'vitest';
import { statusExportPendente } from '@/features/publicacao/statusExport';
import type { StatusExportCorte } from '@/types/models';
import { montarTira } from '../tiraDoCorte';

// D-1037: "próximo: gerar cenas" com a geração rodando é o convite ao clique que paga
// duas vezes. A tira aparece no alto da Pós e na linha do corte.

const verboDasCenas = (patch: Partial<StatusExportCorte>) =>
  montarTira(
    statusExportPendente({
      corte_id: 'c1',
      numero: 1,
      titulo: 'Corte',
      raw_pronto: true,
      ...patch,
    }),
  ).proxima?.verbo;

describe('a tira com as cenas sendo geradas', () => {
  it('não manda gerar o que já está gerando', () => {
    expect(verboDasCenas({ cenas_geradas: false, cenas_em_geracao: true })).toBe('gerando cenas');
  });

  it('também ao gerar de novo, com as cenas antigas ainda lá', () => {
    expect(verboDasCenas({ cenas_geradas: true, cenas_em_geracao: true })).toBe('gerando cenas');
  });

  it('sem geração, os verbos de sempre', () => {
    expect(verboDasCenas({ cenas_geradas: false, cenas_em_geracao: false })).toBe('gerar cenas');
    expect(verboDasCenas({ cenas_geradas: true })).toBe('validar cenas');
  });
});
