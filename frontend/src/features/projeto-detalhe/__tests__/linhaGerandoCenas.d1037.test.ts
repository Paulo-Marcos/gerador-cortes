import { describe, expect, it, vi } from 'vitest';
import { statusExportPendente } from '@/features/publicacao/statusExport';
import type { StatusExportCorte } from '@/types/models';
import { montarTira, resumoDaLinha } from '@/upgrade/tiraDoCorte';
import { montarProximoDaLinha } from '../acoesDaLinha';

// D-1037: com a cadeia do bruto em voo, a linha lia "com bruto, sem cenas" e dizia
// "Gerar cenas na Pós": o convite exato ao clique que paga a geração duas vezes.

const COM_BRUTO: Partial<StatusExportCorte> = { raw_pronto: true, cenas_em_geracao: true };
const RENDERIZADO = { video_pronto: true, grade_pronta: true, overlays_prontos: true };

function naLinha(status: Partial<StatusExportCorte>) {
  const ir = vi.fn();
  const tira = montarTira(
    statusExportPendente({ corte_id: 'c7', numero: 7, titulo: 'Corte', ...status }),
    'aprovado',
  );
  return { ir, tira, passo: montarProximoDaLinha(tira, 'p1', 'c7', ir, undefined) };
}

describe('a linha com as cenas sendo geradas', () => {
  it.each<[string, Partial<StatusExportCorte>]>([
    ['sem cenas: a cadeia do bruto em voo', COM_BRUTO],
    ['com cenas por validar: gerando de novo', { ...COM_BRUTO, cenas_geradas: true }],
    [
      'com cenas validadas: gerar de novo as substitui e leva a marca',
      { ...COM_BRUTO, cenas_geradas: true, cenas_validadas: true },
    ],
    ['já renderizado', { ...COM_BRUTO, ...RENDERIZADO }],
  ])('%s: diz que está gerando, sem mandar gerar, validar nem renderizar', (_nome, status) => {
    const { tira, passo } = naLinha(status);

    expect(passo.texto).toBe('Gerando cenas na Pós');
    expect(resumoDaLinha(tira)).toContain('gerando cenas');
  });

  it('o clique só leva à Pós, onde se acompanha: nada dispara', () => {
    const { ir, passo } = naLinha(COM_BRUTO);

    passo.acao();

    expect(ir).toHaveBeenCalledExactlyOnceWith('/projetos/p1/post-production?corte=c7');
  });

  it('a etapa fica em "agora", não em "feita", enquanto a geração roda', () => {
    const { tira } = naLinha({ ...COM_BRUTO, cenas_geradas: true, cenas_validadas: true });

    expect(tira.proxima?.nome).toBe('Cenas');
    expect(tira.proxima?.estado).toBe('agora');
  });

  it.each<[string, Partial<StatusExportCorte>, string]>([
    ['sem cenas', { raw_pronto: true }, 'Gerar cenas na Pós'],
    ['por validar', { raw_pronto: true, cenas_geradas: true }, 'Validar cenas na Pós'],
    [
      'validadas',
      { raw_pronto: true, cenas_geradas: true, cenas_validadas: true },
      'Renderizar na Pós',
    ],
  ])('terminada a geração, %s: volta o passo de sempre', (_nome, status, texto) => {
    expect(naLinha({ ...status, cenas_em_geracao: false }).passo.texto).toBe(texto);
  });
});
