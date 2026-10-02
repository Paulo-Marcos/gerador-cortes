// D-581: o workspace de um Fire — a prateleira do que já está pronto.
//
// ## Por que isto não cabia na tela de edição
//
// Porque são dois trabalhos com posturas opostas, e a tela de edição estava
// tentando ser os dois ao mesmo tempo — foi disso que veio o "muito poluído e
// difícil de encontrar as coisas".
//
// Editar é trabalho de UM trecho: o player grande, a régua com a onda, o palco,
// as bordas no milésimo. Tudo ali existe para responder "este trecho está bom?".
//
// Publicar é trabalho de VÁRIOS: o que está pronto, o que já subiu, para onde
// ainda falta. A pergunta é "o que eu despacho hoje?", e ela se responde vendo
// a coleção — não um trecho por vez dentro de um cartão que também carrega
// nota da IA, justificativa, botões de aprovar e um bloco de ajuste fino.
//
// ## Por que só os aprovados e os prontos
//
// Porque um sugerido não é um produto: ele ainda pode ser rejeitado. Misturá-lo
// aqui devolveria à prateleira a fila inteira, e a tela viraria a de edição com
// outro nome.
//
// Aprovado mas ainda sem MP4 entra — e entra como PENDÊNCIA, não como produto.
// Escondê-lo faria o operador perguntar "cadê aquele que eu aprovei", e a
// resposta ("falta renderizar") é exatamente o que esta tela deve dizer.
import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { SeloDeEstado } from '@/upgrade/SeloDeEstado';
import { APARENCIA } from './estadoDoCandidato';
import { cn, formatarDuracao } from '@/lib/utils';
import { capaImagemUrl, shortVideoUrl, type ShortSugerido } from './shortsApi';
import { mmss } from './linhaDoTempoShort';
import { PainelPublicacao } from './PainelPublicacao';
import { ProgressoRenderPanel } from './ProgressoRenderPanel';
import { PublicarEmLoteModal } from './PublicarEmLoteModal';
import { plataformasJaPublicadas, shortsPublicaveis } from './selecaoDoLote';
import { useFires } from './useFires';
import {
  useCapaDoShort,
  useProgressoRender,
  useRenderizarShort,
  useShortsDoCorte,
} from './useShortsDoCorte';
import { usePublicacoesDoCorte } from './useLotePublicacao';
import { useFechoDoShort } from './useFechoDoShort';
import type { PublicacaoRegistrada } from './shortsApi';
import { useDefinirChrome } from '@/upgrade/UpgradeChrome';
import { MolduraDeVideo } from '@/upgrade/MolduraDeVideo';
import { Icon, ICONE_DO_CONCEITO } from '@/upgrade/Icon';

/** Como cada plataforma se chama na prateleira. */
const NOME_DA_PLATAFORMA: Record<string, string> = {
  youtube_shorts: 'YouTube',
  tiktok: 'TikTok',
  instagram_reels: 'Instagram',
};

/**
 * Um short na prateleira.
 *
 * O vídeo é o item, e não um enfeite ao lado do texto: numa tela de despacho a
 * identificação é visual — o operador reconhece o trecho pelo quadro, não pelo
 * título que a IA escreveu. Daí o cartão ser o retrato 9:16 com os dados por
 * baixo, e não uma linha de lista com um selo de play.
 */
function CartaoDoPronto({
  short,
  corteId,
  publicacoes,
  aberto,
  onAlternar,
}: {
  short: ShortSugerido;
  corteId: string;
  publicacoes: PublicacaoRegistrada[];
  aberto: boolean;
  onAlternar: () => void;
}) {
  const renderizar = useRenderizarShort(corteId);
  const progresso = useProgressoRender(short.id, corteId, true);
  const renderizando = progresso !== null && !progresso.concluido;
  const pronto = short.status === 'renderizado' && Boolean(short.arquivo_short_path);
  const capa = useCapaDoShort(short.id, pronto);
  const fecho = useFechoDoShort(short);
  const jaFoi = useMemo(
    () => plataformasJaPublicadas(publicacoes, short.id),
    [publicacoes, short.id],
  );

  return (
    <article
      className={cn(
        'flex flex-col overflow-hidden rounded-[12px] border bg-[var(--wb-bg-card)]',
        aberto ? 'border-[var(--wb-accent)]' : 'border-[var(--wb-border)]',
      )}
    >
      {/* R4: moldura no retrato — `mat` 9 px, ver ShortsProntosPage. */}
      <MolduraDeVideo proporcao="9/16" mat={9}>
        {pronto ? (
          <video
            src={shortVideoUrl(short.id, 'final')}
            controls
            preload="metadata"
            // A capa escolhida vira o poster: é ela que a plataforma vai
            // mostrar, e ver o mesmo quadro aqui é a única conferência barata
            // de que a escolha ficou boa.
            poster={capa.data?.tem_capa ? capaImagemUrl(short.id, capa.data.instante_seg) : undefined}
            className="absolute inset-0 h-full w-full"
          />
        ) : (
          // Aprovado sem arquivo: o lugar do vídeo diz o que falta, em vez de
          // ficar preto. Um retângulo preto num cartão de "pronto" lê-se como
          // vídeo quebrado.
          <div className="absolute inset-0 grid place-items-center p-4 text-center">
            <div>
              <Icon name="clapperboard" ilustracao={24} className="mx-auto text-[var(--wb-text-mute)]" />
              <p className="mt-2 text-[12px] font-semibold text-[var(--wb-text-dim)]">
                aprovado, falta o arquivo
              </p>
              <Button
                variant="secondary"
                size="sm"
                className="mt-2"
                disabled={renderizando || renderizar.isPending}
                onClick={() => fecho.finalizar(() => renderizar.mutate(short.id))}
              >
                {renderizando || renderizar.isPending ? (
                  <Icon name="loader-2" className="animate-spin" />
                ) : (
                  <Icon name="clapperboard" />
                )}
                {renderizando ? 'renderizando…' : 'Finalizar'}
              </Button>
            </div>
          </div>
        )}
      </MolduraDeVideo>

      <div className="flex flex-col gap-1.5 p-2.5">
        <h3 className="line-clamp-2 text-[12.5px] font-bold leading-snug" title={short.titulo}>
          {short.titulo}
        </h3>
        <div className="flex items-center gap-2 font-code text-[10.5px] tabular-nums text-[var(--wb-text-mute)]">
          <span>{mmss(short.inicio_seg)}</span>
          <span>{Math.round(short.duracao_seg)}s</span>
          <div className="flex-1" />
          {pronto ? (
            <SeloDeEstado tom={APARENCIA.renderizado.tom}>{APARENCIA.renderizado.rotulo}</SeloDeEstado>
          ) : (
            <SeloDeEstado tom={APARENCIA.aprovado.tom}>{APARENCIA.aprovado.rotulo}</SeloDeEstado>
          )}
        </div>

        {/* Onde já subiu. É o dado que a tela de edição não mostrava em lugar
            nenhum, e sem ele "publicar em massa" vira roleta: marcar tudo de
            novo e torcer para o backend recusar os repetidos. */}
        <div className="flex flex-wrap items-center gap-1">
          {jaFoi.size === 0 ? (
            <span className="text-[10.5px] text-[var(--wb-text-mute)]">ainda não publicado</span>
          ) : (
            [...jaFoi].map((plataforma) => (
              <span
                key={plataforma}
                className="rounded-[4px] bg-[var(--wb-ok-soft)] px-1.5 py-0.5 font-code text-[9.5px] uppercase tracking-wide text-[var(--wb-ok-ink)]"
              >
                {NOME_DA_PLATAFORMA[plataforma] ?? plataforma}
              </span>
            ))
          )}
          {capa.data?.tem_capa && (
            <span
              className="ml-auto inline-flex items-center gap-0.5 text-[10px] text-[var(--wb-text-mute)]"
              title="Este short tem capa escolhida"
            >
              <Icon name="image" />
              capa
            </span>
          )}
        </div>

        {pronto && (
          <Button variant="outline" size="sm" onClick={onAlternar}>
            <Icon name={ICONE_DO_CONCEITO.publicar} />
            {aberto ? 'fechar a publicação' : 'Publicar este'}
          </Button>
        )}
      </div>

      {progresso && <ProgressoRenderPanel progresso={progresso} shortId={short.id} />}

      {fecho.modais}

      {/* O painel individual continua existindo — publicar UM é um caso real, e
          o lote não deve ser o único caminho. Ele abre sob demanda para o
          cartão não voltar a ser a parede de controles da tela de edição. */}
      {pronto && aberto && (
        <div className="border-t border-[var(--wb-border-soft)]">
          <PainelPublicacao
            short={short}
            corteId={corteId}
            onEscreverPost={fecho.abrirPost}
            onEscolherCapa={fecho.abrirCapa}
          />
        </div>
      )}
    </article>
  );
}

// D-599: a Prateleira do Fire dentro da casca. O cabecalho proprio sai (titulo,
// subtitulo e "voltar" viram da casca) e o despacho vai para a BARRA DE ACOES
// fixa — e o design faz isso por um motivo: numa grade de cartoes 9:16 que rola,
// "Publicar em massa" no topo some justamente quando a pessoa chega ao ultimo
// short e decide publicar.

export default function WorkspaceDoFirePage() {

  const { corteId = '' } = useParams();
  const { data, isLoading, isError, error } = useShortsDoCorte(corteId);
  const fires = useFires();
  const publicacoes = usePublicacoesDoCorte(corteId);
  const [publicandoEmLote, setPublicandoEmLote] = useState(false);
  const [abertoId, setAbertoId] = useState<string | null>(null);

  const shorts = useMemo(() => data?.shorts ?? [], [data]);
  const fire = fires.data?.fires.find((f) => f.corte_id === corteId);

  // A prateleira: aprovados e prontos, nesta ordem — o que já é produto vem
  // primeiro, e o que falta renderizar fica logo abaixo como pendência.
  const naPrateleira = useMemo(
    () =>
      shorts
        .filter((s) => s.status === 'aprovado' || s.status === 'renderizado')
        .sort((a, b) => {
          const pesoA = a.status === 'renderizado' ? 0 : 1;
          const pesoB = b.status === 'renderizado' ? 0 : 1;
          return pesoA - pesoB || a.inicio_seg - b.inicio_seg;
        }),
    [shorts],
  );

  const publicaveis = useMemo(() => shortsPublicaveis(shorts), [shorts]);
  const registradas = useMemo(() => publicacoes.data?.publicacoes ?? [], [publicacoes.data]);
  const aguardando = naPrateleira.length - publicaveis.length;
  const navigate = useNavigate();

  useDefinirChrome(
    {
      titulo: fire?.titulo || 'Prateleira do Fire',
      sub: [
        `${publicaveis.length} pronto${publicaveis.length === 1 ? '' : 's'} para publicar`,
        aguardando > 0 ? `${aguardando} aguardando render` : null,
        fire ? `bruto de ${formatarDuracao(fire.duracao_seg)}` : null,
      ]
        .filter(Boolean)
        .join(' · '),
      // R4: idem à tela de curadoria — a live de origem é clicável.
      rotulos: fire ? [{ texto: fire.projeto_titulo, to: `/projetos/${fire.projeto_id}` }] : [],
      acoes: [
        { icone: ICONE_DO_CONCEITO.editar, texto: 'Voltar à edição', onClick: () => navigate(`/shorts/${corteId}`) },
      ],
      barra: {
        secundario: {
          texto: 'Voltar à edição',
          icone: ICONE_DO_CONCEITO.editar,
          onClick: () => navigate(`/shorts/${corteId}`),
        },
        terciario: { titulo: 'Ver na fila', icone: 'loader', onClick: () => navigate('/fila') },
        primario: {
          texto:
            publicaveis.length === 0
              ? 'Nada pronto para publicar'
              : `Publicar ${publicaveis.length} short${publicaveis.length === 1 ? '' : 's'}`,
          icone: ICONE_DO_CONCEITO.publicar,
          onClick: () => setPublicandoEmLote(true),
          desabilitado: publicaveis.length === 0,
        },
      },
    },
    [fire?.titulo, fire?.projeto_titulo, fire?.duracao_seg, publicaveis.length, aguardando, corteId],
  );

  return (
    <div
      className={cn(
        'flex min-h-0 flex-col overflow-hidden text-[var(--wb-text)]',
        '',
        '',
      )}
    >

      <main className="">
        {isLoading && (
          <p className="py-16 text-center text-[13px] text-[var(--wb-text-mute)]">
            Carregando a prateleira…
          </p>
        )}

        {isError && (
          <p className="py-16 text-center text-[13px] leading-relaxed text-[var(--wb-text-dim)]">
            Não consegui carregar os shorts: {(error as Error)?.message ?? 'erro desconhecido'}
          </p>
        )}

        {!isLoading && !isError && naPrateleira.length === 0 && (
          <div className="mx-auto max-w-md py-16 text-center">
            <Icon name="layout-grid" ilustracao={28} className="mx-auto text-[var(--wb-text-mute)]" />
            <p className="mt-3 text-[14px] font-semibold text-[var(--wb-text)]">
              Nada aprovado ainda neste corte
            </p>
            <p className="mt-2 text-[13px] leading-relaxed text-[var(--wb-text-mute)]">
              O workspace mostra só o que passou pela curadoria. Aprove os trechos na tela de
              edição e eles aparecem aqui, prontos para o despacho.
            </p>
            <Button variant="outline" size="sm" className="mt-3" asChild>
              <Link to={`/shorts/${corteId}`}>
                <Icon name={ICONE_DO_CONCEITO.editar} />
                Ir para a edição
              </Link>
            </Button>
          </div>
        )}

        {naPrateleira.length > 0 && (
          <div
            className="grid gap-3"
            style={{
              gridTemplateColumns: `repeat(auto-fill,minmax(${210}px,1fr))`,
            }}
          >
            {naPrateleira.map((short) => (
              <CartaoDoPronto
                key={short.id}
                short={short}
                corteId={corteId}
                publicacoes={registradas}
                aberto={abertoId === short.id}
                onAlternar={() =>
                  setAbertoId((atual) => (atual === short.id ? null : short.id))
                }
              />
            ))}
          </div>
        )}
      </main>

      <PublicarEmLoteModal
        open={publicandoEmLote}
        onClose={() => setPublicandoEmLote(false)}
        corteId={corteId}
        shorts={shorts}
      />
    </div>
  );
}
