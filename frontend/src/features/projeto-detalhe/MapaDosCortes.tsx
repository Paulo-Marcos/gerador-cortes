import { Anel } from '@/components/ui/anel';
import { Icon } from '@/components/ui/icon';
import { MapaDaLive, type CorteDoMapa } from '@/components/ui/mapa-da-live';
import { fraseDoFire, fraseDosCortes, percentualCortado } from './leituraDoMapa';

// D-1149 (E-069 H-16) · O mapa da live no topo dos cortes (DIRECAO §7.2): o cartão que
// leva o fio de luz nesta tela (§3.1, um por tela). À direita do título, a leitura: quanto
// da live virou corte, quantos estão prontos e quantos são fire. Embaixo, a pista com os
// cortes onde nasceram. Clicar num corte abre-o na lista (quem decide é `onAbrir`).
// Sem `backdrop-filter` (§3.6): o cartão é vidro chapado.

type MapaDosCortesProps = {
  duracaoSeg: number;
  cortes: CorteDoMapa[];
  abertoId: string | undefined;
  onAbrir: (corteId: string) => void;
  prontos: number;
  fires: number;
};

export function MapaDosCortes({ duracaoSeg, cortes, abertoId, onAbrir, prontos, fires }: MapaDosCortesProps) {
  const pct = percentualCortado(cortes, duracaoSeg);
  const fire = fraseDoFire(fires);
  return (
    <section
      aria-labelledby="mapa-dos-cortes"
      data-parte="mapa-dos-cortes"
      className="cc-fio rounded-cartao border bg-vidro px-5 pb-4 pt-4 shadow-topo"
    >
      <header className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <h2 id="mapa-dos-cortes" className="min-w-0 flex-1 text-secao text-fg">
          Mapa da live
        </h2>
        {pct === null ? null : (
          <span className="inline-flex items-center gap-2.5">
            <Anel valor={pct} rotulo={`${pct}% da live virou corte`} tamanho={34} espessura={3}>
              <span className="num text-micro">{pct}</span>
            </Anel>
            <span className="text-pequeno text-fg-2">{pct}% da live virou corte</span>
          </span>
        )}
        <span className="text-pequeno text-fg-2">{fraseDosCortes(cortes.length, prontos)}</span>
        {fire ? (
          <span className="inline-flex items-center gap-1.5 text-pequeno text-fg-2">
            <Icon name="flame" className="text-fire" />
            {fire}
          </span>
        ) : null}
      </header>
      <MapaDaLive className="mt-3" duracaoSeg={duracaoSeg} cortes={cortes} abertoId={abertoId} onAbrir={onAbrir} />
    </section>
  );
}
