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
//
// ## D-803: por que a lista virou grupos por live
//
// Porque os Fires de uma live dividem a matéria-prima. Com a live limpa, a
// pergunta útil é "quantos cortes desta live estão parados?" — e a resposta
// vira UM clique que baixa a live uma vez e atende todos (`agrupamentoPorLive.ts`).
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CheckCheck, Clock, Download, Flame, HardDrive, LayoutGrid, Loader2, Pencil, RotateCcw, Search, Sparkles, X } from 'lucide-react';
import { cn, formatarDuracao } from '@/lib/utils';
import { motivoDoErro, shortsApi, type AndamentoDaLive, type ContagemShorts, type FireComBruto } from './shortsApi';
import { ANDAMENTO_DAS_LIVES_KEY, estaRodando, FIRES_KEY, useAndamentoDasLives, useFires } from './useFires';
import { shortsDoCorteKey, useMarcarFinalizado } from './useShortsDoCorte';
import { agruparPorLive, type GrupoDaLive } from './agrupamentoPorLive';
import { SeloFinalizado } from './CabecalhoDoFire';
import { useDefinirChrome } from '@/upgrade/UpgradeChrome';
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
        nenhum candidato ainda
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
      className="card group flex flex-col overflow-hidden"
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
          <Flame size={15} aria-hidden style={{ color: 'var(--accent)', flex: 'none' }} />
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
function ItemDaFila({ fire, liveRodando }: { fire: FireComBruto; liveRodando: boolean }) {
  // D-593: corte finalizado não pede mais nada — o convite seria ruído na aba
  // de concluídos.
  if (estaFinalizado(fire)) return <FireCard fire={fire} />;

  return (
    <div className="flex flex-col gap-1.5">
      <FireCard fire={fire} />
      <GerarComIa fire={fire} liveRodando={liveRodando} />
    </div>
  );
}

/**
 * D-803: o mesmo trabalho que o fim do bruto faz sozinho, agora no clique.
 *
 * Existe porque o automático só roda quando o bruto termina: o Fire marcado
 * depois, o indicado à mão e a proposta que falhou ficavam sem short e sem
 * caminho. Sem bruto, ele é refeito antes, sem tocar na transcrição nem nas
 * cenas (D-160). Nada do que já está na fila é apagado (RN-26).
 */
function GerarComIa({ fire, liveRodando }: { fire: FireComBruto; liveRodando: boolean }) {
  const queryClient = useQueryClient();
  const [aviso, setAviso] = useState('');

  const gerar = useMutation({
    mutationFn: () => shortsApi.gerarManualmente(fire.corte_id),
    onSuccess: (r) => {
      const repetidos = r.descartes.length ? ` · ${r.descartes.length} descartado(s)` : '';
      setAviso(
        r.bruto_regerado && r.shorts.length === 0
          ? 'Bruto refeito; a IA propôs os trechos junto com ele.'
          : `${r.shorts.length} candidato(s) novo(s)${repetidos}`,
      );
      void queryClient.invalidateQueries({ queryKey: FIRES_KEY });
      void queryClient.invalidateQueries({ queryKey: shortsDoCorteKey(fire.corte_id) });
    },
    onError: (e) => setAviso(motivoDoErro(e, 'Não consegui gerar os shorts.')),
  });

  // D-495: não oferecer o que o backend vai recusar. Sem bruto e sem a live não
  // há de onde recortar; o caminho é o botão da live, no cabeçalho do grupo.
  if (!fire.tem_bruto && !fire.live_em_disco) {
    return (
      <p className="px-1 text-[11px] leading-snug text-[var(--wb-warn-ink)]">
        Sem bruto e com a live limpa: use “Baixar a live e gerar” no topo do grupo.
      </p>
    );
  }

  return (
    <div className="grid gap-1">
      <button
        type="button"
        disabled={gerar.isPending || liveRodando}
        onClick={() => gerar.mutate()}
        className="inline-flex h-8 items-center justify-center gap-1.5 rounded-[8px] border border-[var(--wb-border)] bg-[var(--wb-bg-inset)] text-[12px] font-semibold text-[var(--wb-text)] transition-colors hover:border-[var(--wb-text-dim)] disabled:opacity-60"
        title={
          fire.tem_bruto
            ? 'A IA propõe trechos novos. Nada da fila é apagado; trecho repetido fica de fora.'
            : 'Refaz o bruto a partir da live (sem mexer na transcrição nem nas cenas) e a IA propõe os trechos.'
        }
      >
        {gerar.isPending ? (
          <Loader2 size={13} className="animate-spin" aria-hidden />
        ) : (
          <Sparkles size={13} aria-hidden />
        )}
        {gerar.isPending
          ? 'a IA está propondo…'
          : fire.tem_bruto
            ? 'Gerar shorts com IA'
            : 'Gerar bruto e shorts com IA'}
      </button>
      {aviso && <p className="px-1 text-[11px] leading-snug text-[var(--wb-text-mute)]">{aviso}</p>}
    </div>
  );
}

/**
 * D-803: a faixa de cada live — quantos cortes ela tem, quantos estão parados,
 * e o clique que atende todos de uma vez.
 */
function CabecalhoDaLive({ grupo, andamento }: { grupo: GrupoDaLive; andamento?: AndamentoDaLive }) {
  const queryClient = useQueryClient();
  const [erro, setErro] = useState('');
  const rodando = andamento ? estaRodando(andamento) : false;

  const disparar = useMutation({
    mutationFn: () => shortsApi.gerarDaLive(grupo.projetoId),
    onSuccess: () => {
      setErro('');
      void queryClient.invalidateQueries({ queryKey: ANDAMENTO_DAS_LIVES_KEY });
    },
    onError: (e) => setErro(motivoDoErro(e, 'Não consegui disparar a live.')),
  });

  return (
    <header className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-[var(--wb-border-soft)] pb-2">
      <div className="min-w-0 flex-1">
        <h2 className="truncate text-[13.5px] font-bold text-[var(--wb-text)]" title={grupo.titulo}>
          {grupo.titulo || 'live sem título'}
        </h2>
        <p className="font-code text-[11.5px] tabular-nums text-[var(--wb-text-mute)]">
          {grupo.totalDaLive} {grupo.totalDaLive === 1 ? 'corte' : 'cortes'} na fábrica
          {grupo.pendentes > 0 && ` · ${grupo.pendentes} sem bruto ou sem short`}
          {grupo.precisaBaixar && ' · live limpa do disco'}
        </p>
        {/* A falha de um corte não para a live; ela aparece aqui, com o nome dele. */}
        {andamento?.erros.map((motivo) => (
          <p key={motivo} className="text-[11px] leading-snug text-[var(--wb-warn-ink)]">
            {motivo}
          </p>
        ))}
        {erro && <p className="text-[11px] leading-snug text-[var(--wb-warn-ink)]">{erro}</p>}
      </div>

      {rodando && andamento ? (
        <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-[var(--wb-accent)]">
          <Loader2 size={13} className="animate-spin" aria-hidden />
          {andamento.etapa === 'baixando'
            ? 'baixando a live…'
            : `gerando ${Math.min(andamento.feitos + 1, andamento.total)} de ${andamento.total}…`}
        </span>
      ) : grupo.pendentes > 0 ? (
        <button
          type="button"
          disabled={disparar.isPending}
          onClick={() => disparar.mutate()}
          className="inline-flex h-8 items-center gap-1.5 rounded-[8px] border border-[var(--wb-accent)] bg-[var(--wb-accent-soft)] px-3 text-[12px] font-semibold text-[var(--wb-accent-strong,var(--wb-accent))] disabled:opacity-60"
          title="Um corte por vez: refaz o bruto que falta e a IA propõe os trechos. Nada do que já existe é apagado."
        >
          {grupo.precisaBaixar ? <Download size={13} aria-hidden /> : <Sparkles size={13} aria-hidden />}
          {grupo.precisaBaixar
            ? `Baixar a live e gerar (${grupo.pendentes})`
            : grupo.pendentes === 1
              ? 'Gerar o que falta'
              : `Gerar os ${grupo.pendentes} que faltam`}
        </button>
      ) : null}
    </header>
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

export default function ShortsPage() {
  const { data, isLoading, isError, error } = useFires();
  const { data: andamento } = useAndamentoDasLives();
  const [filtro, setFiltro] = useState<FiltroDeFire>('todos');
  const [busca, setBusca] = useState('');

  const fires = useMemo(() => data?.fires ?? [], [data]);
  const contagens = useMemo(() => contarPorFiltro(fires), [fires]);

  useDefinirChrome(
    { sub: `${fires.length} fire com bruto · ${contagens.prontos} com short pronto` },
    [fires.length, contagens.prontos],
  );
  const visiveis = useMemo(() => filtrarFires(fires, filtro, busca), [fires, filtro, busca]);
  const grupos = useMemo(() => agruparPorLive(visiveis, fires), [visiveis, fires]);
  const andamentoDe = (projetoId: string) =>
    andamento?.lives.find((live) => live.projeto_id === projetoId);

  const limpar = () => {
    setFiltro('todos');
    setBusca('');
  };

  // D-599: o design poe filtros e busca na MESMA linha — chips a esquerda,
  // busca a direita — e a grade logo abaixo. Titulo e subtitulo ja estao no
  // cabecalho da casca; repetir a faixa com borda aqui empilharia dois
  // cabecalhos.
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
        {fires.length > 0
          ? FILTROS.map(({ id, rotulo, nota }) => {
              const quantos = contagens[id];
              const ativo = filtro === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setFiltro(id)}
                  title={nota}
                  aria-pressed={ativo}
                  disabled={quantos === 0 && !ativo}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 5,
                    height: 30,
                    padding: '0 10px',
                    border: `1px solid ${ativo ? 'var(--accent)' : 'var(--line)'}`,
                    borderRadius: 'var(--r2)',
                    background: ativo ? 'var(--accent-soft)' : 'var(--panel)',
                    color: ativo ? 'var(--accent2)' : 'var(--mute)',
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: quantos === 0 && !ativo ? 'default' : 'pointer',
                    opacity: quantos === 0 && !ativo ? 0.45 : 1,
                  }}
                >
                  {rotulo}
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 10.5, opacity: 0.7 }}>
                    {quantos}
                  </span>
                </button>
              );
            })
          : null}
        <div style={{ flex: 1 }} />
        <label className="fld" style={{ width: 240 }}>
          <Search size={12} aria-hidden style={{ color: 'var(--dim)' }} />
          <input
            type="search"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="buscar por título, live ou tema"
            aria-label="Buscar cortes"
            style={{
              minWidth: 0,
              flex: 1,
              border: 0,
              outline: 'none',
              background: 'transparent',
              fontSize: 12,
            }}
          />
          {busca ? (
            <button
              type="button"
              onClick={() => setBusca('')}
              aria-label="Limpar busca"
              className="btn btn-icon btn-ghost"
              style={{ width: 18, height: 18 }}
            >
              <X size={11} />
            </button>
          ) : null}
        </label>
      </div>

      {isLoading ? (
        <p style={{ padding: '64px 0', textAlign: 'center', color: 'var(--mute)' }}>
          Procurando os Fires…
        </p>
      ) : null}
      {isError ? (
        <p style={{ padding: '64px 0', textAlign: 'center', color: 'var(--err)' }}>
          Não consegui carregar os Fires: {(error as Error)?.message ?? 'erro desconhecido'}
        </p>
      ) : null}
      {!isLoading && !isError && fires.length === 0 ? <Vazio /> : null}
      {fires.length > 0 && visiveis.length === 0 ? <VazioDoFiltro onLimpar={limpar} /> : null}

      {grupos.map((grupo) => {
        const daLive = andamentoDe(grupo.projetoId);
        return (
          <section key={grupo.projetoId} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <CabecalhoDaLive grupo={grupo} andamento={daLive} />
            <div
              style={{
                display: 'grid',
                gap: 10,
                gridTemplateColumns: 'repeat(auto-fill,minmax(310px,1fr))',
              }}
            >
              {grupo.fires.map((fire) => (
                <ItemDaFila
                  key={fire.corte_id}
                  fire={fire}
                  liveRodando={daLive ? estaRodando(daLive) : false}
                />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
