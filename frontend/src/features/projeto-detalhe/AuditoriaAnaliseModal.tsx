import { AlertTriangle, ClipboardCheck, Loader2, Trash2 } from 'lucide-react';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { useAuditoriaAnalise } from '@/hooks/useProjetoDetalhe';
import type { AuditoriaCorteItem } from '@/types/models';

interface Props {
  open: boolean;
  onClose: () => void;
  projetoId: string;
}

/**
 * I-034: painel de auditoria da última análise IA.
 *
 * Mostra, para cada corte, a `justificativa` editorial que a skill
 * `cortador-expert` emitiu — o "porquê" da decisão de virar corte (em vez
 * de virar desvio ou ser descartado). Lista também os blocos `descartados`
 * (NÃO_RECOMENDADOS) para auditar o filtro editorial completo.
 *
 * Não muda nada no projeto — é só leitura.
 */
export function AuditoriaAnaliseModal({ open, onClose, projetoId }: Props) {
  const query = useAuditoriaAnalise(projetoId, open);
  const data = query.data;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={
        <span className="flex items-center gap-2">
          <ClipboardCheck size={18} /> Auditoria da análise IA
        </span>
      }
      description="Por que cada corte virou corte (e o que foi descartado)."
      size="xl"
      footer={
        <Button type="button" variant="outline" onClick={onClose}>
          Fechar
        </Button>
      }
    >
      {query.isLoading && (
        <div className="flex items-center justify-center gap-2 py-8 text-sm text-text-300">
          <Loader2 size={16} className="animate-spin" /> Carregando…
        </div>
      )}

      {query.isError && (
        <div className="flex items-start gap-2 rounded-md border border-error/30 bg-error/10 px-3 py-2 text-sm text-[#fca5a5]">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <span>Falha ao carregar a auditoria: {(query.error as Error).message}</span>
        </div>
      )}

      {data && (
        <div className="flex flex-col gap-5">
          <Resumo
            total={data.total_cortes}
            duracaoMedia={data.duracao_media_min}
            ultimaAnalise={data.ultima_analise_em}
            totalDescartados={data.descartados.length}
          />

          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-text-300">
              Cortes ({data.cortes.length})
            </h3>
            {data.cortes.length === 0 ? (
              <p className="text-sm text-text-400">
                Nenhum corte para auditar. Rode a Análise IA primeiro.
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {data.cortes.map((c) => (
                  <CorteRow key={c.id} corte={c} />
                ))}
              </ul>
            )}
          </section>

          <section>
            <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-text-300">
              <Trash2 size={12} /> Descartados ({data.descartados.length})
            </h3>
            {data.descartados.length === 0 ? (
              <p className="text-sm text-text-400">
                A IA não descartou nenhum bloco — ou esta análise rodou antes de I-034 (sem audit
                trail persistido).
              </p>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {data.descartados.map((d, i) => (
                  <li
                    key={i}
                    className="rounded-md border border-[var(--border)] bg-bg-900/40 px-3 py-2 text-sm"
                  >
                    <div className="font-medium text-text-100">{d.tema || '(sem tema)'}</div>
                    {d.motivo && <div className="mt-0.5 text-xs text-text-300">{d.motivo}</div>}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </Modal>
  );
}

function Resumo({
  total,
  duracaoMedia,
  ultimaAnalise,
  totalDescartados,
}: {
  total: number;
  duracaoMedia: number;
  ultimaAnalise: string | null;
  totalDescartados: number;
}) {
  // 8 min é o mínimo absoluto da skill; abaixo disso a IA quebrou a própria regra.
  // 12 min é o piso da faixa "ideal" — útil pra diagnosticar "cortes encolhendo".
  const alertaMedia = duracaoMedia > 0 && duracaoMedia < 12;
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      <Stat label="Cortes" value={total.toString()} />
      <Stat
        label="Duração média"
        value={`${duracaoMedia.toFixed(1)} min`}
        warn={alertaMedia}
        hint={alertaMedia ? 'abaixo do ideal (12–22 min)' : undefined}
      />
      <Stat label="Descartados" value={totalDescartados.toString()} />
      <Stat
        label="Última análise"
        value={ultimaAnalise ? new Date(ultimaAnalise).toLocaleString() : '—'}
      />
    </div>
  );
}

function Stat({
  label,
  value,
  warn = false,
  hint,
}: {
  label: string;
  value: string;
  warn?: boolean;
  hint?: string;
}) {
  return (
    <div
      className={
        warn
          ? 'rounded-md border border-warn/40 bg-warn/10 px-3 py-2'
          : 'rounded-md border border-[var(--border)] bg-bg-900/40 px-3 py-2'
      }
    >
      <div className="text-[10px] font-semibold uppercase tracking-wider text-text-400">
        {label}
      </div>
      <div className="mt-0.5 text-sm font-semibold text-text-100">{value}</div>
      {hint && <div className="mt-0.5 text-[10px] text-warn">{hint}</div>}
    </div>
  );
}

function CorteRow({ corte }: { corte: AuditoriaCorteItem }) {
  // Mesmo critério: cortes abaixo de 8 min violam o mínimo absoluto da skill.
  const abaixoMinimo = corte.duracao_min > 0 && corte.duracao_min < 8;
  return (
    <li className="rounded-md border border-[var(--border)] bg-bg-900/40 px-3 py-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="text-sm font-semibold text-text-100">
          <span className="mr-2 font-mono text-text-400">#{corte.numero}</span>
          {corte.titulo_proposto || '(sem título)'}
        </div>
        <div
          className={
            abaixoMinimo
              ? 'rounded-full bg-warn/20 px-2 py-0.5 text-[11px] font-semibold text-warn'
              : 'text-[11px] text-text-400'
          }
          title={abaixoMinimo ? 'Abaixo do mínimo de 8 min definido pela skill' : undefined}
        >
          {corte.inicio_hms} → {corte.fim_hms} · {corte.duracao_min.toFixed(1)} min
        </div>
      </div>
      {corte.tema_central && (
        <div className="mt-1 text-xs text-text-300">
          <span className="font-semibold uppercase tracking-wider">Tema:</span> {corte.tema_central}
        </div>
      )}
      <div className="mt-1.5 text-xs leading-relaxed text-text-200">
        {corte.justificativa ? (
          corte.justificativa
        ) : (
          <span className="italic text-text-400">
            Sem justificativa registrada (corte gerado antes de I-034).
          </span>
        )}
      </div>
    </li>
  );
}
