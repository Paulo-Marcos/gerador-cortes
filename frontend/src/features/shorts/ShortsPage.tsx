// D-458: a porta da fábrica de shorts.
//
// A tela lista os cortes Fire e os indicados a mão. Um Fire SEM bruto também
// aparece (D-502) — a fábrica sabe refazê-lo sem tocar na pós-produção —, e
// desde a D-528 ele traz a ação junto: refazer o bruto é minuto de FFmpeg sobre
// a live inteira, e ninguém quer pagar isso por ter clicado em outra coisa.
//
// O trabalho aqui é assíncrono por desenho — os candidatos nascem na geração do
// bruto (E-030) e a curadoria acontece quando o operador quiser.
//
// ## D-581: por que a lista ganhou filtro, busca e barra
//
// Porque a pergunta mudou de escala. Com cinco Fires, "listar todos" É a
// resposta; com dezenas, o operador abre a tela procurando UM — aquele em que
// parou — e a lista o obrigava a varrer cartões lendo contagens.
//
// Os três acréscimos respondem três perguntas diferentes, e por isso não são
// redundantes: o FILTRO responde "em que pé está", a BUSCA responde "qual era
// mesmo", e a BARRA de progresso responde "quanto falta" sem obrigar a ler
// número nenhum. A regra dos dois primeiros vive em `filtrosDosFires.ts`, fora
// do JSX, porque é regra e não desenho.
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  CheckCheck,
  Clapperboard,
  Clock,
  HardDrive,
  LayoutGrid,
  Loader2,
  Pencil,
  RotateCcw,
  Search,
  X,
} from 'lucide-react';
import { api } from '@/lib/api';
import { cn, formatarDuracao } from '@/lib/utils';
import { isWorkbenchEnabled } from '@/components/workbench/workbenchFlag';
import type { ContagemShorts, FireComBruto } from './shortsApi';
import { FIRES_KEY, useFires } from './useFires';
import { useMarcarFinalizado } from './useShortsDoCorte';
import { SeloFinalizado } from './CabecalhoDoFire';
import { useDefinirChrome } from '@/upgrade/UpgradeChrome';
import { isUpgradeShellEnabled } from '@/upgrade/upgradeFlag';
import {
  contarPorFiltro,
  estaFinalizado,
  FILTROS,
  filtrarFires,
  progressoDaCuradoria,
  temEdicao,
  type FiltroDeFire,
} from './filtrosDosFires';

const CHIPS: { chave: keyof ContagemShorts; um: string; varios: string; classe: string }[] = [
  { chave: 'sugerido', um: 'sugerido', varios: 'sugeridos', classe: 'text-[var(--wb-text-mute)]' },
  { chave: 'aprovado', um: 'aprovado', varios: 'aprovados', classe: 'text-[var(--wb-ok-ink)]' },
  { chave: 'renderizado', um: 'pronto', varios: 'prontos', classe: 'text-[var(--wb-accent)]' },
];

function ContagemChips({ shorts }: { shorts: ContagemShorts }) {
  if (shorts.total === 0) {
    return (
      <span className="text-[12px] text-[var(--wb-text-mute)]">
        nenhum candidato ainda — gere o bruto de novo para a IA propor
      </span>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      {CHIPS.filter(({ chave }) => shorts[chave] > 0).map(({ chave, um, varios, classe }) => (
        <span
          key={chave}
          className={cn('font-code text-[12px] font-semibold tabular-nums', classe)}
        >
          {shorts[chave]} {shorts[chave] === 1 ? um : varios}
        </span>
      ))}
    </div>
  );
}

/**
 * A barra fina do progresso da curadoria.
 *
 * Fica no TOPO do cartão, colada na borda, e não entre os textos: ali ela é
 * lida como propriedade do cartão inteiro — quanto deste corte já andou — em
 * vez de virar mais uma linha disputando leitura com o título.
 */
function BarraDeProgresso({ fire }: { fire: FireComBruto }) {
  const fracao = progressoDaCuradoria(fire);
  if (fire.shorts.total === 0) return null;

  return (
    <div
      className="h-[3px] w-full overflow-hidden rounded-t-[11px] bg-[var(--wb-bg-inset)]"
      title={`${fire.shorts.total - fire.shorts.sugerido} de ${fire.shorts.total} candidatos já decididos`}
      aria-hidden
    >
      <div
        className={cn(
          'h-full transition-[width]',
          // Tudo pronto é verde; em andamento é o acento. A cor muda no fim, e
          // não no meio, porque é o fim que o operador procura na varredura.
          fire.shorts.renderizado === fire.shorts.total
            ? 'bg-[var(--wb-ok-ink)]'
            : 'bg-[var(--wb-accent)]',
        )}
        style={{ width: `${Math.round(fracao * 100)}%` }}
      />
    </div>
  );
}

function FireCard({ fire }: { fire: FireComBruto }) {
  const finalizado = estaFinalizado(fire);
  const editado = temEdicao(fire);
  const temPronto = fire.shorts.renderizado > 0;

  return (
    <article
      className={cn(
        'group flex flex-col overflow-hidden rounded-[12px] border bg-[var(--wb-bg-panel)] transition-colors',
        editado
          ? 'border-[var(--wb-accent-soft,var(--wb-border))]'
          : 'border-[var(--wb-border)]',
        'hover:border-[var(--wb-text-dim)] focus-within:border-[var(--wb-accent)]',
      )}
    >
      <BarraDeProgresso fire={fire} />

      {/* O corpo inteiro é o link para a edição — o destino óbvio do cartão.
          As ações de rodapé ficam FORA dele: um <a> dentro de outro <a> não é
          HTML válido, e o clique de um engoliria o do outro. */}
      <Link
        to={`/shorts/${fire.corte_id}`}
        className="flex flex-1 flex-col gap-2 p-3.5 pb-2.5 focus-visible:outline-none"
      >
        <div className="flex items-start gap-2">
          <span aria-hidden className="text-[15px] leading-none">
            🔥
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-[14px] font-bold text-[var(--wb-text)]" title={fire.titulo}>
              {fire.titulo || `Corte ${fire.numero}`}
            </h2>
            <p className="mt-0.5 truncate text-[12px] text-[var(--wb-text-dim)]">
              {fire.projeto_titulo || 'live sem titulo'}
              {fire.tema_central ? ` · ${fire.tema_central}` : ''}
            </p>
          </div>
          {/* D-581: a marca de "você mexeu aqui". É o que o filtro seleciona, e
              mostrá-la no cartão evita que o chip pareça mágica: o operador vê
              no item POR QUE ele entrou na aba. */}
          {finalizado && <SeloFinalizado />}
          {editado && !finalizado && (
            <span
              className="flex-none rounded-[5px] bg-[var(--wb-accent-soft)] px-1.5 py-0.5 font-code text-[9.5px] uppercase tracking-wide text-[var(--wb-accent-strong,var(--wb-accent))]"
              title="Você já decidiu, marcou trecho, escreveu gancho ou mexeu no palco deste corte"
            >
              editado
            </span>
          )}
        </div>

        <div className="flex items-center gap-3 font-code text-[11.5px] tabular-nums text-[var(--wb-text-mute)]">
          <span className="inline-flex items-center gap-1">
            <Clock size={12} aria-hidden />
            {formatarDuracao(fire.duracao_seg)}
          </span>
          {/* D-502: sem bruto o corte aparece assim mesmo — dizer "0 MB" seria
              fingir um arquivo. O que ele precisa é de um aviso do que falta. */}
          {fire.tem_bruto ? (
            <span className="inline-flex items-center gap-1">
              <HardDrive size={12} aria-hidden />
              {fire.bruto_mb} MB de bruto
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-[var(--wb-warn-ink)]">
              <HardDrive size={12} aria-hidden />
              sem bruto
            </span>
          )}
          {!fire.is_fire && fire.indicado && (
            <span className="rounded-[4px] bg-[var(--wb-bg-inset)] px-1.5 text-[10px] uppercase tracking-wide">
              indicado
            </span>
          )}
        </div>

        <ContagemChips shorts={fire.shorts} />
      </Link>

      {/* D-581: as duas portas do corte, lado a lado.
          Editar e publicar são trabalhos diferentes — um pede o player e a
          régua, o outro pede a grade dos aprovados — e desde esta demanda são
          telas diferentes. Oferecer as duas aqui evita a escada de "entra na
          edição só para clicar em ir para o workspace". */}
      <footer className="flex items-center gap-1 border-t border-[var(--wb-border-soft)] px-2 py-1.5">
        <Link
          to={`/shorts/${fire.corte_id}`}
          className="inline-flex h-7 flex-1 items-center justify-center gap-1.5 rounded-[7px] text-[12px] font-semibold text-[var(--wb-text-dim)] transition-colors hover:bg-[var(--wb-bg-inset)] hover:text-[var(--wb-text)]"
        >
          <Pencil size={12} aria-hidden />
          Editar
        </Link>
        <Link
          to={`/shorts/${fire.corte_id}/workspace`}
          className={cn(
            'inline-flex h-7 flex-1 items-center justify-center gap-1.5 rounded-[7px] text-[12px] font-semibold transition-colors hover:bg-[var(--wb-bg-inset)]',
            // Sem nada pronto o workspace existe, mas está vazio. O peso menor
            // diz isso sem desabilitar: ver a prateleira vazia é informação.
            temPronto
              ? 'text-[var(--wb-accent)]'
              : 'text-[var(--wb-text-mute)] hover:text-[var(--wb-text)]',
          )}
          title={
            temPronto
              ? 'Os shorts prontos deste corte, com publicação em massa'
              : 'Ainda não há short finalizado neste corte'
          }
        >
          <LayoutGrid size={12} aria-hidden />
          Workspace
        </Link>
        <AlternarFinalizado fire={fire} />
      </footer>
    </article>
  );
}

/**
 * D-593: fecha o corte — os shorts já estão nas três redes — ou o devolve à fila.
 *
 * Sem confirmação de propósito: é reversível no mesmo lugar, a um clique, e o
 * corte continua a um chip de distância na aba "Finalizados".
 */
function AlternarFinalizado({ fire }: { fire: FireComBruto }) {
  const marcar = useMarcarFinalizado();
  const finalizado = estaFinalizado(fire);

  return (
    <button
      type="button"
      disabled={marcar.isPending}
      onClick={() => marcar.mutate({ corteId: fire.corte_id, finalizado: !finalizado })}
      className="inline-flex h-7 flex-1 items-center justify-center gap-1.5 rounded-[7px] text-[12px] font-semibold text-[var(--wb-text-dim)] transition-colors hover:bg-[var(--wb-bg-inset)] hover:text-[var(--wb-text)] disabled:opacity-60"
      title={
        finalizado
          ? 'Devolver este corte para a fila de trabalho'
          : 'Os shorts deste corte já subiram para YouTube, TikTok e Instagram — tirar da fila'
      }
    >
      {marcar.isPending ? (
        <Loader2 size={12} className="animate-spin" aria-hidden />
      ) : finalizado ? (
        <RotateCcw size={12} aria-hidden />
      ) : (
        <CheckCheck size={12} aria-hidden />
      )}
      {finalizado ? 'Reabrir' : 'Finalizar'}
    </button>
  );
}

/** O card e a ação: o botão mora fora do `Link`, senão o clique navegaria junto. */
function ItemDaFila({ fire }: { fire: FireComBruto }) {
  // D-593: corte finalizado sem bruto não pede "gerar bruto" — não há mais o
  // que recortar dele, e o convite seria ruído na aba de concluídos.
  if (fire.tem_bruto || estaFinalizado(fire)) return <FireCard fire={fire} />;

  return (
    <div className="flex flex-col gap-1.5">
      <FireCard fire={fire} />
      <GerarBruto fire={fire} />
    </div>
  );
}

function GerarBruto({ fire }: { fire: FireComBruto }) {
  const queryClient = useQueryClient();
  const [erro, setErro] = useState('');

  // O MESMO endpoint que o editor usa. Refazer o bruto ja tem dono — com status
  // de tarefa e avaliacao no fim —, e um segundo caminho aqui seria uma segunda
  // implementacao da mesma coisa, sem essas duas.
  //
  // Os flags em false sao o ponto: preservam transcricao e cenas. Na 1a geracao
  // o backend os ignora e roda a cadeia inteira, que e o certo; aqui o corte ja
  // rodou uma vez e so perdeu o arquivo.
  const gerar = useMutation({
    mutationFn: () =>
      api.cortarClipBruto(fire.corte_id, { refazer_transcricao: false, refazer_cenas: false }),
    onSuccess: () => {
      setErro('');
      void queryClient.invalidateQueries({ queryKey: FIRES_KEY });
    },
    onError: (e: Error) => setErro(e.message),
  });

  // D-495: nao oferecer o que o backend vai recusar. Sem a live no disco nao ha
  // de onde extrair o trecho, e o FFmpeg falharia com uma mensagem que nao diz
  // o que fazer.
  if (!fire.live_em_disco) {
    return (
      <p className="px-1 text-[11px] leading-snug text-[var(--wb-warn-ink)]">
        A live foi limpa do disco. Baixe-a de novo no workspace para poder gerar o bruto.
      </p>
    );
  }

  return (
    <div className="grid gap-1">
      <button
        type="button"
        disabled={gerar.isPending}
        onClick={() => gerar.mutate()}
        className="inline-flex h-8 items-center justify-center gap-1.5 rounded-[8px] border border-[var(--wb-border)] bg-[var(--wb-bg-inset)] text-[12px] font-semibold text-[var(--wb-text)] transition-colors hover:border-[var(--wb-text-dim)] disabled:opacity-60"
        title="Refaz o vídeo do bruto a partir da live. Não mexe na transcrição nem nas cenas."
      >
        {gerar.isPending ? (
          <Loader2 size={13} className="animate-spin" aria-hidden />
        ) : (
          <RotateCcw size={13} aria-hidden />
        )}
        {gerar.isPending ? 'gerando o bruto…' : 'Gerar bruto'}
      </button>
      {erro && <p className="px-1 text-[11px] leading-snug text-[var(--wb-warn-ink)]">{erro}</p>}
    </div>
  );
}

function Vazio() {
  return (
    <div className="mx-auto max-w-md py-16 text-center">
      <span aria-hidden className="text-[32px]">
        🔥
      </span>
      <p className="mt-3 text-[14px] font-semibold text-[var(--wb-text)]">
        Nenhum corte na fábrica de shorts
      </p>
      <p className="mt-2 text-[13px] leading-relaxed text-[var(--wb-text-mute)]">
        Marque um corte com Fire, ou indique um para shorts na tela do corte: a IA propõe os trechos
        verticais no fim da esteira, e eles aparecem aqui para você trabalhar quando quiser.
      </p>
    </div>
  );
}

/**
 * O vazio do FILTRO — diferente do vazio da fábrica.
 *
 * "Nenhum corte na fábrica" pede que se marque um Fire; "nenhum corte nesta
 * aba" pede que se troque de aba. Mostrar a primeira mensagem no segundo caso
 * mandaria o operador refazer um trabalho que já está feito, noutro filtro.
 */
function VazioDoFiltro({ onLimpar }: { onLimpar: () => void }) {
  return (
    <div className="mx-auto max-w-md py-16 text-center">
      <p className="text-[14px] font-semibold text-[var(--wb-text)]">
        Nenhum corte com este recorte
      </p>
      <p className="mt-2 text-[13px] leading-relaxed text-[var(--wb-text-mute)]">
        Há Fires na fábrica, mas nenhum se encaixa no filtro e na busca de agora.
      </p>
      <button
        type="button"
        onClick={onLimpar}
        className="mt-3 text-[12.5px] font-semibold text-[var(--wb-accent)] underline-offset-2 hover:underline"
      >
        ver todos de novo
      </button>
    </div>
  );
}

const CASCA_NOVA = isUpgradeShellEnabled();

export default function ShortsPage() {
  useDefinirChrome(
    { sub: 'cortes fire com bruto guardado — a nata, pronta para virar vertical' },
    [],
  );

  const workbench = isWorkbenchEnabled();
  const { data, isLoading, isError, error } = useFires();
  const [filtro, setFiltro] = useState<FiltroDeFire>('todos');
  const [busca, setBusca] = useState('');

  const fires = useMemo(() => data?.fires ?? [], [data]);
  const contagens = useMemo(() => contarPorFiltro(fires), [fires]);
  const visiveis = useMemo(() => filtrarFires(fires, filtro, busca), [fires, filtro, busca]);

  const limpar = () => {
    setFiltro('todos');
    setBusca('');
  };

  return (
    <div
      className={cn(
        'flex min-h-0 flex-col overflow-hidden bg-[var(--wb-bg)] text-[var(--wb-text)]',
        // No shell LEGADO a pagina fica ABAIXO de um cabecalho de 3.5rem, e
        // `h-screen` a fazia medir a viewport inteira — transbordando por
        // exatamente a altura desse cabecalho. Com o conteudo rolando dentro
        // (D-499), a ultima linha ficava inalcancavel. No workbench a pagina ja
        // recebe a altura do pai, e `h-full` continua certo.
        workbench ? 'h-full' : 'h-[calc(100vh-3.5rem)]',
      )}
    >
      <header
        className={cn(
          'flex-none space-y-2.5 border-b border-[var(--wb-border-soft)] bg-[var(--wb-bg)]',
          workbench ? 'px-4 py-3' : 'px-7 py-5',
        )}
      >
        <div className="flex items-center gap-2">
          {CASCA_NOVA ? null : (
            <>
              <Clapperboard size={18} className="text-[var(--wb-accent)]" aria-hidden />
              <h1 className="text-[15px] font-extrabold">Shorts</h1>
              <span className="text-xs text-[var(--wb-text-mute)]">
                cortes Fire com bruto guardado — a nata, pronta para virar vertical
              </span>
            </>
          )}

          <div className="flex-1" />

          {/* A busca fica no cabeçalho e não sobre a lista: ela vale para a
              fila inteira, e um campo flutuando entre os cartões sugeriria que
              procura só no que está à vista. */}
          <label className="relative flex items-center">
            <Search
              size={13}
              className="pointer-events-none absolute left-2 text-[var(--wb-text-mute)]"
              aria-hidden
            />
            <input
              type="search"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="buscar por título, live ou tema"
              aria-label="Buscar cortes"
              className="h-7 w-[230px] rounded-[7px] border border-[var(--wb-border)] bg-[var(--wb-bg-inset)] pl-7 pr-6 text-[12px] text-[var(--wb-text)] outline-none placeholder:text-[var(--wb-text-mute)] focus:border-[var(--wb-accent)]"
            />
            {busca && (
              <button
                type="button"
                onClick={() => setBusca('')}
                aria-label="Limpar busca"
                className="absolute right-1.5 text-[var(--wb-text-mute)] hover:text-[var(--wb-text)]"
              >
                <X size={12} />
              </button>
            )}
          </label>
        </div>

        {/* Os chips só aparecem com fila: numa fábrica vazia eles seriam cinco
            zeros pedindo para filtrar o nada. */}
        {fires.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            {FILTROS.map(({ id, rotulo, nota }) => {
              const quantos = contagens[id];
              const ativo = filtro === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setFiltro(id)}
                  title={nota}
                  aria-pressed={ativo}
                  // Chip com zero fica VISÍVEL e desabilitado, não some: a
                  // ausência é resposta ("não tem nada pronto ainda"), e um
                  // chip que aparece e desaparece muda o layout debaixo do
                  // dedo a cada refetch.
                  disabled={quantos === 0 && !ativo}
                  className={cn(
                    'inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-[12px] font-semibold transition-colors',
                    ativo
                      ? 'border-[var(--wb-accent)] bg-[var(--wb-accent-soft)] text-[var(--wb-accent-strong,var(--wb-accent))]'
                      : 'border-[var(--wb-border)] text-[var(--wb-text-dim)] hover:border-[var(--wb-text-dim)] hover:text-[var(--wb-text)]',
                    quantos === 0 && !ativo && 'opacity-40',
                  )}
                >
                  {rotulo}
                  <span className="font-code text-[11px] tabular-nums opacity-70">{quantos}</span>
                </button>
              );
            })}
          </div>
        )}
      </header>

      <main className="flex-1 overflow-auto p-4">
        {isLoading && (
          <p className="py-16 text-center text-[13px] text-[var(--wb-text-mute)]">
            Procurando os Fires…
          </p>
        )}

        {isError && (
          <p className="py-16 text-center text-[13px] text-[var(--wb-danger-ink,var(--wb-text))]">
            Nao consegui carregar os Fires: {(error as Error)?.message ?? 'erro desconhecido'}
          </p>
        )}

        {!isLoading && !isError && fires.length === 0 && <Vazio />}

        {fires.length > 0 && visiveis.length === 0 && <VazioDoFiltro onLimpar={limpar} />}

        {visiveis.length > 0 && (
          <div className="grid gap-2.5 [grid-template-columns:repeat(auto-fill,minmax(280px,1fr))]">
            {visiveis.map((fire) => (
              <ItemDaFila key={fire.corte_id} fire={fire} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
