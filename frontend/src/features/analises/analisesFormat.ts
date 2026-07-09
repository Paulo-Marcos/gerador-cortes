// E-022: helpers puros de formatação da Área de Análises (telemetria + YouTube).
// Sem I/O e sem React — cobertos por teste unitário (analisesFormat.test.ts).
import type { TelemetriaSituacao } from '@/lib/api';

/** Segundos → "M:SS" ou "H:MM:SS" (sinal absoluto, para bordas/durações). */
export function formatarSeg(seg: number | null | undefined): string {
  if (seg == null || Number.isNaN(seg)) return '—';
  const total = Math.round(Math.abs(seg));
  const horas = Math.floor(total / 3600);
  const minutos = Math.floor((total % 3600) / 60);
  const segundos = total % 60;
  const mm = String(minutos).padStart(horas > 0 ? 2 : 1, '0');
  const ss = String(segundos).padStart(2, '0');
  return horas > 0 ? `${horas}:${mm}:${ss}` : `${mm}:${ss}`;
}

/**
 * Delta em segundos → "+2.5s" / "−1.0s" / "0s". Usa o sinal de menos tipográfico
 * e devolve string vazia de rótulo neutro quando o valor é nulo (sem proposta).
 */
export function formatarDelta(seg: number | null | undefined): string {
  if (seg == null || Number.isNaN(seg)) return '—';
  const arred = Math.round(seg * 10) / 10;
  if (arred === 0) return '0s';
  const sinal = arred > 0 ? '+' : '−';
  return `${sinal}${Math.abs(arred).toFixed(1)}s`;
}

/** Tom semântico do delta: expandiu (>0), encolheu (<0) ou intacto. */
export function tomDelta(seg: number | null | undefined): 'pos' | 'neg' | 'zero' | 'nulo' {
  if (seg == null || Number.isNaN(seg)) return 'nulo';
  const arred = Math.round(seg * 10) / 10;
  if (arred > 0) return 'pos';
  if (arred < 0) return 'neg';
  return 'zero';
}

/** Percentual (já em 0–100) → "45.2%". */
export function formatarPct(pct: number | null | undefined): string {
  if (pct == null || Number.isNaN(pct)) return '—';
  return `${pct.toFixed(1)}%`;
}

/** Inteiro grande → "12.345" (separador pt-BR). */
export function formatarNumero(valor: number | null | undefined): string {
  if (valor == null || Number.isNaN(valor)) return '—';
  return valor.toLocaleString('pt-BR');
}

const ROTULOS_SITUACAO: Record<TelemetriaSituacao, string> = {
  com_snapshot: 'Proposta da IA',
  sem_proposta_ia: 'Feito na mão',
  sem_snapshot: 'Legado (sem snapshot)',
};

/** Rótulo legível da situação do corte na telemetria. */
export function rotuloSituacao(situacao: TelemetriaSituacao): string {
  return ROTULOS_SITUACAO[situacao] ?? situacao;
}

/** Soma total de um mapa origem→contagem (ex.: desvios adicionados por origem). */
export function somarOrigens(mapa: Record<string, number> | null | undefined): number {
  if (!mapa) return 0;
  return Object.values(mapa).reduce((acc, n) => acc + (n || 0), 0);
}

/**
 * Serializa um mapa origem→contagem em "claude 2 · manual 1", ordenado por
 * contagem desc. Vazio → "—".
 */
export function resumirOrigens(mapa: Record<string, number> | null | undefined): string {
  if (!mapa) return '—';
  const pares = Object.entries(mapa)
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1]);
  if (pares.length === 0) return '—';
  return pares.map(([origem, n]) => `${origem} ${n}`).join(' · ');
}
