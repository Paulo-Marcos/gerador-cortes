// D-611: a central de shorts prontos — tudo o que falta subir, de qualquer corte.
//
// ## O problema que ela resolve
//
// A prateleira do Fire (D-581) organiza o despacho POR CORTE. Funciona para o
// corte que acabou de sair, e vira labirinto no dia de publicar: entrar num
// corte, pôr capa, sair, entrar no outro, pôr post, voltar ao primeiro porque
// faltou o TikTok. O operador não pensa "o que falta do corte 7", pensa "o que
// ainda não foi". Esta tela responde essa pergunta de uma vez.
//
// ## Quando um short sai daqui
//
// Só quando está no ar nas TRÊS redes (ou quando o corte foi declarado
// finalizado, D-593). Sair na primeira publicação esconderia exatamente o que
// mais se esquece: o Instagram que ficou para depois.
//
// ## O que se faz aqui, e o que não
//
// Post, capa, kit de textos e lote — o FECHO. Editar o trecho (bordas, palco,
// gancho) continua na tela de edição: um short que precisa de ajuste de corte
// não está pronto, e trazer o editor para cá devolveria à central a poluição
// que a D-581 tirou da edição.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import {
  Check,
  CircleDashed,
  ClipboardList,
  FileText,
  Image as ImageIcon,
  LayoutGrid,
  Send,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { isWorkbenchEnabled } from '@/components/workbench/workbenchFlag';
import { useDefinirChrome } from '@/upgrade/UpgradeChrome';
import { MolduraDeVideo } from '@/upgrade/MolduraDeVideo';
import { isUpgradeShellEnabled } from '@/upgrade/upgradeFlag';
import {
  REDES_DO_SHORT,
  contarPorFiltro,
  filtrarProntos,
  origemDoPronto,
  paraOLote,
  publicacoesDosProntos,
  redesQueFaltam,
  type FiltroDosProntos,
} from './centralProntos';
import { KitDoShortModal } from './KitDoShortModal';
import { PublicarEmLoteModal } from './PublicarEmLoteModal';
import { alternar } from './selecaoDoLote';
import { capaImagemUrl, shortVideoUrl, type ShortPronto } from './shortsApi';
import { useFechoDoShort } from './useFechoDoShort';
import { useLoteAtual } from './useLotePublicacao';
import { PRONTOS_KEY, useShortsProntos } from './useShortsProntos';

const CASCA_NOVA = isUpgradeShellEnabled();

const FILTROS: Array<{ id: FiltroDosProntos; texto: string }> = [
  { id: 'todos', texto: 'Todos' },
  ...REDES_DO_SHORT.map((r) => ({ id: r.id, texto: `Falta ${r.rotulo}` })),
  { id: 'sem_post', texto: 'Sem post' },
  { id: 'sem_capa', texto: 'Sem capa' },
];

export default function ShortsProntosPage() {
  const workbench = isWorkbenchEnabled();
  const { data, isLoading, isError, error } = useShortsProntos();
  const [filtro, setFiltro] = useState<FiltroDosProntos>('todos');
  const [selecionados, setSelecionados] = useState<string[]>([]);
  // Cada abertura do lote é um modal novo (via `key`): ele nasce com a seleção
  // DESTA tela, e não com a que sobrou da última vez.
  const [aberturaDoLote, setAberturaDoLote] = useState(0);
  const [publicandoEmLote, setPublicandoEmLote] = useState(false);

  const prontos = useMemo(() => data?.shorts ?? [], [data]);
  const visiveis = useMemo(() => filtrarProntos(prontos, filtro), [prontos, filtro]);
  const contagens = useMemo(() => contarPorFiltro(prontos), [prontos]);
  const registradas = useMemo(() => publicacoesDosProntos(prontos), [prontos]);
  const doLote = useMemo(() => paraOLote(prontos), [prontos]);

  // Selecionado que sumiu da central (subiu em tudo) não pode ir para o lote.
  const escolhidos = selecionados.filter((id) => prontos.some((p) => p.id === id));
  // Sem nada marcado, o botão publica o que está À VISTA — é o "subir todos".
  const alvoDoLote = escolhidos.length > 0 ? escolhidos : visiveis.map((p) => p.id);
  const todosVisiveisMarcados =
    visiveis.length > 0 && visiveis.every((p) => escolhidos.includes(p.id));

  useAtualizarAoPublicar();

  const abrirLote = () => {
    setAberturaDoLote((n) => n + 1);
    setPublicandoEmLote(true);
  };
  const textoDoPrimario =
    alvoDoLote.length === 0
      ? 'Nada para publicar'
      : escolhidos.length > 0
        ? `Publicar ${escolhidos.length} selecionado${escolhidos.length === 1 ? '' : 's'}`
        : `Publicar todos (${alvoDoLote.length})`;
  const resumo = [
    `${prontos.length} short${prontos.length === 1 ? '' : 's'} faltando em alguma rede`,
    contagens.sem_post > 0 ? `${contagens.sem_post} sem post` : null,
    contagens.sem_capa > 0 ? `${contagens.sem_capa} sem capa` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  useDefinirChrome(
    {
      titulo: 'Prontos para publicar',
      sub: resumo,
      barra: {
        primario: {
          texto: textoDoPrimario,
          icone: 'send',
          onClick: abrirLote,
          desabilitado: alvoDoLote.length === 0,
        },
      },
    },
    [resumo, textoDoPrimario, alvoDoLote.length],
  );

  return (
    <div
      className={cn(
        'flex min-h-0 flex-col overflow-hidden text-[var(--wb-text)]',
        CASCA_NOVA ? '' : 'bg-[var(--wb-bg)]',
        CASCA_NOVA ? '' : workbench ? 'h-full' : 'h-[calc(100vh-3.5rem)]',
      )}
    >
      {!CASCA_NOVA && (
        <header className="flex flex-none items-center gap-2.5 border-b border-[var(--wb-border-soft)] bg-[var(--wb-bg-panel)] px-5 py-3">
          <Send size={16} className="text-[var(--wb-accent)]" aria-hidden />
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-[14.5px] font-extrabold leading-tight">
              Prontos para publicar
            </h1>
            <p className="truncate text-[11.5px] text-[var(--wb-text-mute)]">{resumo}</p>
          </div>
          <Button size="sm" disabled={alvoDoLote.length === 0} onClick={abrirLote}>
            <Send />
            {textoDoPrimario}
          </Button>
        </header>
      )}

      <main className={CASCA_NOVA ? '' : 'flex-1 overflow-auto p-4'}>
        {prontos.length > 0 && (
          <div className="mb-3 flex flex-wrap items-center gap-1.5">
            {FILTROS.map((f) => (
              <button
                key={f.id}
                type="button"
                aria-pressed={filtro === f.id}
                onClick={() => setFiltro(f.id)}
                className={cn(
                  'rounded-full border px-2.5 py-1 text-[11.5px] transition-colors',
                  filtro === f.id
                    ? 'border-[var(--wb-accent)] bg-[var(--wb-accent-soft)] font-semibold'
                    : 'border-[var(--wb-border)] text-[var(--wb-text-dim)] hover:bg-[var(--wb-bg-inset)]',
                )}
              >
                {f.texto} <span className="font-code tabular-nums">{contagens[f.id]}</span>
              </button>
            ))}
            <div className="flex-1" />
            {visiveis.length > 0 && (
              <button
                type="button"
                className="text-[11.5px] text-[var(--wb-accent)]"
                onClick={() =>
                  setSelecionados(todosVisiveisMarcados ? [] : visiveis.map((p) => p.id))
                }
              >
                {todosVisiveisMarcados ? 'limpar seleção' : 'selecionar todos'}
              </button>
            )}
          </div>
        )}

        {isLoading && (
          <p className="py-16 text-center text-[13px] text-[var(--wb-text-mute)]">
            Juntando os shorts prontos…
          </p>
        )}

        {isError && (
          <p className="py-16 text-center text-[13px] text-[var(--wb-text-dim)]">
            Não consegui carregar os prontos: {(error as Error)?.message ?? 'erro desconhecido'}
          </p>
        )}

        {!isLoading && !isError && prontos.length === 0 && (
          <div className="mx-auto max-w-md py-16 text-center">
            <LayoutGrid size={28} className="mx-auto text-[var(--wb-text-mute)]" aria-hidden />
            <p className="mt-3 text-[14px] font-semibold">Nada esperando publicação</p>
            <p className="mt-2 text-[13px] leading-relaxed text-[var(--wb-text-mute)]">
              Todo short renderizado já está no YouTube, no TikTok e no Instagram. Os próximos que
              você finalizar na fábrica aparecem aqui.
            </p>
            <Button variant="outline" size="sm" className="mt-3" asChild>
              <Link to="/shorts">Ir para os Shorts</Link>
            </Button>
          </div>
        )}

        {visiveis.length > 0 && (
          <div
            className="grid gap-3"
            style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(220px,1fr))' }}
          >
            {visiveis.map((pronto) => (
              <CartaoDaCentral
                key={pronto.id}
                pronto={pronto}
                marcado={escolhidos.includes(pronto.id)}
                onMarcar={() => setSelecionados((atual) => alternar(atual, pronto.id))}
              />
            ))}
          </div>
        )}

        {prontos.length > 0 && visiveis.length === 0 && (
          <p className="py-10 text-center text-[13px] text-[var(--wb-text-mute)]">
            Nenhum short neste filtro.
          </p>
        )}
      </main>

      <PublicarEmLoteModal
        key={aberturaDoLote}
        open={publicandoEmLote}
        onClose={() => setPublicandoEmLote(false)}
        shorts={doLote}
        publicacoes={registradas}
        selecaoInicial={alvoDoLote}
        plataformasIniciais={redesQueFaltam(prontos, alvoDoLote)}
      />
    </div>
  );
}

/**
 * Refaz a central a cada publicação que o lote conclui.
 *
 * Esperar o lote inteiro terminar deixaria na tela, por minutos, shorts que já
 * subiram em tudo — e o operador marcaria de novo o que acabou de publicar.
 */
function useAtualizarAoPublicar() {
  const cliente = useQueryClient();
  const lote = useLoteAtual().data?.lote ?? null;
  const publicados = lote
    ? lote.raias.flatMap((r) => r.itens).filter((i) => i.estado === 'publicado').length
    : 0;
  const anterior = useRef(publicados);

  useEffect(() => {
    if (publicados === anterior.current) return;
    anterior.current = publicados;
    void cliente.invalidateQueries({ queryKey: PRONTOS_KEY });
  }, [publicados, cliente]);
}

function CartaoDaCentral({
  pronto,
  marcado,
  onMarcar,
}: {
  pronto: ShortPronto;
  marcado: boolean;
  onMarcar: () => void;
}) {
  const fecho = useFechoDoShort(pronto);
  const [kitAberto, setKitAberto] = useState(false);
  const cliente = useQueryClient();

  // O cartão resume post e capa a partir da central; quando um dos modais
  // fecha, o resumo pode ter mudado — "sem capa" logo depois de escolher a
  // capa faria parecer que a escolha não gravou.
  const etapaAnterior = useRef(fecho.etapa);
  useEffect(() => {
    if (etapaAnterior.current !== 'nenhuma' && fecho.etapa === 'nenhuma') {
      void cliente.invalidateQueries({ queryKey: PRONTOS_KEY });
    }
    etapaAnterior.current = fecho.etapa;
  }, [fecho.etapa, cliente]);

  return (
    <article
      className={cn(
        'flex flex-col overflow-hidden rounded-[12px] border bg-[var(--wb-bg-card)]',
        marcado ? 'border-[var(--wb-accent)]' : 'border-[var(--wb-border)]',
      )}
    >
      {/* R4: a moldura de vídeo também no retrato. `mat` maior que o do 16:9
          porque no vertical a moldura aparece nas laterais, que é onde a
          vertical tem mais borda por área. */}
      <MolduraDeVideo proporcao="9/16" mat={9}>
        <video
          src={shortVideoUrl(pronto.id, 'final')}
          controls
          preload="metadata"
          poster={
            pronto.capa.tem_capa ? capaImagemUrl(pronto.id, pronto.capa.instante_seg) : undefined
          }
          className="absolute inset-0 h-full w-full"
        />
        <label
          className="absolute left-2 top-2 flex cursor-pointer items-center gap-1 rounded-[6px] bg-black/60 px-1.5 py-1 text-[11px] text-white"
          title="Incluir no lote"
        >
          <input
            type="checkbox"
            checked={marcado}
            onChange={onMarcar}
            className="size-3.5 accent-[var(--wb-accent)]"
          />
          lote
        </label>
      </MolduraDeVideo>

      <div className="flex flex-col gap-2 p-2.5">
        <div>
          <h3 className="line-clamp-2 text-[12.5px] font-bold leading-snug" title={pronto.titulo}>
            {pronto.titulo || `Trecho ${pronto.numero}`}
          </h3>
          <Link
            to={`/shorts/${pronto.corte_id}/workspace`}
            className="block truncate text-[11px] text-[var(--wb-text-mute)] hover:text-[var(--wb-accent)]"
            title={pronto.corte_titulo}
          >
            {origemDoPronto(pronto)} · {Math.round(pronto.duracao_seg)}s
          </Link>
        </div>

        {/* Onde já está e onde falta — as três redes sempre, na mesma ordem,
            para a leitura de uma grade inteira ser por coluna e não por texto. */}
        <div className="flex flex-wrap gap-1">
          {REDES_DO_SHORT.map((rede) => {
            const noAr = pronto.publicadas.includes(rede.id);
            return (
              <span
                key={rede.id}
                className={cn(
                  'inline-flex items-center gap-0.5 rounded-[4px] px-1.5 py-0.5 font-code text-[9.5px] uppercase tracking-wide',
                  noAr
                    ? 'bg-[var(--wb-ok-soft)] text-[var(--wb-ok-ink)]'
                    : 'bg-[var(--wb-bg-inset)] text-[var(--wb-text-mute)]',
                )}
                title={noAr ? `já está no ${rede.rotulo}` : `falta no ${rede.rotulo}`}
              >
                {noAr ? <Check size={9} aria-hidden /> : <CircleDashed size={9} aria-hidden />}
                {rede.rotulo}
              </span>
            );
          })}
        </div>

        <BotaoDoFecho
          icone={<FileText size={13} aria-hidden />}
          titulo={pronto.post.gerado ? pronto.post.titulo : 'Escrever o post'}
          nota={pronto.post.gerado ? `${pronto.post.hashtags} hashtags` : 'sem post ainda'}
          falta={!pronto.post.gerado}
          onClick={fecho.abrirPost}
        />
        <BotaoDoFecho
          icone={<ImageIcon size={13} aria-hidden />}
          titulo={pronto.capa.tem_capa ? 'Capa escolhida' : 'Escolher a capa'}
          nota={pronto.capa.tem_capa ? 'trocar a capa' : 'sem capa — a rede escolhe um quadro'}
          falta={!pronto.capa.tem_capa}
          onClick={fecho.abrirCapa}
        />

        <Button variant="outline" size="sm" onClick={() => setKitAberto(true)}>
          <ClipboardList />
          Kit de publicação
        </Button>
      </div>

      {fecho.modais}
      <KitDoShortModal open={kitAberto} onClose={() => setKitAberto(false)} short={pronto} />
    </article>
  );
}

function BotaoDoFecho({
  icone,
  titulo,
  nota,
  falta,
  onClick,
}: {
  icone: React.ReactNode;
  titulo: string;
  nota: string;
  falta: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex items-center gap-2 rounded-[8px] border px-2.5 py-1.5 text-left transition-colors hover:bg-[var(--wb-bg-inset)]',
        falta ? 'border-dashed border-[var(--wb-border)]' : 'border-[var(--wb-border-soft)]',
      )}
    >
      <span className={cn('flex-none', falta ? 'text-[var(--wb-accent)]' : 'opacity-70')}>
        {icone}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[12px] font-semibold">{titulo}</span>
        <span className="block truncate text-[10.5px] text-[var(--wb-text-mute)]">{nota}</span>
      </span>
    </button>
  );
}
