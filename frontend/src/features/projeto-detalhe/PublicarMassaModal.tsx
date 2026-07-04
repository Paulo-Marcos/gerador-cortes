import { useEffect, useMemo, useState } from 'react';
import { Calendar, CheckCircle2, Loader2, Rocket, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Modal } from '@/components/ui/modal';
import { api } from '@/lib/api';
import type { BulkYoutubeRequest, StatusExportCorte } from '@/types/models';

interface Props {
  open: boolean;
  onClose: () => void;
  projetoId: string;
  cortesProntos: StatusExportCorte[];
}

const SPACING_MIN = 15;

interface ResultadoPorCorte {
  corteId: string;
  numero: number;
  scheduledAt: string;
  status: 'aguardando' | 'enfileirado' | 'erro';
  mensagem?: string;
}

function nowPlusOneHourLocal(): string {
  const d = new Date(Date.now() + 60 * 60 * 1000);
  // formato datetime-local: YYYY-MM-DDTHH:mm
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;
}

type BulkYoutubePayload = BulkYoutubeRequest & { scheduled_dates: Array<string | null> };

export function PublicarMassaModal({ open, onClose, projetoId, cortesProntos }: Props) {
  const totalProntos = cortesProntos.length;
  const [quantidade, setQuantidade] = useState(totalProntos);
  const [inicio, setInicio] = useState(nowPlusOneHourLocal());
  const [resultados, setResultados] = useState<ResultadoPorCorte[]>([]);
  const [enviando, setEnviando] = useState(false);

  // Resetar quando abrir
  useEffect(() => {
    if (!open) return;
    setQuantidade(totalProntos);
    setInicio(nowPlusOneHourLocal());
    setResultados([]);
    setEnviando(false);
  }, [open, totalProntos]);

  // Gera agenda (corte → ISO scheduled_at)
  const agenda = useMemo(() => {
    const inicioMs = new Date(inicio).getTime();
    if (Number.isNaN(inicioMs)) return [];
    const lista = cortesProntos.slice(0, Math.max(0, Math.min(quantidade, totalProntos)));
    return lista.map((c, i) => ({
      corteId: c.corte_id,
      numero: c.numero,
      titulo: c.titulo_youtube || c.titulo,
      scheduledAt: new Date(inicioMs + i * SPACING_MIN * 60 * 1000).toISOString(),
    }));
  }, [cortesProntos, inicio, quantidade, totalProntos]);

  const onPublicar = async () => {
    if (agenda.length === 0) return;
    setEnviando(true);
    const inicial: ResultadoPorCorte[] = agenda.map((a) => ({
      corteId: a.corteId,
      numero: a.numero,
      scheduledAt: a.scheduledAt,
      status: 'aguardando',
    }));
    setResultados(inicial);

    // Backend segura a fila; o navegador só dispara o lote.
    const payload: BulkYoutubePayload = {
      corte_ids: agenda.map((item) => item.corteId),
      agendar: true,
      videos_por_dia: agenda.length,
      data_inicio: agenda[0]?.scheduledAt,
      hora_publicacao: '00:00',
      scheduled_dates: agenda.map((item) => item.scheduledAt),
    };

    try {
      const res = await api.bulkYoutube(projetoId, payload);
      setResultados((prev) =>
        prev.map((r) => ({ ...r, status: 'enfileirado', mensagem: res.message })),
      );
    } catch (err) {
      setResultados((prev) =>
        prev.map((r) => ({ ...r, status: 'erro', mensagem: (err as Error).message })),
      );
    }
    setEnviando(false);
  };

  const fmtHora = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={
        <span className="flex items-center gap-2">
          <Rocket size={18} className="text-accent-300" /> Publicar em massa
        </span>
      }
      description={`Cada lançamento espaçado de ${SPACING_MIN} minutos a partir do horário inicial.`}
    >
      {totalProntos === 0 ? (
        <div className="rounded-[var(--radius-sm)] border border-[var(--border)] bg-bg-900/60 p-4 text-center text-sm text-text-300">
          Nenhum corte pronto para publicar no momento.
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {/* Inputs */}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="qtd">Quantidade (máx. {totalProntos})</Label>
              <Input
                id="qtd"
                type="number"
                min={1}
                max={totalProntos}
                value={quantidade}
                onChange={(e) =>
                  setQuantidade(Math.max(1, Math.min(totalProntos, Number(e.target.value) || 1)))
                }
                disabled={enviando}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="inicio">
                <Calendar size={12} className="mr-1 inline" /> Início
              </Label>
              <Input
                id="inicio"
                type="datetime-local"
                value={inicio}
                onChange={(e) => setInicio(e.target.value)}
                disabled={enviando}
              />
            </div>
          </div>

          {/* Preview da agenda */}
          <div className="flex flex-col gap-1">
            <p className="text-xs font-medium text-text-300">
              📅 Agenda ({agenda.length} {agenda.length === 1 ? 'corte' : 'cortes'})
            </p>
            <div className="max-h-56 overflow-y-auto rounded-[var(--radius-sm)] border border-[var(--border)] bg-bg-900/40">
              <ul className="divide-y divide-[var(--border)]">
                {agenda.map((a) => {
                  const r = resultados.find((x) => x.corteId === a.corteId);
                  return (
                    <li key={a.corteId} className="flex items-center gap-2 px-3 py-1.5 text-[12px]">
                      <span className="w-8 shrink-0 font-mono tabular-nums text-text-400">
                        #{a.numero}
                      </span>
                      <span className="flex-1 truncate text-text-200" title={a.titulo}>
                        {a.titulo}
                      </span>
                      <span className="shrink-0 font-mono tabular-nums text-accent-300">
                        {fmtHora(a.scheduledAt)}
                      </span>
                      <span className="w-5 shrink-0">
                        {r?.status === 'enfileirado' && (
                          <span title={r.mensagem ?? 'enfileirado'}>
                            <CheckCircle2 size={14} className="text-emerald-400" />
                          </span>
                        )}
                        {r?.status === 'erro' && (
                          <span title={r.mensagem ?? 'erro'}>
                            <XCircle size={14} className="text-error" />
                          </span>
                        )}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        </div>
      )}

      <div className="mt-5 flex items-center justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onClose} disabled={enviando}>
          {enviando ? 'Aguarde...' : 'Fechar'}
        </Button>
        {totalProntos > 0 && (
          <Button type="button" onClick={onPublicar} disabled={enviando || agenda.length === 0}>
            {enviando ? <Loader2 size={16} className="animate-spin" /> : <Rocket size={16} />}
            Publicar {agenda.length} {agenda.length === 1 ? 'corte' : 'cortes'}
          </Button>
        )}
      </div>
    </Modal>
  );
}
