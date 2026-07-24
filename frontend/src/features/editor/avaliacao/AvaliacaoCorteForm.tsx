import { Star } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useMotivosAvaliacao } from './useAvaliacaoCorte';

// D-419: os três campos da avaliação de um corte — nota, ressalvas e um
// comentário livre. Componente burro: não busca nem salva nada, só desenha o
// rascunho que o modal segura.

export interface RascunhoAvaliacao {
  voto: number | null;
  motivos: string[];
  comentario: string;
}

export const RASCUNHO_VAZIO: RascunhoAvaliacao = { voto: null, motivos: [], comentario: '' };

/** Alterna um motivo na lista, preservando a ordem em que o backend a devolve. */
export function alternarMotivo(motivos: string[], slug: string): string[] {
  return motivos.includes(slug) ? motivos.filter((m) => m !== slug) : [...motivos, slug];
}

interface EstrelasProps {
  voto: number | null;
  onChange: (voto: number) => void;
}

function EstrelasAvaliacao({ voto, onChange }: EstrelasProps) {
  return (
    <span className="flex items-center gap-1" data-testid="avaliacao-corte-estrelas">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n)}
          aria-label={`Nota ${n} de 5`}
          aria-pressed={n === voto}
          className="text-[var(--wb-text-mute)] transition-colors hover:text-amber-300"
        >
          <Star size={20} className={n <= (voto ?? 0) ? 'fill-amber-300 text-amber-300' : ''} />
        </button>
      ))}
    </span>
  );
}

interface AvaliacaoCorteFormProps {
  rascunho: RascunhoAvaliacao;
  onChange: (rascunho: RascunhoAvaliacao) => void;
}

export function AvaliacaoCorteForm({ rascunho, onChange }: AvaliacaoCorteFormProps) {
  const motivos = useMotivosAvaliacao();

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <EstrelasAvaliacao
          voto={rascunho.voto}
          onChange={(voto) => onChange({ ...rascunho, voto })}
        />
        <span className="font-code text-[10.5px] text-[var(--wb-text-dim)]">
          {rascunho.voto ? `${rascunho.voto} de 5` : 'sem nota'}
        </span>
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="font-code text-[10px] uppercase tracking-wide text-[var(--wb-text-mute)]">
          O que pesou? (opcional)
        </span>
        <div className="flex flex-wrap gap-1.5" data-testid="avaliacao-corte-motivos">
          {(motivos.data ?? []).map((motivo) => {
            const ativo = rascunho.motivos.includes(motivo.slug);
            return (
              <button
                key={motivo.slug}
                type="button"
                aria-pressed={ativo}
                onClick={() =>
                  onChange({ ...rascunho, motivos: alternarMotivo(rascunho.motivos, motivo.slug) })
                }
                className={cn(
                  'rounded-[7px] border px-2 py-[3px] text-[10.5px] font-bold transition-colors',
                  ativo
                    ? 'border-[var(--wb-accent)] bg-[var(--wb-accent-soft)] text-[var(--wb-accent)]'
                    : 'border-[var(--wb-border)] bg-[var(--wb-bg-inset)] text-[var(--wb-text-mute)] hover:text-[var(--wb-text)]',
                )}
              >
                {motivo.rotulo}
              </button>
            );
          })}
        </div>
      </div>

      <label className="flex flex-col gap-1.5">
        <span className="font-code text-[10px] uppercase tracking-wide text-[var(--wb-text-mute)]">
          Comentário (opcional)
        </span>
        <textarea
          value={rascunho.comentario}
          onChange={(e) => onChange({ ...rascunho, comentario: e.target.value })}
          rows={3}
          placeholder="O que faria esse corte ficar melhor?"
          className="w-full resize-none rounded-[var(--radius-xs)] border border-[var(--wb-border)] bg-[var(--wb-bg-inset)] px-2.5 py-2 text-[11.5px] text-[var(--wb-text)] placeholder:text-[var(--wb-text-mute)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--wb-focus)]"
        />
      </label>
    </div>
  );
}
