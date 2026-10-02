import { describe, expect, it } from 'vitest';
import { statusExportPendente } from '@/features/publicacao/statusExport';
import { buildStatusPills } from '../StatusPills';

// D-861: cada etapa da fita do corte tem um ícone, que a D-857 passou a dar
// por nome (antes era o componente do lucide). O mapa é o de antes da troca —
// conferido contra a versão anterior — e a ordem é a do fluxo (D-746).
describe('buildStatusPills — ícone de cada etapa', () => {
  it('dá a cada etapa, na ordem do fluxo, o ícone dela', () => {
    const pills = buildStatusPills(
      statusExportPendente({ corte_id: 'corte-1', numero: 1, titulo: 'Corte' }),
    );
    expect(pills.map((p) => [p.label, p.icone])).toEqual([
      ['Bruto', 'scissors'],
      ['Cenas', 'clapperboard'],
      ['Graded', 'palette'],
      ['Overlays', 'sparkles'],
      ['Final', 'film'],
      ['Thumb', 'image'],
      ['Meta', 'tags'],
      ['YouTube', 'youtube'],
    ]);
  });
});
