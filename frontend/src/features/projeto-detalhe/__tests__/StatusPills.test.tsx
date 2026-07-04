import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import type { StatusExportCorte } from '@/types/models';
import { StatusPills, buildStatusPills } from '../StatusPills';

function makeStatus(patch: Partial<StatusExportCorte> = {}): StatusExportCorte {
  return {
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
  };
}

function render(corte: StatusExportCorte) {
  return renderToStaticMarkup(
    <TooltipProvider>
      <StatusPills corte={corte} />
    </TooltipProvider>,
  );
}

describe('buildStatusPills (F-018)', () => {
  it('ordena as pills como Bruto -> Cenas -> Graded -> Overlays -> Final -> YouTube -> Thumb -> Meta', () => {
    // Cenas validadas vem antes do render final. Render final tem 3 fases
    // visiveis (graded, overlays, composicao final). YouTube fecha o ciclo.
    const pills = buildStatusPills(makeStatus());

    expect(pills.map((p) => p.label)).toEqual([
      'Bruto',
      'Cenas',
      'Graded',
      'Overlays',
      'Final',
      'YouTube',
      'Thumb',
      'Meta',
    ]);
  });

  it('a pill Cenas so e marcada quando cenas_validadas e true', () => {
    const findCenas = (status: StatusExportCorte) =>
      buildStatusPills(status).find((p) => p.label === 'Cenas')!;

    const semCenas = findCenas(makeStatus({ cenas_geradas: false, cenas_validadas: false }));
    expect(semCenas.done).toBe(false);

    const apenasGeradas = findCenas(makeStatus({ cenas_geradas: true, cenas_validadas: false }));
    expect(apenasGeradas.done).toBe(false);
    expect(apenasGeradas.hint).toMatch(/aguardando validacao/i);

    const validadas = findCenas(makeStatus({ cenas_geradas: true, cenas_validadas: true }));
    expect(validadas.done).toBe(true);
    expect(validadas.hint).toMatch(/validadas/i);
  });

  it('marca Graded quando grade_pronta = true (fase 1 do render final)', () => {
    const graded = buildStatusPills(makeStatus({ grade_pronta: true })).find(
      (p) => p.label === 'Graded',
    )!;
    expect(graded.done).toBe(true);
  });

  it('marca Overlays quando overlays_prontos = true (fase 2 do render final)', () => {
    const overlays = buildStatusPills(makeStatus({ overlays_prontos: true })).find(
      (p) => p.label === 'Overlays',
    )!;
    expect(overlays.done).toBe(true);
  });

  it('marca Final quando video_pronto = true (render completo)', () => {
    const final = buildStatusPills(makeStatus({ video_pronto: true })).find(
      (p) => p.label === 'Final',
    )!;
    expect(final.done).toBe(true);
  });

  it('a pill YouTube reflete youtube_url_publicado e agendamento', () => {
    const findYt = (status: StatusExportCorte) =>
      buildStatusPills(status).find((p) => p.label === 'YouTube')!;

    const naoPublicado = findYt(makeStatus());
    expect(naoPublicado.done).toBe(false);
    expect(naoPublicado.hint).toMatch(/nao publicado/i);

    const agendado = findYt(makeStatus({ youtube_scheduled_at: '2026-06-01T15:00:00Z' }));
    expect(agendado.done).toBe(false);
    expect(agendado.hint).toMatch(/agendado/i);

    const publicado = findYt(makeStatus({ youtube_url_publicado: 'https://youtu.be/abc' }));
    expect(publicado.done).toBe(true);
    expect(publicado.hint).toMatch(/publicado/i);
  });
});

describe('StatusPills (render)', () => {
  it('renderiza data-testid e data-done para cada pill', () => {
    const html = render(
      makeStatus({
        raw_pronto: true,
        grade_pronta: true,
        cenas_geradas: true,
        cenas_validadas: true,
        video_pronto: false,
        thumbnail_pronta: false,
        metadados_completos: false,
      }),
    );

    expect(html).toContain('data-testid="status-pill-bruto"');
    expect(html).toContain('data-testid="status-pill-cenas"');
    expect(html).toContain('data-testid="status-pill-graded"');
    expect(html).toContain('data-testid="status-pill-overlays"');
    expect(html).toContain('data-testid="status-pill-final"');
    expect(html).toContain('data-testid="status-pill-youtube"');
    expect(html).toContain('data-testid="status-pill-thumb"');
    expect(html).toContain('data-testid="status-pill-meta"');
  });

  it('aplica data-done=true apenas nas pills concluidas', () => {
    const html = render(
      makeStatus({
        raw_pronto: true,
        grade_pronta: true,
        cenas_geradas: true,
        cenas_validadas: false,
        video_pronto: false,
      }),
    );

    expect(html).toMatch(/data-testid="status-pill-bruto"[^>]*data-done="true"/);
    expect(html).toMatch(/data-testid="status-pill-graded"[^>]*data-done="true"/);
    expect(html).toMatch(/data-testid="status-pill-cenas"[^>]*data-done="false"/);
    expect(html).toMatch(/data-testid="status-pill-final"[^>]*data-done="false"/);
  });
});
