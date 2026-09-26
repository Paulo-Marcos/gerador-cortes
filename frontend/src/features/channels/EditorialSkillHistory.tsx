// D-312: histórico append-only de versões de uma skill editorial. Componente
// "burro": recebe as versões já carregadas e delega o reverter ao container, sem
// I/O próprio. Mostra, por versão, a data e o resumo do que mudou; oferece
// "Reverter" nas versões que não são a vigente.
import { AlertTriangle, History, Loader2, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { SkillVersao } from '@/features/channels/api/skillsEditoriais';

interface Props {
  versoes: SkillVersao[];
  carregando: boolean;
  erro: string | null;
  pending: boolean;
  onReverter: (versao: number) => void;
}

/** Formata o ISO-8601 UTC para data/hora legível; devolve o cru se não parsear. */
export function formatarData(iso: string): string {
  if (!iso) return '—';
  const data = new Date(iso);
  if (Number.isNaN(data.getTime())) return iso;
  return data.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function EditorialSkillHistory({ versoes, carregando, erro, pending, onReverter }: Props) {
  return (
    <section className="grid gap-2 border-t border-[var(--wb-border-soft)] pt-4">
      <h3 className="flex items-center gap-2 text-sm font-medium text-[var(--wb-text)]">
        <History size={15} aria-hidden />
        Histórico de versões
      </h3>
      <p className="text-xs text-[var(--wb-text-dim)]">
        Cada edição cria uma nova versão sem apagar as anteriores. Reverter aplica o conteúdo de uma
        versão antiga como uma nova versão vigente.
      </p>

      {carregando && (
        <p className="flex items-center gap-2 text-xs text-[var(--wb-text-mute)]">
          <Loader2 className="animate-spin" size={14} aria-hidden />
          Carregando histórico…
        </p>
      )}

      {erro && (
        <p className="flex items-center gap-2 text-xs text-[var(--wb-text)]">
          <AlertTriangle size={14} aria-hidden className="text-error" />
          {erro}
        </p>
      )}

      {!carregando && !erro && versoes.length === 0 && (
        <p className="text-xs text-[var(--wb-text-mute)]">Sem versões registradas ainda.</p>
      )}

      {versoes.length > 0 && (
        <ul className="grid gap-1.5">
          {versoes.map((v) => (
            <li
              key={v.versao}
              className="flex items-center justify-between gap-3 rounded-[var(--radius-sm)] border border-[var(--wb-border-soft)] px-3 py-2"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-[var(--wb-text)]">v{v.versao}</span>
                  {v.vigente && (
                    <span className="rounded-full bg-[var(--wb-accent-soft)] px-2 py-0.5 text-[10px] font-medium text-[var(--wb-accent)]">
                      Em uso
                    </span>
                  )}
                  <span className="text-[11px] text-[var(--wb-text-dim)]">
                    {formatarData(v.criado_em)}
                  </span>
                </div>
                <p className="mt-0.5 truncate text-xs text-[var(--wb-text-mute)]">{v.resumo}</p>
              </div>
              {!v.vigente && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="shrink-0"
                  disabled={pending}
                  onClick={() => onReverter(v.versao)}
                >
                  <RotateCcw size={13} aria-hidden />
                  Reverter
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
