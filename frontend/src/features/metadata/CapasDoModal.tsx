import type { Corte } from '@/types/models';
import { CapaTikTokSlot } from './CapaTikTokSlot';
import { CapaYoutubeDoModal } from './CapaYoutubeDoModal';
import type { EstadoDoCard } from './useMetadataCard';

// A coluna das capas (D-821, D-1167): a do YouTube 16:9, grande, e embaixo a do TikTok 9:16
// (DIRECAO §7.5). Antes eram duas abas; agora as duas estão à vista, porque são parecidas no
// nome e é justamente isso que as faz precisarem estar lado a lado — esconder uma atrás da
// outra deixava a errada subir (D-521). Cada uma leva os próprios botões ao lado da própria
// imagem. O texto da capa mora no formulário ao lado (TextosDoCorte), porque serve às duas.

export function CapasDoModal({
  card,
  cut,
  projetoId,
}: {
  card: EstadoDoCard;
  cut: Corte;
  projetoId: string;
}) {
  const { coverText, meta } = card;

  return (
    <aside aria-label="Capas do corte" className="grid min-w-0 content-start gap-4">
      <section aria-label="Capa do YouTube" className="grid gap-2">
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="text-linha text-fg">Capa do YouTube</h3>
          <span className="num text-fg-3">16:9</span>
        </div>
        <CapaYoutubeDoModal card={card} cut={cut} />
      </section>
      <CapaTikTokSlot
        projetoId={projetoId}
        corteId={cut.id}
        capaPath={meta?.thumbnail_tiktok_path}
        promptArte={meta?.prompt_capa_tiktok}
        etiqueta={meta?.etiqueta_tiktok}
        textoCapa={coverText}
        onAtualizou={card.invalidate}
      />
    </aside>
  );
}

