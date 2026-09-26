import { describe, expect, it } from 'vitest';
import type { StatusExportCorte } from '@/types/models';
import { montarTira, textoDaProxima } from '../tiraDoCorte';
import { statusExportPendente } from '@/features/publicacao/statusExport';

function status(patch: Partial<StatusExportCorte> = {}): StatusExportCorte {
  return statusExportPendente({
    corte_id: 'corte-1',
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
    ...patch,
  });
}

const estados = (t: ReturnType<typeof montarTira>) =>
  Object.fromEntries(t.grupos.flatMap((g) => g.pips).map((p) => [p.sigla, p.estado]));

describe('montarTira', () => {
  it('agrupa em CENAS · RENDER · PUBLICAÇÃO, na ordem do fluxo', () => {
    const t = montarTira(status());
    expect(t.grupos.map((g) => [g.nome, g.pips.map((p) => p.sigla)])).toEqual([
      ['CENAS', ['BRU', 'CEN']],
      ['RENDER', ['GRD', 'OVL', 'FIN']],
      ['PUBLICAÇÃO', ['THU', 'MET', 'YT']],
    ]);
  });

  it('cenas validadas sem render: para no graded (5A)', () => {
    const t = montarTira(status({ raw_pronto: true, cenas_validadas: true }));
    expect(estados(t)).toMatchObject({ BRU: 'feito', CEN: 'feito', GRD: 'agora', FIN: 'falta', YT: 'falta' });
    expect(t.contagem).toBe('2/8');
    expect(textoDaProxima(t)).toBe('próximo: graded');
  });

  it('renderizado e sem capa aponta a capa, não o YouTube', () => {
    const t = montarTira(
      status({ raw_pronto: true, cenas_validadas: true, grade_pronta: true, overlays_prontos: true, video_pronto: true }),
    );
    expect(t.proxima?.sigla).toBe('THU');
  });

  it('corte rejeitado: primeiro pip em erro, nenhum âmbar, sem próxima (5C)', () => {
    const t = montarTira(status({ raw_pronto: true }), 'rejeitado');
    const e = Object.values(estados(t));
    expect(e[0]).toBe('rejeitado');
    expect(e).not.toContain('agora');
    expect(t.proxima).toBeUndefined();
  });

  it('corte no ar com mídia limpa não aponta etapa para trás', () => {
    const t = montarTira(
      status({ raw_pronto: true, thumbnail_pronta: true, metadados_completos: true, youtube_url_publicado: 'https://youtu.be/x' }),
    );
    expect(t.proxima).toBeUndefined();
    expect(Object.values(estados(t))).not.toContain('agora');
    expect(textoDaProxima(t)).toBe('no ar');
  });

  it('corte 8/8: nenhum âmbar (5D)', () => {
    const t = montarTira(
      status({
        raw_pronto: true,
        cenas_validadas: true,
        grade_pronta: true,
        overlays_prontos: true,
        video_pronto: true,
        thumbnail_pronta: true,
        metadados_completos: true,
        youtube_url_publicado: 'https://youtu.be/x',
      }),
    );
    expect(t.contagem).toBe('8/8');
    expect(Object.values(estados(t))).not.toContain('agora');
    expect(textoDaProxima(t)).toBe('no ar');
  });

  it('sem nada feito e sem publicar, nada pendente só quando rejeitado', () => {
    expect(textoDaProxima(montarTira(status(), 'rejeitado'))).toBe('nada pendente');
  });
});
