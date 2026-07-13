// D-351: formulário "burro" de edição dos pesos do ranking de lives. Sem I/O:
// recebe os critérios (valor-do-canal + default + rótulo/descrição) e devolve os
// valores via `onSave`; o reset é delegado via `onReset`. Ressincroniza o estado
// local quando os critérios mudam (recarga ou reset persistido).
//
// Deixa CLARO cada critério: rótulo + descrição + valor editável, com o default ao
// lado. A validação real (peso negativo, todos-zero, meia-vida <= 0) é do backend
// (422); aqui a UI só orienta com um aviso leve.
import { useEffect, useState } from 'react';
import { Loader2, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { CriterioRanking, RankingPesosPayload } from '@/lib/rankingPesosApi';

interface Props {
  criterios: CriterioRanking[];
  pending: boolean;
  onSave: (valores: RankingPesosPayload) => void;
  onReset: () => void;
}

/** Constrói o mapa key→string (para os inputs) a partir dos critérios. */
function textosIniciais(criterios: CriterioRanking[]): Record<string, string> {
  return Object.fromEntries(criterios.map((c) => [c.key, String(c.valor)]));
}

/** True quando ao menos um peso (eh_peso) é > 0 — espelha o guardrail do backend. */
function algumPesoPositivo(criterios: CriterioRanking[], textos: Record<string, string>): boolean {
  return criterios.some((c) => c.eh_peso && Number(textos[c.key]) > 0);
}

export function RankingPesosForm({ criterios, pending, onSave, onReset }: Props) {
  const [textos, setTextos] = useState<Record<string, string>>(() => textosIniciais(criterios));

  // Ressincroniza quando os critérios mudam (recarga, reset persistido).
  useEffect(() => {
    setTextos(textosIniciais(criterios));
  }, [criterios]);

  const invalido = criterios.some((c) => {
    const n = Number(textos[c.key]);
    if (!Number.isFinite(n) || n < 0) return true;
    if (!c.eh_peso && n <= 0) return true; // meia-vida deve ser > 0
    return false;
  });
  const semPesoPositivo = !algumPesoPositivo(criterios, textos);
  const bloqueado = pending || invalido || semPesoPositivo;

  const submeter = (e: React.FormEvent) => {
    e.preventDefault();
    if (bloqueado) return;
    const valores = Object.fromEntries(
      criterios.map((c) => [c.key, Number(textos[c.key])]),
    ) as unknown as RankingPesosPayload;
    onSave(valores);
  };

  return (
    <form onSubmit={submeter} className="grid gap-4">
      <ul className="grid gap-3">
        {criterios.map((criterio) => (
          <li
            key={criterio.key}
            className="grid gap-2 rounded-[var(--radius)] border border-[var(--wb-border-soft)] bg-[var(--wb-bg)] p-3 sm:grid-cols-[1fr_auto] sm:items-center sm:gap-4"
          >
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <Label htmlFor={`ranking-peso-${criterio.key}`} className="text-[var(--wb-text)]">
                  {criterio.rotulo}
                </Label>
                {!criterio.eh_peso && (
                  <span className="rounded-full border border-[var(--wb-border-soft)] px-2 py-0.5 text-[10px] uppercase tracking-wide text-[var(--wb-text-dim)]">
                    parâmetro
                  </span>
                )}
              </div>
              <p className="mt-1 text-xs text-[var(--wb-text-mute)]">{criterio.descricao}</p>
            </div>
            <div className="flex items-center gap-2 sm:justify-end">
              <Input
                id={`ranking-peso-${criterio.key}`}
                type="number"
                inputMode="decimal"
                min={0}
                step={criterio.eh_peso ? 0.05 : 1}
                value={textos[criterio.key] ?? ''}
                onChange={(e) =>
                  setTextos((atual) => ({ ...atual, [criterio.key]: e.target.value }))
                }
                className="w-24"
              />
              <span
                className="whitespace-nowrap text-[11px] text-[var(--wb-text-dim)]"
                title="Valor padrão (reset)"
              >
                padrão: {criterio.valor_default}
              </span>
            </div>
          </li>
        ))}
      </ul>

      {semPesoPositivo && (
        <p className="text-xs text-error">
          Ao menos um peso deve ser maior que 0 — senão o ranking não consegue pontuar.
        </p>
      )}

      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={onReset}
          disabled={pending}
          className="inline-flex items-center gap-1 text-xs text-[var(--wb-text-mute)] hover:text-[var(--wb-text)] disabled:opacity-40"
        >
          <RotateCcw size={12} aria-hidden />
          Resetar para o padrão
        </button>
        <Button type="submit" disabled={bloqueado}>
          {pending && <Loader2 className="animate-spin" aria-hidden />}
          Salvar pesos
        </Button>
      </div>
    </form>
  );
}
