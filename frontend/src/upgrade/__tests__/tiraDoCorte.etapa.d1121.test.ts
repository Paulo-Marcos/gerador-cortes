import { describe, expect, it } from 'vitest';
import { statusExportPendente } from '@/features/publicacao/statusExport';
import { montarTira } from '../tiraDoCorte';

// D-1121: cada etapa ganha o nome para LER, para o medidor trocar as siglas. A chave
// (`nome`, vinda de `buildStatusPills`) não muda: a lógica da tira e os testes antigos a usam.

const tira = montarTira(
  statusExportPendente({
    corte_id: 'c',
    numero: 1,
    titulo: 'Corte',
    raw_pronto: false,
    grade_pronta: false,
    overlays_prontos: false,
    cenas_geradas: false,
    cenas_validadas: false,
    video_pronto: false,
    thumbnail_pronta: false,
    metadados_completos: false,
    pronto_publicar: false,
  }),
);
const pips = tira.grupos.flatMap((g) => g.pips);

describe('Pip.etapa (D-1121)', () => {
  it('as oito etapas se leem em português, na ordem do fluxo', () => {
    expect(pips.map((p) => p.etapa)).toEqual([
      'Bruto',
      'Cenas',
      'Filtro',
      'Overlays',
      'Final',
      'Capa',
      'Metadados',
      'YouTube',
    ]);
  });

  it('a chave `nome` continua a de antes (Graded, Thumb, Meta), sem tradução', () => {
    expect(pips.map((p) => p.nome)).toEqual([
      'Bruto',
      'Cenas',
      'Graded',
      'Overlays',
      'Final',
      'Thumb',
      'Meta',
      'YouTube',
    ]);
  });

  it('a sigla e o verbo seguem como estavam', () => {
    expect(pips.map((p) => p.sigla)).toEqual([
      'BRU',
      'CEN',
      'GRD',
      'OVL',
      'FIN',
      'THU',
      'MET',
      'YT',
    ]);
    expect(pips[2].verbo).toBe('aplicar filtro');
  });

  it('nenhum nome legível é uma sigla de 3 letras', () => {
    for (const p of pips) expect(p.etapa).not.toMatch(/^[A-Z]{2,3}$/);
  });
});
