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
import { Link, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Clapperboard,
  Image as ImageIcon,
  LayoutGrid,
  Loader2,
  Pencil,
  Send,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { StatusChip } from '@/components/ui/status-chip';
import { cn, formatarDuracao } from '@/lib/utils';
import { isWorkbenchEnabled } from '@/components/workbench/workbenchFlag';
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
  const fecho = useFechoDoShort(short, pronto);
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
      <div className="relative bg-black" style={{ aspectRatio: '9 / 16' }}>
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
              <Clapperboard size={24} className="mx-auto text-[var(--wb-text-mute)]" aria-hidden />
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
                  <Loader2 className="animate-spin" />
                ) : (
                  <Clapperboard />
                )}
                {renderizando ? 'renderizando…' : 'Finalizar'}
              </Button>
            </div>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-1.5 p-2.5">
        <h3 className="line-clamp-2 text-[12.5px] font-bold leading-snug" title={short.titulo}>
          {short.titulo}
        </h3>
        <div className="flex items-center gap-2 font-code text-[10.5px] tabular-nums text-[var(--wb-text-mute)]">
          <span>{mmss(short.inicio_seg)}</span>
          <span>{Math.round(short.duracao_seg)}s</span>
          <div className="flex-1" />
          {pronto ? (
            <StatusChip label="pronto" tone="success" />
          ) : (
            <StatusChip label="aprovado" tone="accent" />
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
              <ImageIcon size={10} aria-hidden />
              capa
            </span>
          )}
        </div>

        {pronto && (
          <Button variant="outline" size="sm" onClick={onAlternar}>
            <Send />
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
            onEscreverPost={fecho.abrirPost}
            onEscolherCapa={fecho.abrirCapa}
          />
        </div>
      )}
    </article>
  );
}

export default function WorkspaceDoFirePage() {
  const workbench = isWorkbenchEnabled();
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

  return (
    <div
      className={cn(
        'flex min-h-0 flex-col overflow-hidden bg-[var(--wb-bg)] text-[var(--wb-text)]',
        workbench ? 'h-full' : 'h-[calc(100vh-3.5rem)]',
      )}
    >
      <header
        className={cn(
          'flex-none border-b border-[var(--wb-border-soft)] bg-[var(--wb-bg-panel)]',
          workbench ? 'px-4 py-2.5' : 'px-7 py-4',
        )}
      >
        <div className="flex items-center gap-2.5">
          <Link
            to="/shorts"
            className="inline-flex items-center gap-1 rounded-[7px] px-1.5 py-1 text-[12px] text-[var(--wb-text-mute)] transition-colors hover:bg-[var(--wb-bg-inset)] hover:text-[var(--wb-text)]"
          >
            <ArrowLeft size={14} aria-hidden />
            Shorts
          </Link>
          <LayoutGrid size={16} className="text-[var(--wb-accent)]" aria-hidden />
          <div className="min-w-0">
            <h1 className="truncate text-[14.5px] font-extrabold leading-tight">
              {fire?.titulo || 'Workspace do Fire'}
            </h1>
            <p className="truncate text-[11.5px] text-[var(--wb-text-mute)]">
              {publicaveis.length} pronto{publicaveis.length === 1 ? '' : 's'} para publicar
              {aguardando > 0 && ` · ${aguardando} aguardando render`}
              {fire && ` · bruto de ${formatarDuracao(fire.duracao_seg)}`}
            </p>
          </div>

          <div className="flex-1" />

          {/* D-581: a ida e volta entre as duas telas, nas duas direções.
              O botão aqui e o "Workspace" lá formam o par — sem um deles a
              navegação vira mão única e o operador volta pela lista. */}
          <Button variant="ghost" size="sm" asChild>
            <Link to={`/shorts/${corteId}`}>
              <Pencil />
              Voltar à edição
            </Link>
          </Button>

          <Button
            size="sm"
            disabled={publicaveis.length === 0}
            onClick={() => setPublicandoEmLote(true)}
            title={
              publicaveis.length > 0
                ? 'Publicar vários trechos deste Fire, nas plataformas escolhidas'
                : 'Nenhum short finalizado ainda'
            }
          >
            <Send />
            Publicar em massa
          </Button>
        </div>
      </header>

      <main className="flex-1 overflow-auto p-4">
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
            <LayoutGrid size={28} className="mx-auto text-[var(--wb-text-mute)]" aria-hidden />
            <p className="mt-3 text-[14px] font-semibold text-[var(--wb-text)]">
              Nada aprovado ainda neste corte
            </p>
            <p className="mt-2 text-[13px] leading-relaxed text-[var(--wb-text-mute)]">
              O workspace mostra só o que passou pela curadoria. Aprove os trechos na tela de
              edição e eles aparecem aqui, prontos para o despacho.
            </p>
            <Button variant="outline" size="sm" className="mt-3" asChild>
              <Link to={`/shorts/${corteId}`}>
                <Pencil />
                Ir para a edição
              </Link>
            </Button>
          </div>
        )}

        {naPrateleira.length > 0 && (
          <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(220px,1fr))]">
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
