import type { Dispatch, SetStateAction } from 'react';
import { Link } from 'react-router-dom';
import { Input } from '@/components/ui/input';
import { PalcoDoTipoNoModal } from '@/features/channels/PalcoDoTipoNoModal';
import type { usePalcoDoModal } from '@/features/channels/usePalcoDoModal';
import { cn } from '@/lib/utils';
import { FundoThumb, YOUTUBE_BACKGROUND_OPTIONS } from '@/shared/palco/youtubeBackgrounds';
import type { YoutubeBackgroundId, YoutubePlaca } from '@/shared/palco/youtubeLayout';

// D-923: os ajustes do palco do HORIZONTAL no modal de posição, embaixo da prévia.
//
// - A placa do corte/preset (nome e papel) e, no estilo atual, a textura do fundo.
// - O palco do horizontal deste corte ou projeto (`PalcoDoTipoNoModal`): fundo
//   limpo, cabeçalho, placa, cards — só o que vale no estilo escolhido.
// No padrão global o palco é o do canal: ele se ajusta na tela de Canais.

const ROTULO = 'mb-1.5 font-code text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--wb-text-dim)]';

export function AjustesDoEstilo({
  palco,
  global,
  editavel,
  ...fundoEPlaca
}: Parameters<typeof FundoEPlacaDoCorte>[0] & {
  palco: ReturnType<typeof usePalcoDoModal>;
  /** O modal do padrão global não muda o palco (é do canal). */
  global: boolean;
  /** Segmentos herdam fundo e placa do corte: só mostram o aviso. */
  editavel: boolean;
}) {
  const limpo = palco.estilo === 'limpo';
  return (
    <section aria-label="Ajustes do palco" className="grid gap-3 rounded-[var(--radius-sm)] border border-[var(--wb-border-soft)] p-3">
      <strong className="text-[13px] text-[var(--wb-text)]">Palco do horizontal · estilo {limpo ? 'Limpo' : 'Atual'}</strong>
      {editavel ? (
        <FundoEPlacaDoCorte {...fundoEPlaca} semFundo={limpo} />
      ) : (
        <p className="text-[12px] text-[var(--wb-text-dim)]">Neste segmento, fundo e placa vêm do corte.</p>
      )}
      {global ? (
        <p className="text-[12px] text-[var(--wb-text-dim)]">
          No padrão global o palco é o do canal.{' '}
          <Link to="/canais" className="text-[var(--wb-accent)] underline-offset-2 hover:underline">
            Ajuste em Canais → Palco do canal
          </Link>
          .
        </p>
      ) : palco.rascunho && palco.efetivo ? (
        <PalcoDoTipoNoModal tipo="horizontal" rascunho={palco.rascunho} efetivo={palco.efetivo} onMudar={palco.mudar} />
      ) : null}
    </section>
  );
}

export function FundoEPlacaDoCorte({
  fundo: draftFundo,
  placa: draftPlaca,
  onFundo: setDraftFundo,
  onPlaca: setDraftPlaca,
  semFundo = false,
}: {
  fundo: YoutubeBackgroundId;
  placa: YoutubePlaca;
  onFundo: (fundo: YoutubeBackgroundId) => void;
  onPlaca: Dispatch<SetStateAction<YoutubePlaca>>;
  /** No estilo limpo a textura não vale: só a placa. */
  semFundo?: boolean;
}) {
  return (
    <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,260px)]">
      {!semFundo && (
      <div>
        <div className={ROTULO}>Fundo</div>
        <div className="grid grid-cols-3 gap-1.5 xl:grid-cols-6">
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
      </div>
      )}

      <div className={semFundo ? 'lg:col-span-2' : undefined}>
        <div className={ROTULO}>Placa de nome</div>
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
      </div>
    </div>
  );
}
