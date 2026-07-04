/**
 * Utilitários de tempo: HH:MM:SS.fff <-> segundos.
 */

const FPS_DEFAULT = 30;

export function segParaHms(seg: number, comMs = false): string {
  if (!Number.isFinite(seg) || seg < 0) seg = 0;
  const h = Math.floor(seg / 3600);
  const m = Math.floor((seg % 3600) / 60);
  const s = Math.floor(seg % 60);
  const ms = Math.floor((seg - Math.floor(seg)) * 1000);
  const base = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return comMs ? `${base}.${String(ms).padStart(3, '0')}` : base;
}

export function hmsParaSeg(hms: string): number {
  if (!hms) return 0;
  const [hp, mp, sp = '0'] = hms.split(':');
  const [sec, ms = '0'] = sp.split('.');
  const h = Number(hp) || 0;
  const m = Number(mp) || 0;
  const s = Number(sec) || 0;
  const millis = Number((ms + '00').slice(0, 3)) || 0;
  return h * 3600 + m * 60 + s + millis / 1000;
}

export function validarHms(hms: string): boolean {
  return /^\d{1,2}:\d{2}:\d{2}(\.\d{1,3})?$/.test(hms.trim());
}

/** Avança/retrocede 1 frame assumindo fps. */
export function frameStep(seg: number, dir: 1 | -1, fps = FPS_DEFAULT): number {
  return Math.max(0, seg + dir / fps);
}

/**
 * Calcula os segmentos mantidos após remover os trechos (desvios) do
 * intervalo [inicio, fim].  Replica EXATAMENTE o algoritmo do backend em
 * `app.domain.segment_calculator.calcular_segmentos` — merge sequencial de
 * sobreposições + threshold defensivo de 0.1s para descartar micro-fatias.
 *
 * Por que existir: o helper anterior somava o overlap de cada desvio com o
 * intervalo, ignorando sobreposições entre desvios. Em cortes com muitos
 * desvios sobrepostos (silêncios + editoriais cobrindo a mesma região),
 * isso descontava o mesmo tempo várias vezes e gerava uma duração líquida
 * artificialmente pequena. O Player então mostrava cronômetro errado e
 * travava o scrubber antes do fim real do arquivo.
 */
export function calcularSegmentosLiquidos(
  inicioSeg: number,
  fimSeg: number,
  desvios?: { inicio_hms: string; fim_hms: string }[],
): { start: number; end: number }[] {
  const segs: { start: number; end: number }[] = [];
  if (fimSeg <= inicioSeg) return [];

  const ordenados = (desvios ?? [])
    .map((d) => ({ ini: hmsParaSeg(d.inicio_hms), fim: hmsParaSeg(d.fim_hms) }))
    .sort((a, b) => a.ini - b.ini);

  let cursor = inicioSeg;
  for (const d of ordenados) {
    const dIni = Math.max(d.ini, cursor);
    const dFim = Math.min(d.fim, fimSeg);
    if (dFim <= dIni) continue;
    if (dIni > cursor && dIni - cursor > 0.1) {
      segs.push({ start: round3(cursor), end: round3(dIni) });
    }
    cursor = dFim;
  }
  if (cursor < fimSeg && fimSeg - cursor > 0.1) {
    segs.push({ start: round3(cursor), end: round3(fimSeg) });
  }

  return segs.length > 0 ? segs : [{ start: round3(inicioSeg), end: round3(fimSeg) }];
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

/**
 * Duração líquida do corte: soma das durações dos segmentos mantidos após
 * remover trechos (com merge de sobreposições).  Esse valor bate com a
 * duração real do arquivo `clip_raw.mkv` gerado pelo backend.
 */
export function calcularDuracaoLiquida(
  inicioSeg: number,
  fimSeg: number,
  desvios?: { inicio_hms: string; fim_hms: string }[],
): number {
  return calcularSegmentosLiquidos(inicioSeg, fimSeg, desvios).reduce(
    (sum, s) => sum + (s.end - s.start),
    0,
  );
}

/** Formata duração curta em mm:ss.f para overlays. */
export function segParaMmSs(seg: number, comDecimal = false): string {
  if (!Number.isFinite(seg) || seg < 0) seg = 0;
  const m = Math.floor(seg / 60);
  const s = seg - m * 60;
  if (comDecimal) {
    return `${String(m).padStart(2, '0')}:${s.toFixed(1).padStart(4, '0')}`;
  }
  return `${String(m).padStart(2, '0')}:${String(Math.floor(s)).padStart(2, '0')}`;
}
