import type { ComponentProps } from 'react';
import { useAvisosDaCena } from '@/features/editor/useCenas';
import type { CenaRemotion } from '@/types/models';
import { Icon } from '@/upgrade/Icon';
import { CenaItem } from './CenaItem';

// ─────────────────────────────────────────────────────────────────────────────
// CenaComOrigem (D-1018) — a cena da lista e, logo abaixo, de onde vem o que ela
// afirma: a frase literal, quem disse, a fonte e os avisos da conferência. Os
// avisos não bloqueiam nada e nada aqui reescreve a cena: quem decide é o operador.
// ─────────────────────────────────────────────────────────────────────────────

/** Os tipos que afirmam um fato: pedem fonte, mesmo quando a IA não trouxe nenhuma. */
const TIPOS_QUE_AFIRMAM = new Set<CenaRemotion['tipo']>([
  'destaque_numerico',
  'citacao_autor',
  'ficha_biografica',
  'marco_historico',
  'linha_tempo',
]);

const NOME_DE_QUEM_DISSE: Record<string, string> = {
  apresentador: 'apresentador',
  video_reagido: 'vídeo reagido',
};

type Props = ComponentProps<typeof CenaItem> & { corteId: string };

export function CenaComOrigem({ corteId, ...props }: Props) {
  const avisos = useAvisosDaCena(corteId, props.cena);
  return (
    <>
      <CenaItem {...props} />
      <OrigemDaCena cena={props.cena} avisos={avisos} onChange={props.onChange} />
    </>
  );
}

export function OrigemDaCena({
  cena,
  avisos,
  onChange,
}: {
  cena: CenaRemotion;
  avisos: string[];
  onChange: (next: CenaRemotion) => void;
}) {
  const afirma = TIPOS_QUE_AFIRMAM.has(cena.tipo) || Boolean(cena.fonte);
  if (!afirma && !cena.frase_da_fala && avisos.length === 0) return null;
  const quemDisse = cena.quem_disse ? (NOME_DE_QUEM_DISSE[cena.quem_disse] ?? cena.quem_disse) : null;

  return (
    <div className="flex flex-col gap-1 px-2.5 pb-1 pt-1 text-[11px] leading-snug">
      {avisos.map((aviso) => (
        <p key={aviso} className="flex items-start gap-1.5 text-[var(--wb-warn)]">
          <Icon name="triangle-alert" className="mt-px flex-shrink-0" />
          <span>{aviso}</span>
        </p>
      ))}
      {cena.ancora_perdida && (
        <button
          type="button"
          onClick={() => onChange({ ...cena, ancora_perdida: undefined, frase_ancora: undefined })}
          className="self-start text-[var(--wb-text-mute)] underline"
        >
          Manter a cena aqui
        </button>
      )}
      {cena.frase_da_fala && (
        <p className="text-[var(--wb-text-mute)]">
          “{cena.frase_da_fala}”{quemDisse && <span className="text-[var(--wb-text-dim)]"> — {quemDisse}</span>}
        </p>
      )}
      {afirma && (
        <label className="flex items-center gap-1.5 text-[var(--wb-text-dim)]">
          <span className="font-code text-[11px] font-bold uppercase tracking-[0.08em]">Fonte</span>
          <input
            type="text"
            value={cena.fonte ?? ''}
            onChange={(e) => onChange({ ...cena, fonte: e.target.value || undefined })}
            placeholder="Só o que você conferiu"
            className="h-[22px] min-w-0 flex-1 rounded-[var(--radius-xs)] border border-[var(--wb-border)] bg-[var(--wb-bg-card)] px-1.5 text-[11px] text-[var(--wb-text)]"
          />
        </label>
      )}
    </div>
  );
}
