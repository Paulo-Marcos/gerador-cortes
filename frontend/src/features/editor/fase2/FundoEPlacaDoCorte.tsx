import type { Dispatch, SetStateAction } from 'react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { FundoThumb, YOUTUBE_BACKGROUND_OPTIONS } from '@/shared/palco/youtubeBackgrounds';
import type { YoutubeBackgroundId, YoutubePlaca } from '@/shared/palco/youtubeLayout';

// D-921: o que o modal de posição edita além do encaixe.
//
// - `FundoEPlacaDoCorte`: o fundo (textura do palco de sempre) e a placa do
//   corte/preset — saíram do corpo do modal para ele caber na catraca.
// - O palco do CANAL (estilo, componentes) é o `PalcoDoCanalNoModal` da tela
//   de Canais (`features/channels/EdicaoDoPalco.tsx`), usado aqui e no short.

export function FundoEPlacaDoCorte({
  fundo: draftFundo,
  placa: draftPlaca,
  onFundo: setDraftFundo,
  onPlaca: setDraftPlaca,
}: {
  fundo: YoutubeBackgroundId;
  placa: YoutubePlaca;
  onFundo: (fundo: YoutubeBackgroundId) => void;
  onPlaca: Dispatch<SetStateAction<YoutubePlaca>>;
}) {
  return (
    <>
      <section className="mt-1 rounded-[var(--radius-sm)] border border-[var(--wb-border-soft)] bg-[var(--wb-bg-inset)] p-2">
        <div className="mb-1.5 font-code text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--wb-text-dim)]">
          Fundo
        </div>
        <div className="grid grid-cols-3 gap-1.5">
          {YOUTUBE_BACKGROUND_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              type="button"
              aria-pressed={draftFundo === opt.id}
              title={opt.descricao}
              onClick={() => setDraftFundo(opt.id)}
              className={cn(
                'flex h-[58px] flex-col items-stretch justify-between gap-1 overflow-hidden rounded-[var(--radius-xs)] border p-1.5 pt-1 text-left transition-colors',
                draftFundo === opt.id
                  ? 'border-[var(--wb-accent)] bg-[var(--wb-accent-soft)] text-[var(--wb-accent)]'
                  : 'border-[var(--wb-border)] bg-[var(--wb-bg-card)] text-[var(--wb-text-mute)] hover:text-[var(--wb-text)]',
              )}
            >
              <span
                className={cn(
                  'flex flex-1 items-center justify-center overflow-hidden rounded-[3px] border border-[var(--wb-border-soft)]',
                  draftFundo === opt.id
                    ? 'bg-[var(--wb-bg-card)]'
                    : 'bg-[var(--wb-bg-inset)]',
                )}
              >
                <FundoThumb id={opt.id} />
              </span>
              <span className="truncate text-center text-[11px] font-semibold leading-[1.05]">
                {opt.label}
              </span>
            </button>
          ))}
        </div>
      </section>

      <section className="rounded-[var(--radius-sm)] border border-[var(--wb-border-soft)] bg-[var(--wb-bg-inset)] p-2">
        <div className="mb-1.5 font-code text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--wb-text-dim)]">
          Placa de nome
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          <label className="flex flex-col gap-0.5 font-code text-[11px] uppercase tracking-[0.08em] text-[var(--wb-text-dim)]">
            Nome
            <Input
              value={draftPlaca.nome}
              maxLength={80}
              placeholder="Ex.: Nome do Apresentador"
              onChange={(event) =>
                setDraftPlaca((current) => ({ ...current, nome: event.target.value }))
              }
              className="h-7 text-[11.5px]"
            />
          </label>
          <label className="flex flex-col gap-0.5 font-code text-[11px] uppercase tracking-[0.08em] text-[var(--wb-text-dim)]">
            Papel
            <Input
              value={draftPlaca.papel}
              maxLength={80}
              placeholder="Ex.: CTO"
              onChange={(event) =>
                setDraftPlaca((current) => ({ ...current, papel: event.target.value }))
              }
              className="h-7 text-[11.5px]"
            />
          </label>
        </div>
      </section>
    </>
  );
}
