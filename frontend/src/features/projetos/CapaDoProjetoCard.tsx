// D-987 · A primeira altura de leitura do card: a capa, que diz QUE live é.
//
// D-1148 (E-069 H-15; DIRECAO §6 "CardDeLive"): a capa é a `Miniatura` da sala, que
// nunca distorce e queima a duração no canto. O selo de estado, a nota e a barra do
// download desceram para o corpo do cartão: um selo por cartão (§7.1), e nada de texto
// solto sobre a arte. A capa abre a live, como o título.
import { Miniatura } from '@/components/ui/miniatura';
import { cn, thumbnailUrl } from '@/lib/utils';
import type { Projeto } from '@/types/models';

export function CapaDoProjetoCard({
  projeto,
  abrir,
  className,
}: {
  projeto: Projeto;
  abrir: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      data-sala=""
      onClick={abrir}
      aria-label={`Abrir a live ${projeto.titulo_live || 'sem título'}`}
      className={cn(
        'block flex-none rounded-capa focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foco',
        className,
      )}
    >
      <Miniatura
        grande
        src={thumbnailUrl(projeto.youtube_url, 'mq') ?? undefined}
        duracaoSeg={projeto.duracao_segundos > 0 ? projeto.duracao_segundos : undefined}
        className="w-full"
      />
    </button>
  );
}
