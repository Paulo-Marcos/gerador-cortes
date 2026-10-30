import type { AlertaConferir } from '@/types/models';
import { Icon } from '@/upgrade/Icon';
import { segParaHms } from '../timeUtils';
import { useMarcarAlertaConferido } from '../useCortes';

// D-998: a faixa "Conferir" da timeline. A IA marcou uma afirmação duvidosa
// (número, data, autoria) que FICA no corte; o editor vai até ela, confere o
// fato e a dispensa. Não é trecho a remover: nada aqui mexe nos desvios.

interface FaixaProps {
  alertas: AlertaConferir[];
  onSeek: (seg: number) => void;
  onConferir: (alertaId: string) => void;
  /** O alerta cuja dispensa está a caminho do backend. */
  conferindoId?: string;
}

export function AlertasConferirFaixa({ alertas, onSeek, onConferir, conferindoId }: FaixaProps) {
  const pendentes = alertas.filter((alerta) => !alerta.conferido);
  if (pendentes.length === 0) return null;
  // Uma linha só, rolando de lado: o painel da timeline é baixo e a onda precisa
  // da altura que sobra.
  return (
    <div
      role="list"
      aria-label="Alertas para conferir"
      className="flex flex-shrink-0 items-center gap-1.5 overflow-x-auto whitespace-nowrap border-b border-[var(--wb-border-soft)] bg-[var(--wb-warn-soft)] px-3 py-1.5"
    >
      <span className="flex flex-none items-center gap-1 text-[11px] font-semibold text-[var(--wb-warn-ink)]">
        <Icon name="flag" />
        Conferir ({pendentes.length})
      </span>
      {pendentes.map((alerta) => (
        <div
          key={alerta.id}
          role="listitem"
          className="flex max-w-[420px] flex-none items-center gap-1 rounded-[var(--radius-sm)] border border-[var(--wb-warn)] bg-[var(--wb-bg-card)] pl-2"
        >
          <button
            type="button"
            onClick={() => onSeek(alerta.inicio_seg)}
            title={`Ir para o trecho: ${alerta.motivo}`}
            className="flex min-w-0 items-center gap-1.5 py-0.5 text-[11px] text-[var(--wb-text)]"
          >
            <span className="flex-none font-code font-semibold text-[var(--wb-warn-ink)]">
              {segParaHms(alerta.inicio_seg)}
            </span>
            <span className="truncate">{alerta.motivo || 'Afirmação a conferir'}</span>
          </button>
          <button
            type="button"
            onClick={() => onConferir(alerta.id)}
            disabled={conferindoId === alerta.id}
            aria-label={`Marcar como conferido: ${alerta.motivo}`}
            className="flex h-6 flex-none items-center gap-1 border-l border-[var(--wb-border-soft)] px-2 text-[11px] font-medium text-[var(--wb-text-mute)] hover:text-[var(--wb-ok)] disabled:opacity-40"
          >
            <Icon name="check" />
            Conferido
          </button>
        </div>
      ))}
    </div>
  );
}

interface Props {
  corteId: string;
  alertas: AlertaConferir[];
  onSeek: (seg: number) => void;
}

export function AlertasConferir({ corteId, alertas, onSeek }: Props) {
  const marcar = useMarcarAlertaConferido(corteId);
  return (
    <AlertasConferirFaixa
      alertas={alertas}
      onSeek={onSeek}
      onConferir={(alertaId) => marcar.mutate(alertaId)}
      conferindoId={marcar.isPending ? marcar.variables : undefined}
    />
  );
}
