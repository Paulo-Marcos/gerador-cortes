import { Anel } from '@/components/ui/anel';
import { Button } from '@/components/ui/button';
import { MapaDaLive, type CorteDoMapa } from '@/components/ui/mapa-da-live';
import { Miniatura } from '@/components/ui/miniatura';
import { Selo } from '@/components/ui/selo';
import { CartaoComFio } from '@/features/projetos/CartaoComFio';
import { construirEtapas } from '@/features/projetos/PipelineProgress';
import type { ProximoPasso } from '@/features/projetos/proximoPasso';
import { estadoDoProjeto, ROTULO_DO_SELO, TOM_DO_ESTADO } from '@/features/projetos/statusMaps';
import { formatarDataLive, thumbnailUrl } from '@/lib/utils';
import type { Projeto } from '@/types/models';

// D-1148 (E-069 H-15; DIRECAO §7.1) · "Continue de onde parou": o cartão com o fio de
// luz e a ÚNICA primária da Biblioteca (§5), que é o próximo passo desta live. Ao lado
// dela, "Abrir a live" em fantasma; um selo só; o mini-mapa acende os cortes aprovados.
// O anel do canto conta as seis etapas da live (as mesmas da fita do cartão antigo,
// `construirEtapas`): é o que a listagem sabe sem buscar o export de cada corte.

export type CartaoContinueProps = {
  projeto: Projeto;
  passo: ProximoPasso;
  /** Os cortes no mapa; vazio enquanto carregam ou quando a live não tem cortes. */
  cortes: CorteDoMapa[];
  /** O @ do canal ativo: "Vai ao ar em @…". Vazio, a linha some. */
  destino?: string;
  ir: (to: string) => void;
};

/** A capa projeta a própria luz (§3.3): uma cópia desfocada atrás. Imagem pequena e parada (§3.6). */
function CapaComLuz({ projeto }: { projeto: Projeto }) {
  const capa = thumbnailUrl(projeto.youtube_url, 'hq') ?? undefined;
  return (
    <div className="relative w-full max-w-[384px] flex-none">
      {capa && (
        <img
          src={capa}
          alt=""
          aria-hidden
          className="pointer-events-none absolute inset-2 size-[calc(100%-16px)] rounded-capa object-cover opacity-60 blur-2xl [transform:translateZ(0)]"
        />
      )}
      <Miniatura grande src={capa} duracaoSeg={projeto.duracao_segundos || undefined} className="relative w-full" />
    </div>
  );
}

function AnelDasEtapas({ projeto }: { projeto: Projeto }) {
  const etapas = construirEtapas(projeto);
  const feitas = etapas.filter((e) => e.estado === 'feito').length;
  return (
    <div className="flex flex-none flex-col items-center gap-2 rounded-bloco border border-fio bg-vidro-2 p-4 text-center shadow-topo">
      <Anel valor={(feitas / etapas.length) * 100} rotulo={`${feitas} de ${etapas.length} etapas da live`} tamanho={72} espessura={6}>
        <span className="num text-secao text-fg">
          {feitas}/{etapas.length}
        </span>
      </Anel>
      <p className="max-w-[14ch] text-pequeno text-fg-3">etapas da live</p>
    </div>
  );
}

export function CartaoContinue({ projeto, passo, cortes, destino, ir }: CartaoContinueProps) {
  const estado = estadoDoProjeto(projeto).key;
  const meta = [projeto.canal_origem, projeto.data_live ? formatarDataLive(projeto.data_live) : null]
    .filter(Boolean)
    .join(' · ');
  return (
    <CartaoComFio rotulo="Continue de onde parou" className="flex flex-wrap items-center gap-6">
      <CapaComLuz projeto={projeto} />
      <div className="flex min-w-[260px] flex-1 flex-col gap-3">
        <p className="text-pequeno text-iris">Continue de onde parou</p>
        <h2 className="line-clamp-2 text-titulo text-fg">{projeto.titulo_live || 'Sem título'}</h2>
        <p className="flex flex-wrap items-center gap-2 text-corpo text-fg-3">
          <Selo tom={TOM_DO_ESTADO[estado]}>{ROTULO_DO_SELO[estado]}</Selo>
          {meta && <span>{meta}</span>}
        </p>
        {cortes.length > 0 && (
          <MapaDaLive
            tamanho="mini"
            duracaoSeg={projeto.duracao_segundos}
            cortes={cortes}
            onAbrir={(id) => ir(`/projetos/${projeto.id}/cortes/${id}`)}
          />
        )}
        <div className="flex flex-wrap items-center gap-3 pt-1">
          <Button variant="primario" size="gd" onClick={() => ir(passo.to)}>
            {passo.texto}
          </Button>
          <Button variant="fantasma" size="gd" onClick={() => ir(`/projetos/${projeto.id}`)}>
            Abrir a live
          </Button>
          {destino && <span className="text-corpo text-fg-3">Vai ao ar em {destino}</span>}
        </div>
      </div>
      <AnelDasEtapas projeto={projeto} />
    </CartaoComFio>
  );
}
