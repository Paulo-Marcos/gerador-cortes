// D-353 / D-1176: aba "Chamadas de IA". Telemetria não-fatal de cada chamada do Claude CLI
// (etapa/modelo/custo/latência/tokens/sucesso), com prompt/resposta sob demanda.
// Separada da telemetria proposta×final (outra preocupação, outra aba).
import { Fragment, useState } from 'react';
import { EstadoDeErro } from '@/components/ui/estado-de-erro';
import { EstadoVazio } from '@/components/ui/estado-vazio';
import { Selo } from '@/components/ui/selo';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Tabela,
  TabelaCabeca,
  TabelaCelula,
  TabelaCorpo,
  TabelaLinha,
  TabelaTitulo,
} from '@/components/ui/tabela';
import { type LlmCall } from '@/features/ia';
import { useLlmCalls } from './useLlmCalls';
import { Icon } from '@/upgrade/Icon';

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
  return call.sucesso ? (
    <Selo tom="ok">ok</Selo>
  ) : (
    <span title={call.erro_tipo ?? undefined}>
      <Selo tom="erro">{call.erro_tipo ?? 'erro'}</Selo>
    </span>
  );
}

function TextoBloco({ rotulo, texto }: { rotulo: string; texto: string | null }) {
  return (
    <div className="grid gap-1">
      <span className="text-micro text-fg-3">{rotulo}</span>
      <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-etiqueta border border-fio bg-poco p-3 num text-pequeno leading-relaxed text-fg-2">
        {texto || '—'}
      </pre>
    </div>
  );
}

function CallRow({ call }: { call: LlmCall }) {
  const [aberto, setAberto] = useState(false);
  return (
    <Fragment>
      <TabelaLinha className="cursor-pointer" onClick={() => setAberto((v) => !v)}>
        <TabelaCelula className="text-fg-3">
          <button
            type="button"
            aria-expanded={aberto}
            aria-label={aberto ? 'Recolher a chamada' : 'Ver o prompt e a resposta'}
            className="grid place-items-center rounded-etiqueta text-fg-3 hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-foco"
          >
            <Icon name={aberto ? 'chevron-down' : 'chevron-right'} size={16} />
          </button>
        </TabelaCelula>
        <TabelaCelula numero className="text-fg-2">{formatarTs(call.ts)}</TabelaCelula>
        <TabelaCelula>{call.etapa ?? '—'}</TabelaCelula>
        <TabelaCelula numero className="text-fg-2">{call.model ?? '—'}</TabelaCelula>
        <TabelaCelula>
          <SucessoBadge call={call} />
        </TabelaCelula>
        <TabelaCelula numero aDireita className="text-fg-2">{formatarCusto(call.custo_usd)}</TabelaCelula>
        <TabelaCelula numero aDireita className="text-fg-2">{formatarLatencia(call.latencia_ms_wall)}</TabelaCelula>
        <TabelaCelula numero aDireita className="text-fg-2">{formatarTokens(call.tokens_in, call.tokens_out)}</TabelaCelula>
      </TabelaLinha>
      {aberto && (
        <tr>
          <td colSpan={8} className="border-b border-fio bg-vidro px-3 py-4">
            <div className="grid gap-3">
              <div className="flex flex-wrap gap-x-6 gap-y-1 num text-pequeno text-fg-3">
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
  const { data, isLoading, isError, refetch } = useLlmCalls(100);
  const chamadas = data?.chamadas ?? [];

  if (isLoading) {
    return (
      <div role="status" className="grid gap-3">
        <p className="text-pequeno text-fg-3">Buscando as chamadas de IA…</p>
        <Skeleton className="h-[72px] w-full" />
      </div>
    );
  }

  if (isError) {
    return (
      <EstadoDeErro
        titulo="Não foi possível carregar as chamadas de IA"
        motivo="A telemetria não respondeu. Tente de novo em instantes."
        aoTentar={() => void refetch()}
      />
    );
  }

  if (chamadas.length === 0) {
    return (
      <EstadoVazio
        icone="brain"
        titulo="Nenhuma chamada de IA registrada ainda"
        descricao="A telemetria nasce quando você roda uma geração via Claude: análise, trechos, cenas, metadados ou capa."
      />
    );
  }

  return (
    <div className="grid content-start gap-4">
      <p className="text-pequeno text-fg-3">
        {chamadas.length} chamada{chamadas.length === 1 ? '' : 's'} mais recente
        {chamadas.length === 1 ? '' : 's'}. Clique numa linha para ver o prompt e a resposta.
      </p>
      <div className="overflow-x-auto rounded-cartao border border-fio bg-vidro">
        <Tabela>
          <TabelaCabeca>
            <TabelaLinha>
              <TabelaTitulo aria-label="Expandir" />
              <TabelaTitulo>Quando</TabelaTitulo>
              <TabelaTitulo>Etapa</TabelaTitulo>
              <TabelaTitulo>Modelo</TabelaTitulo>
              <TabelaTitulo>Status</TabelaTitulo>
              <TabelaTitulo aDireita>Custo</TabelaTitulo>
              <TabelaTitulo aDireita>Latência</TabelaTitulo>
              <TabelaTitulo aDireita>Tokens (in→out)</TabelaTitulo>
            </TabelaLinha>
          </TabelaCabeca>
          <TabelaCorpo>
            {chamadas.map((call) => (
              <CallRow key={call.id} call={call} />
            ))}
          </TabelaCorpo>
        </Tabela>
      </div>
    </div>
  );
}
