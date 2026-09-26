// D-353: aba "Chamadas de IA". Telemetria não-fatal de cada chamada do Claude CLI
// (etapa/modelo/custo/latência/tokens/sucesso), com prompt/resposta sob demanda.
// Separada da telemetria proposta×final (outra preocupação, outra aba).
import { Fragment, useState } from 'react';
import { ChevronDown, ChevronRight, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { type LlmCall } from '@/features/ia';
import { useLlmCalls } from './useLlmCalls';

function formatarTs(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'medium' });
}

function formatarCusto(usd: number | null): string {
  if (usd == null) return '—';
  return `$${usd.toFixed(4)}`;
}

function formatarLatencia(ms: number | null): string {
  if (ms == null) return '—';
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${Math.round(ms)}ms`;
}

function formatarTokens(entrada: number | null, saida: number | null): string {
  if (entrada == null && saida == null) return '—';
  return `${entrada ?? '?'} → ${saida ?? '?'}`;
}

function SucessoBadge({ call }: { call: LlmCall }) {
  const ok = call.sucesso;
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 font-code text-[10px] uppercase tracking-[0.06em]',
        ok
          ? 'bg-[var(--wb-accent-soft)] text-[var(--wb-accent)]'
          : 'bg-[var(--wb-bg-inset)] text-[var(--wb-err)]',
      )}
      title={call.erro_tipo ?? undefined}
    >
      {ok ? 'ok' : (call.erro_tipo ?? 'erro')}
    </span>
  );
}

function TextoBloco({ rotulo, texto }: { rotulo: string; texto: string | null }) {
  return (
    <div className="grid gap-1">
      <span className="font-code text-[10px] uppercase tracking-[0.08em] text-[var(--wb-text-dim)]">
        {rotulo}
      </span>
      <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-[var(--radius-sm)] border border-[var(--wb-border-soft)] bg-[var(--wb-bg-inset)] p-3 font-code text-[12px] leading-relaxed text-[var(--wb-text-mute)]">
        {texto || '—'}
      </pre>
    </div>
  );
}

function CallRow({ call }: { call: LlmCall }) {
  const [aberto, setAberto] = useState(false);
  return (
    <Fragment>
      <tr
        className="cursor-pointer border-t border-[var(--wb-border-soft)] align-top hover:bg-[var(--wb-bg-inset)]"
        onClick={() => setAberto((v) => !v)}
      >
        <td className="px-3 py-3 text-[var(--wb-text-dim)]">
          {aberto ? <ChevronDown size={15} aria-hidden /> : <ChevronRight size={15} aria-hidden />}
        </td>
        <td className="px-3 py-3 font-code text-[12px] text-[var(--wb-text-mute)]">
          {formatarTs(call.ts)}
        </td>
        <td className="px-3 py-3 text-[13px] text-[var(--wb-text)]">{call.etapa ?? '—'}</td>
        <td className="px-3 py-3 font-code text-[12px] text-[var(--wb-text-mute)]">
          {call.model ?? '—'}
        </td>
        <td className="px-3 py-3">
          <SucessoBadge call={call} />
        </td>
        <td className="px-3 py-3 font-code text-[12px] text-[var(--wb-text-mute)]">
          {formatarCusto(call.custo_usd)}
        </td>
        <td className="px-3 py-3 font-code text-[12px] text-[var(--wb-text-mute)]">
          {formatarLatencia(call.latencia_ms_wall)}
        </td>
        <td className="px-3 py-3 font-code text-[12px] text-[var(--wb-text-mute)]">
          {formatarTokens(call.tokens_in, call.tokens_out)}
        </td>
      </tr>
      {aberto && (
        <tr className="border-t border-[var(--wb-border-soft)] bg-[var(--wb-bg-card)]">
          <td colSpan={8} className="px-3 py-4">
            <div className="grid gap-3">
              <div className="flex flex-wrap gap-x-6 gap-y-1 font-code text-[11px] text-[var(--wb-text-dim)]">
                {call.projeto_id && <span>projeto: {call.projeto_id}</span>}
                {call.corte_id && <span>corte: {call.corte_id}</span>}
                {call.duracao_ms_servidor != null && (
                  <span>servidor: {formatarLatencia(call.duracao_ms_servidor)}</span>
                )}
              </div>
              <TextoBloco rotulo="Prompt" texto={call.prompt} />
              <TextoBloco rotulo="Resposta" texto={call.resposta} />
            </div>
          </td>
        </tr>
      )}
    </Fragment>
  );
}

export function LlmCallsTab() {
  const { data, isLoading, isError } = useLlmCalls(100);
  const chamadas = data?.chamadas ?? [];

  if (isLoading) {
    return (
      <p className="flex items-center gap-2 text-[15px] text-[var(--wb-text-mute)]">
        <Loader2 className="animate-spin" size={16} aria-hidden />
        Carregando chamadas de IA…
      </p>
    );
  }

  if (isError) {
    return (
      <div className="rounded-[var(--radius)] border border-[var(--wb-border-soft)] bg-[var(--wb-bg-card)] p-5 text-[14px] text-[var(--wb-err)]">
        Não foi possível carregar a telemetria de chamadas de IA.
      </div>
    );
  }

  if (chamadas.length === 0) {
    return (
      <div className="rounded-[var(--radius)] border border-dashed border-[var(--wb-border)] bg-[var(--wb-bg-card)] p-8 text-center">
        <p className="text-[15px] text-[var(--wb-text-mute)]">
          Nenhuma chamada de IA registrada ainda.
        </p>
        <p className="mt-1.5 text-[13px] text-[var(--wb-text-dim)]">
          A telemetria é populada assim que você <strong>roda uma geração via Claude</strong>{' '}
          (análise, trechos, cenas, metadados, thumbnail).
        </p>
      </div>
    );
  }

  return (
    <div className="grid content-start gap-4">
      <p className="text-[13px] text-[var(--wb-text-dim)]">
        {chamadas.length} chamada{chamadas.length === 1 ? '' : 's'} mais recente
        {chamadas.length === 1 ? '' : 's'}. Clique numa linha para ver o prompt e a resposta.
      </p>
      <div className="overflow-x-auto rounded-[var(--radius)] border border-[var(--wb-border-soft)]">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="bg-[var(--wb-bg-inset)] font-code text-[10px] uppercase tracking-[0.08em] text-[var(--wb-text-dim)]">
              <th className="px-3 py-2 font-medium" aria-label="Expandir" />
              <th className="px-3 py-2 font-medium">Quando</th>
              <th className="px-3 py-2 font-medium">Etapa</th>
              <th className="px-3 py-2 font-medium">Modelo</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium">Custo</th>
              <th className="px-3 py-2 font-medium">Latência</th>
              <th className="px-3 py-2 font-medium">Tokens (in→out)</th>
            </tr>
          </thead>
          <tbody>
            {chamadas.map((call) => (
              <CallRow key={call.id} call={call} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
