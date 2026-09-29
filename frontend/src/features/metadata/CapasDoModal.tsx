import { useState } from 'react';
import { cn } from '@/lib/utils';
import type { Corte } from '@/types/models';
import { CapaTikTokSlot } from './CapaTikTokSlot';
import { CapaYoutubeDoModal } from './CapaYoutubeDoModal';
import { ModalChip, ModalFieldLabel, SugestoesRecolhidas } from './modalPecas';
import type { EstadoDoCard } from './useMetadataCard';

// A coluna das capas no modal de metadados (D-821).
//
// O texto da capa fica em cima, FORA das abas, porque serve às duas: a capa do
// YouTube o desenha, e a do TikTok o usa na etiqueta. Abaixo, uma aba por capa
// — um foco por vez, cada uma com os próprios botões ao lado da própria imagem.

type Aba = 'youtube' | 'tiktok';

const ABAS: { id: Aba; rotulo: string }[] = [
  { id: 'youtube', rotulo: 'YouTube 16:9' },
  { id: 'tiktok', rotulo: 'TikTok 9:16' },
];

export function CapasDoModal({
  card,
  cut,
  projetoId,
}: {
  card: EstadoDoCard;
  cut: Corte;
  projetoId: string;
}) {
  const [aba, setAba] = useState<Aba>('youtube');
  const { coverText, meta } = card;

  return (
    <aside className="grid min-w-0 content-start gap-3">
      <div>
        <ModalFieldLabel
          label="Texto da capa"
          counter={`${coverText.length}/28`}
          over={coverText.length > 28}
        />
        <input
          value={coverText}
          onChange={(event) => card.setCoverText(event.target.value)}
          onBlur={() => card.save({ texto_capa: coverText })}
          placeholder="Ex: JUSTICA EM SI"
          className="h-11 w-full rounded-[8px] border border-[var(--wb-border)] bg-[var(--wb-bg-panel)] px-3 text-[15px] font-extrabold outline-none focus:border-[var(--wb-accent)]"
        />
        <SugestoesRecolhidas
          quantidade={card.thumbSuggestions.length}
          aberto={card.showThumbSuggestions}
          onAlternar={() => card.setShowThumbSuggestions((atual) => !atual)}
        >
          {card.thumbSuggestions.map((sugestao) => (
            <ModalChip
              key={`${cut.id}-thumb-${sugestao}`}
              active={sugestao === coverText}
              onClick={() => {
                const texto = card.withCoverEmojis(sugestao);
                card.setCoverText(texto);
                card.save({ texto_capa: texto });
              }}
            >
              {sugestao}
            </ModalChip>
          ))}
        </SugestoesRecolhidas>
      </div>

      <div role="tablist" aria-label="Capas" className="flex border-b border-[var(--wb-border-soft)]">
        {ABAS.map(({ id, rotulo }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={aba === id}
            onClick={() => setAba(id)}
            className={cn(
              '-mb-px flex-1 border-b-2 px-3 py-2 text-[13px] font-bold transition-colors',
              aba === id
                ? 'border-[var(--wb-accent)] text-[var(--wb-text)]'
                : 'border-transparent text-[var(--wb-text-mute)] hover:text-[var(--wb-text)]',
            )}
          >
            {rotulo}
          </button>
        ))}
      </div>

      <div role="tabpanel">
        {aba === 'youtube' ? (
          <CapaYoutubeDoModal card={card} cut={cut} />
        ) : (
          <CapaTikTokSlot
            projetoId={projetoId}
            corteId={cut.id}
            capaPath={meta?.thumbnail_tiktok_path}
            promptArte={meta?.prompt_capa_tiktok}
            etiqueta={meta?.etiqueta_tiktok}
            textoCapa={coverText}
            onAtualizou={card.invalidate}
          />
        )}
      </div>
    </aside>
  );
}
