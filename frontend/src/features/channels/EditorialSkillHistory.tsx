// D-312: histórico append-only de versões de uma skill editorial. Componente
// "burro": recebe as versões já carregadas e delega o reverter ao container, sem
// I/O próprio. Mostra, por versão, a data e o resumo do que mudou; oferece
// "Reverter" nas versões que não são a vigente.
import { Button } from '@/components/ui/button';
import type { SkillVersao } from '@/features/channels/api/skillsEditoriais';
import { Icon } from '@/upgrade/Icon';

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
    <section className="grid gap-2 border-t border-fio pt-4">
      <h3 className="flex items-center gap-2 text-sm font-medium text-fg">
        <Icon name="history" size={16} />
        Histórico de versões
      </h3>
      <p className="text-xs text-fg-3">
        Cada edição cria uma nova versão sem apagar as anteriores. Reverter aplica o conteúdo de uma
        versão antiga como uma nova versão vigente.
      </p>

      {carregando && (
        <p className="flex items-center gap-2 text-xs text-fg-2">
          <Icon name="loader-2" className="animate-spin" />
          Carregando histórico…
        </p>
      )}

      {erro && (
        <p className="flex items-center gap-2 text-xs text-fg">
          <Icon name="triangle-alert" className="text-erro" />
          {erro}
        </p>
      )}

      {!carregando && !erro && versoes.length === 0 && (
        <p className="text-xs text-fg-2">Sem versões registradas ainda.</p>
      )}

      {versoes.length > 0 && (
        <ul className="grid gap-1.5">
          {versoes.map((v) => (
            <li
              key={v.versao}
              className="flex items-center justify-between gap-3 rounded-[var(--radius-sm)] border border-fio px-3 py-2"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-fg">v{v.versao}</span>
                  {v.vigente && (
                    <span className="rounded-full bg-iris-suave px-2 py-0.5 text-micro font-medium text-iris">
                      Em uso
                    </span>
                  )}
                  <span className="text-micro text-fg-3">
                    {formatarData(v.criado_em)}
                  </span>
                </div>
                <p className="mt-0.5 truncate text-xs text-fg-2">{v.resumo}</p>
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
                  <Icon name="rotate-ccw" />
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
