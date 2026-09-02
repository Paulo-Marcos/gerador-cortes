// D-459: a curadoria dos candidatos de um Fire.
//
// A premissa editorial manda no desenho: o corte Fire já passou pelo funil
// inteiro, então esta tela não é de garimpo — é de ESCOLHA ENTRE BONS. Por isso
// tudo que o operador precisa para decidir (gancho, nota, justificativa,
// duração) fica visível sem clique, e a ação principal — assistir ao trecho —
// está a um botão de distância.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Captions,
  Check,
  Clapperboard,
  Crop,
  Eye,
  Plus,
  MoveHorizontal,
  Play,
  Clapperboard as Render,
  Trash2,
  Undo2,
  X,
} from 'lucide-react';
import { cn, formatarDuracao } from '@/lib/utils';
import { useShortcuts } from '@/features/editor/shortcuts';
import { shortcutFromRegistry } from '@/features/editor/shortcutsRegistry';
import {
  normalizarVelocidade,
  useVelocidadeNoVideo,
  useVelocidadePlayerPadrao,
} from '@/hooks/useVelocidadePlayerPadrao';
import { isWorkbenchEnabled } from '@/components/workbench/workbenchFlag';
import { brutoUrl, shortVideoUrl, type ShortSugerido, type StatusShort } from './shortsApi';
import { avisoDescarteBruto } from './descarteBruto';
import { janelaNova } from './linhaDoTempoShort';
import { BordasFinasPanel } from './BordasFinasPanel';
import { LegendaPrevia } from './LegendaPrevia';
import { PalcoDoCorte } from './PalcoDoCorte';
import { PalcoPrevia } from './PalcoPrevia';
import { ProgressoRenderPanel } from './ProgressoRenderPanel';
import { LinhaDoTempo } from './LinhaDoTempo';
import { MascaraEnquadramento } from './MascaraEnquadramento';
import { PainelPublicacao } from './PainelPublicacao';
import { useFires } from './useFires';
import {
  useAtualizarShort,
  useCriarShortManual,
  useDescartarBruto,
  useModelosDePalco,
  usePalcoDoShort,
  useProgressoRender,
  useRenderizarPrevia,
  useRenderizarShort,
  useShortsDoCorte,
  useTranscricaoDoCorte,
} from './useShortsDoCorte';

// D-479: o operador precisa saber a QUALIDADE do que esta lendo. A auto-legenda
// erra grafia, e erro de grafia num short vira o produto — o texto e o conteudo,
// nao um apoio. Quando a transcricao fiel entrar, so este rotulo muda.
const ROTULO_FONTE: Record<string, string> = {
  auto_legenda: 'auto do YouTube',
  asr_local: 'transcricao fiel',
};

const ROTULO_STATUS: Record<StatusShort, string> = {
  sugerido: 'sugerido',
  aprovado: 'aprovado',
  rejeitado: 'rejeitado',
  renderizado: 'pronto',
};

const CLASSE_STATUS: Record<StatusShort, string> = {
  sugerido: 'text-[var(--wb-text-mute)]',
  aprovado: 'text-[var(--wb-ok-ink)]',
  rejeitado: 'text-[var(--wb-text-dim)] line-through',
  renderizado: 'text-[var(--wb-accent)]',
};

/** Quanto cada clique move o enquadramento. 5% do quadro = ~96px em 1920. */
const PASSO_FOCO = 0.05;

function mmss(segundos: number): string {
  const total = Math.max(0, Math.round(segundos));
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

interface CandidatoProps {
  short: ShortSugerido;
  corteId: string;
  /** Destaca o candidato que a timeline e a máscara estão mostrando. */
  emFoco: boolean;
  onSelecionar: () => void;
  ocupado: boolean;
  onTocar: () => void;
  onStatus: (status: StatusShort) => void;
  onBorda: (campo: 'inicio_seg' | 'fim_seg') => void;
  onFoco: (delta: number) => void;
  onPrevia: () => void;
  onModelo: (modeloId: string) => void;
  onRenderizar: () => void;
}

// D-478: até aqui o destaque seguia só o que estava TOCANDO, porque um clique
// que apenas pinta a borda não decidia nada. Com a timeline isso mudou: as
// alças de arraste agem sobre o candidato em foco, então escolher passou a ter
// consequência — e o clique no card virou uma seleção legítima.
//
// A seleção também acontece no `focus` de qualquer botão de dentro: assim o
// teclado seleciona sem precisar de um controle novo, e sem disputar o Espaço
// com o play/pause global.
function Candidato({
  short,
  corteId,
  emFoco,
  onSelecionar,
  ocupado,
  onTocar,
  onStatus,
  onBorda,
  onFoco,
  onPrevia,
  onModelo,
  onRenderizar,
}: CandidatoProps) {
  const rejeitado = short.status === 'rejeitado';
  // D-485: so candidatos que podem ter render sao acompanhados. O hook consulta
  // uma vez ao montar e so entra em polling se achar algo rodando — inclusive
  // depois de um F5 no meio do render, que antes perdia o rastro por completo.
  const progresso = useProgressoRender(
    short.id,
    corteId,
    short.status === 'aprovado' || short.status === 'renderizado',
  );
  const renderizando = progresso !== null && !progresso.concluido;

  return (
    <article
      onClick={onSelecionar}
      onFocusCapture={onSelecionar}
      className={cn(
        'cursor-pointer rounded-[10px] border bg-[var(--wb-bg-panel)] p-3 transition-colors',
        emFoco ? 'border-[var(--wb-accent)]' : 'border-[var(--wb-border)]',
        rejeitado && 'opacity-60',
      )}
    >
      <div className="flex items-start gap-2">
        <span
          className="font-code text-[15px] font-bold tabular-nums text-[var(--wb-accent)]"
          title={short.origem === 'manual' ? 'Trecho manual — sem nota da IA' : 'Nota da IA'}
        >
          {short.origem === 'manual' ? '—' : short.score.toFixed(1)}
        </span>
        <div className="min-w-0 flex-1">
          <h3
            className={cn('truncate text-[13.5px] font-bold', CLASSE_STATUS[short.status])}
            title={short.titulo}
          >
            {short.titulo}
          </h3>
          {short.gancho && (
            <p className="mt-0.5 line-clamp-2 text-[12px] italic text-[var(--wb-text-dim)]">
              “{short.gancho}”
            </p>
          )}
        </div>
        <span className="flex-none font-code text-[10.5px] uppercase tracking-wide text-[var(--wb-text-mute)]">
          {/* D-484: o manual se identifica. Sem isso ele se parece com um
              palpite de nota zero, que e o oposto do que ele e. */}
          {short.origem === 'manual' && (
            <span className="mr-1 text-[var(--wb-accent)]" title="Trecho marcado a mao — a regeração não o apaga">
              manual ·
            </span>
          )}
          {ROTULO_STATUS[short.status]}
        </span>
      </div>

      {short.justificativa && (
        <p className="mt-2 text-[12px] leading-relaxed text-[var(--wb-text-mute)]">
          {short.justificativa}
        </p>
      )}

      <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 font-code text-[11.5px] tabular-nums text-[var(--wb-text-mute)]">
        <span>
          {mmss(short.inicio_seg)} → {mmss(short.fim_seg)}
        </span>
        <span className="font-semibold text-[var(--wb-text-dim)]">
          {Math.round(short.duracao_seg)}s
        </span>
        {/* D-464: o enquadramento 9:16. Sem ajuste, segue a facecam do layout. */}
        {/* E-036/D-487: o arranjo e por SHORT, nao por corte — dentro do mesmo
            corte um trecho mostra a tela e o seguinte e so fala. */}
        <SeletorDeArranjo valor={short.modelo_palco} ocupado={ocupado} onEscolher={onModelo} />
        <span className="inline-flex items-center gap-1" title="Onde a janela 9:16 se centra na horizontal">
          <Crop size={11} aria-hidden />
          enquadramento {Math.round(short.foco_efetivo * 100)}%
          {short.foco_x !== null && <span className="text-[var(--wb-accent)]">·ajustado</span>}
        </span>
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        <BotaoAcao onClick={onTocar} disabled={ocupado} icon={<Play size={12} />}>
          tocar trecho
        </BotaoAcao>
        <BotaoAcao onClick={() => onBorda('inicio_seg')} disabled={ocupado}>
          início aqui
        </BotaoAcao>
        <BotaoAcao onClick={() => onBorda('fim_seg')} disabled={ocupado}>
          fim aqui
        </BotaoAcao>
        <BotaoAcao
          onClick={() => onFoco(-PASSO_FOCO)}
          disabled={ocupado}
          icon={<MoveHorizontal size={12} />}
        >
          ←
        </BotaoAcao>
        <BotaoAcao onClick={() => onFoco(PASSO_FOCO)} disabled={ocupado}>
          →
        </BotaoAcao>
        <div className="flex-1" />
        {short.status !== 'aprovado' && (
          <BotaoAcao onClick={() => onStatus('aprovado')} disabled={ocupado} icon={<Check size={12} />}>
            aprovar
          </BotaoAcao>
        )}
        {short.status === 'sugerido' && (
          <BotaoAcao onClick={() => onStatus('rejeitado')} disabled={ocupado} icon={<X size={12} />}>
            rejeitar
          </BotaoAcao>
        )}
        {short.status !== 'sugerido' && (
          <BotaoAcao onClick={() => onStatus('sugerido')} disabled={ocupado} icon={<Undo2 size={12} />}>
            voltar
          </BotaoAcao>
        )}
        {/* D-483: dois estagios. A previa mostra enquadramento, legenda e cenas
            sem gastar a passada do filtro; "finalizar" produz o que publica.
            Finalizar NAO exige previa — quem confia no candidato vai direto. */}
        {short.status === 'aprovado' && (
          <>
            <BotaoAcao
              onClick={onPrevia}
              disabled={ocupado || renderizando}
              icon={<Eye size={12} />}
            >
              {short.arquivo_previa_path ? 'refazer previa' : 'gerar previa'}
            </BotaoAcao>
            <BotaoAcao
              onClick={onRenderizar}
              disabled={ocupado || renderizando}
              icon={<Render size={12} />}
            >
              finalizar
            </BotaoAcao>
          </>
        )}
      </div>

      {progresso && <ProgressoRenderPanel progresso={progresso} />}

      {short.arquivo_previa_path && short.status !== 'renderizado' && (
        <PlayerDoArquivo
          titulo="prévia · sem filtro"
          src={shortVideoUrl(short.id, 'previa')}
          nota="O filtro entra só no finalizar, junto com o recorte — se viesse depois, mexeria na cor da legenda."
        />
      )}

      {short.status === 'renderizado' && (
        <PlayerDoArquivo titulo="final · pronto para publicar" src={shortVideoUrl(short.id, 'final')} />
      )}

      {/* D-468/469/470: so ha o que publicar depois do render. */}
      {short.status === 'renderizado' && <PainelPublicacao shortId={short.id} />}
    </article>
  );
}

/** Qual arranjo de palco este candidato usa. */
function SeletorDeArranjo({
  valor,
  ocupado,
  onEscolher,
}: {
  valor: string;
  ocupado: boolean;
  onEscolher: (modeloId: string) => void;
}) {
  const modelos = useModelosDePalco();
  const escolhido = modelos.data?.modelos.find((m) => m.id === valor);

  return (
    <select
      aria-label="Arranjo do palco deste short"
      value={valor}
      disabled={ocupado || !modelos.data}
      // O card inteiro seleciona ao clicar; sem isto, mexer no select
      // selecionaria o candidato E abriria a lista, que confunde.
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => onEscolher(e.target.value)}
      title={escolhido?.porque ?? 'Deduz o arranjo das regiões disponíveis'}
      className="rounded-[4px] border border-transparent bg-[var(--wb-bg-inset)] px-1 py-0.5 font-code text-[11px] text-[var(--wb-text-dim)] outline-none focus:border-[var(--wb-accent)] disabled:opacity-45"
    >
      <option value="">arranjo automático</option>
      {modelos.data?.modelos.map((modelo) => (
        <option key={modelo.id} value={modelo.id}>
          {modelo.nome}
        </option>
      ))}
    </select>
  );
}

/** O MP4 do short, no formato em que ele vai sair. */
function PlayerDoArquivo({
  titulo,
  src,
  nota,
}: {
  titulo: string;
  src: string;
  nota?: string;
}) {
  return (
    <div className="mt-2.5 border-t border-[var(--wb-border-soft)] pt-2.5">
      <p className="mb-1.5 font-code text-[10.5px] uppercase tracking-wide text-[var(--wb-text-mute)]">
        {titulo}
      </p>
      {/* 9:16 e estreito: limitar a largura evita um player de meia tela dentro
          de um card de lista. */}
      <video
        src={src}
        controls
        preload="metadata"
        className="mx-auto max-h-[320px] w-auto rounded-[8px] bg-black"
      />
      {nota && (
        <p className="mt-1.5 text-[11px] leading-relaxed text-[var(--wb-text-mute)]">{nota}</p>
      )}
    </div>
  );
}

function BotaoAcao({
  onClick,
  disabled,
  icon,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="inline-flex items-center gap-1 rounded-[6px] bg-[var(--wb-bg-inset)] px-2 py-1 text-[11.5px] font-semibold text-[var(--wb-text-dim)] transition-colors hover:text-[var(--wb-text)] disabled:cursor-not-allowed disabled:opacity-45"
    >
      {icon}
      {children}
    </button>
  );
}

export default function FireDetalhePage() {
  const workbench = isWorkbenchEnabled();
  const { corteId = '' } = useParams();
  const navigate = useNavigate();
  const video = useRef<HTMLVideoElement>(null);
  // D-478: o candidato que a timeline, a mascara e as alcas de arraste seguem.
  // Tocar um trecho tambem seleciona — a acao de assistir ja declara a escolha.
  const [selecionado, setSelecionado] = useState<string | null>(null);
  // Dimensoes REAIS do arquivo: a janela 9:16 e proporcional ao quadro, e o
  // bruto nem sempre e exatamente 16:9.
  const [dimensoes, setDimensoes] = useState({ largura: 0, altura: 0 });
  // A regua precisa da duracao do BRUTO. A do proprio arquivo e a fonte mais
  // honesta: e o mesmo video que esta na tela. `fire.duracao_seg` cobre o
  // intervalo entre abrir a pagina e o metadata chegar.
  const [duracaoVideo, setDuracaoVideo] = useState(0);
  const [tempoAtual, setTempoAtual] = useState(0);
  // D-479: a previa da legenda comeca LIGADA. Ela e o produto no mudo, entao
  // o padrao precisa ser ve-la; o desligar existe para quando o operador quer
  // olhar so a imagem.
  const [legendaVisivel, setLegendaVisivel] = useState(true);
  // D-476: abre na velocidade de Ajustes, como os outros players (D-450), e
  // deixa o operador mexer dali com Ctrl+J/Ctrl+K.
  const velocidadePadrao = useVelocidadePlayerPadrao();
  const [velocidade, setVelocidade] = useState(velocidadePadrao);
  useVelocidadeNoVideo(video, velocidade, corteId);
  useEffect(() => setVelocidade(velocidadePadrao), [velocidadePadrao, corteId]);

  const { data, isLoading, isError, error } = useShortsDoCorte(corteId);
  const fires = useFires();
  const atualizar = useAtualizarShort(corteId);
  const descartar = useDescartarBruto();
  const criarManual = useCriarShortManual(corteId);
  const renderizar = useRenderizarShort(corteId);
  const previa = useRenderizarPrevia(corteId);
  const transcricao = useTranscricaoDoCorte(corteId);
  const temPalavras = (transcricao.data?.palavras.length ?? 0) > 0;

  const shorts = useMemo(() => data?.shorts ?? [], [data]);
  // A mascara segue o candidato que esta tocando; sem nenhum, mostra o de maior
  // nota — assim a tela ja abre dizendo o que o melhor candidato vai cortar.
  const emQuadro = shorts.find((s) => s.id === selecionado) ?? shorts[0];
  const fire = fires.data?.fires.find((f) => f.corte_id === corteId);
  const palcoDoShort = usePalcoDoShort(emQuadro?.id ?? null, emQuadro?.modelo_palco ?? '');
  const duracaoRegua = duracaoVideo || fire?.duracao_seg || 0;
  // Sem recorte resolvido nao ha palco a desenhar: a mascara sobre o quadro cru
  // continua sendo a descricao honesta do que o render vai produzir.
  const temPalco = (palcoDoShort.data?.recortes.length ?? 0) > 0;

  const tocarTrecho = useCallback((short: ShortSugerido) => {
    const el = video.current;
    if (!el) return;
    el.currentTime = short.inicio_seg;
    void el.play();
  }, []);

  const irPara = useCallback((segundos: number) => {
    const el = video.current;
    if (el) el.currentTime = segundos;
  }, []);

  // O tempo corrente do player é a fonte da borda nova: o operador acabou de
  // ver onde o trecho deveria começar ou terminar, então pedir que ele digite
  // um número seria fazê-lo traduzir o que já sabe.
  // O enquadramento se ajusta a partir do EFETIVO, nao do zero: o operador
  // empurra o que esta vendo, e o primeiro clique num short sem ajuste parte da
  // facecam do layout em vez de pular para o meio do quadro.
  const moverFoco = useCallback(
    (short: ShortSugerido, delta: number) => {
      const alvo = Math.min(1, Math.max(0, short.foco_efetivo + delta));
      atualizar.mutate({ shortId: short.id, foco_x: Number(alvo.toFixed(3)) });
    },
    [atualizar],
  );

  // D-482: a timeline e o painel fino gravam pelo MESMO caminho. Duas rotas de
  // escrita para o mesmo campo acabariam divergindo no arredondamento.
  const gravarBordas = useCallback(
    (shortId: string, bordas: { inicio?: number; fim?: number }) => {
      atualizar.mutate({
        shortId,
        ...(bordas.inicio !== undefined && { inicio_seg: Number(bordas.inicio.toFixed(2)) }),
        ...(bordas.fim !== undefined && { fim_seg: Number(bordas.fim.toFixed(2)) }),
      });
    },
    [atualizar],
  );

  const moverBorda = useCallback(
    (short: ShortSugerido, campo: 'inicio_seg' | 'fim_seg') => {
      const el = video.current;
      if (!el) return;
      atualizar.mutate({ shortId: short.id, [campo]: Number(el.currentTime.toFixed(2)) });
    },
    [atualizar],
  );

  // O trecho novo ja nasce selecionado: quem acabou de cria-lo quer ajustar as
  // bordas, e as alcas agem sobre o candidato em foco.
  const onCriarManual = () => {
    const janela = janelaNova(tempoAtual, duracaoRegua);
    criarManual.mutate(
      { inicio_seg: janela.inicio, fim_seg: janela.fim },
      { onSuccess: ({ short }) => setSelecionado(short.id) },
    );
  };

  // Descartar tira o Fire da lista, entao a tela em que estamos deixa de fazer
  // sentido — voltar para /shorts e a continuacao honesta da acao.
  const onDescartar = () => {
    if (!fire) return;
    if (!confirm(avisoDescarteBruto(fire.titulo || `Corte ${fire.numero}`, fire.bruto_mb))) return;
    descartar.mutate(corteId, { onSuccess: () => navigate('/shorts') });
  };

  // Espelham as teclas do Bruto: quem cura shorts acabou de sair do editor.
  const ajustarVelocidade = useCallback((passo: number) => {
    setVelocidade((atual) => normalizarVelocidade(atual + passo));
  }, []);

  const mover = useCallback((segundos: number) => {
    const el = video.current;
    if (el) el.currentTime = Math.max(0, el.currentTime + segundos);
  }, []);

  useShortcuts([
    shortcutFromRegistry('player.togglePlay', () => {
      const el = video.current;
      if (!el) return;
      if (el.paused) void el.play();
      else el.pause();
    }),
    shortcutFromRegistry('shorts.seekBack5s', () => mover(-5)),
    shortcutFromRegistry('shorts.seekFwd5s', () => mover(5)),
    shortcutFromRegistry('shorts.speedDown', () => ajustarVelocidade(-0.25)),
    shortcutFromRegistry('shorts.speedUp', () => ajustarVelocidade(0.25)),
  ]);

  return (
    <div
      className={cn(
        'flex min-h-0 flex-col overflow-hidden bg-[var(--wb-bg)] text-[var(--wb-text)]',
        workbench ? 'h-full' : 'h-screen',
      )}
    >
      <header
        className={cn(
          'flex-none border-b border-[var(--wb-border-soft)]',
          workbench ? 'px-4 py-3' : 'px-7 py-5',
        )}
      >
        <div className="flex items-center gap-2">
          <Link
            to="/shorts"
            className="inline-flex items-center gap-1 text-[12px] text-[var(--wb-text-mute)] hover:text-[var(--wb-text)]"
          >
            <ArrowLeft size={14} aria-hidden />
            Shorts
          </Link>
          <span className="text-[var(--wb-text-mute)]">/</span>
          <Clapperboard size={16} className="text-[var(--wb-accent)]" aria-hidden />
          <h1 className="truncate text-[15px] font-extrabold">
            {fire?.titulo || 'Candidatos do Fire'}
          </h1>
          {fire && (
            <span className="truncate text-xs text-[var(--wb-text-mute)]">
              {fire.projeto_titulo} · bruto de {formatarDuracao(fire.duracao_seg)}
            </span>
          )}
          <div className="flex-1" />
          {/* D-480: sem palavras nao ha o que prever, e o botao precisa DIZER
              isso. Levantamento em PROD: 92 dos 104 cortes Fire sao anteriores
              a D-337 e nao tem timing por palavra. Oferecer um "legenda on" que
              nao desenha nada faria o operador achar que a tela quebrou — a
              mesma falha silenciosa que a D-473 corrigiu na fabrica. */}
          {transcricao.data && temPalavras && (
            <BotaoAcao
              onClick={() => setLegendaVisivel((v) => !v)}
              icon={<Captions size={12} />}
            >
              legenda {legendaVisivel ? 'on' : 'off'} ·{' '}
              {ROTULO_FONTE[transcricao.data.fonte] ?? transcricao.data.fonte}
            </BotaoAcao>
          )}
          {transcricao.data && !temPalavras && (
            <span
              className="font-code text-[11px] text-[var(--wb-text-mute)]"
              title="A transcricao deste corte nao tem tempo por palavra (anterior a D-337). A previa volta quando o ASR local gerar a transcricao fiel."
            >
              sem legenda · transcricao sem palavras
            </span>
          )}
          {transcricao.isError && (
            <span className="font-code text-[11px] text-[var(--wb-warn-ink)]">
              legenda indisponivel
            </span>
          )}
          <span
            className="font-code text-[11.5px] tabular-nums text-[var(--wb-text-mute)]"
            title="Velocidade do player (Ctrl+J / Ctrl+K)"
          >
            {velocidade.toFixed(2)}×
          </span>
          {fire && (
            <BotaoAcao
              onClick={onDescartar}
              disabled={descartar.isPending}
              icon={<Trash2 size={12} />}
            >
              descartar bruto ({fire.bruto_mb} MB)
            </BotaoAcao>
          )}
        </div>
      </header>

      <main className="grid min-h-0 flex-1 gap-4 overflow-hidden p-4 lg:grid-cols-[minmax(0,1fr)_380px]">
        {/* D-475: o wrapper tem a MESMA proporcao do arquivo e o video o
            preenche por inteiro. Sem isso a mascara se ancorava na celula da
            grade — que e mais alta que o video — e as faixas escuras vazavam
            para baixo do player. */}
        <div className="flex min-h-0 flex-col items-center gap-3">
          <div className="flex min-h-0 w-full flex-1 items-stretch justify-center gap-3">
          <div
            className="relative max-h-full w-full overflow-hidden rounded-[10px] bg-black"
            style={{ aspectRatio: `${dimensoes.largura || 16} / ${dimensoes.altura || 9}` }}
          >
            <video
              ref={video}
              src={brutoUrl(corteId)}
              controls
              onLoadedMetadata={(e) => {
                setDimensoes({
                  largura: e.currentTarget.videoWidth,
                  altura: e.currentTarget.videoHeight,
                });
                setDuracaoVideo(e.currentTarget.duration || 0);
              }}
              onTimeUpdate={(e) => setTempoAtual(e.currentTarget.currentTime)}
              className="absolute inset-0 h-full w-full"
            />
            {emQuadro && (
              <MascaraEnquadramento
                largura={dimensoes.largura}
                altura={dimensoes.altura}
                focoX={emQuadro.foco_efetivo}
              >
                {/* D-489: com palco, a janela 9:16 sobre o quadro cru deixa de
                    descrever o short — quem descreve e a previa ao lado. A
                    legenda vai para la junto. */}
                {!temPalco && legendaVisivel && temPalavras && transcricao.data && (
                  <LegendaPrevia
                    palavras={transcricao.data.palavras}
                    inicioSeg={emQuadro.inicio_seg}
                    fimSeg={emQuadro.fim_seg}
                    tempoAtualSeg={tempoAtual}
                  />
                )}
              </MascaraEnquadramento>
            )}
          </div>

          {temPalco && palcoDoShort.data && emQuadro && (
            <div className="flex min-h-0 flex-none flex-col items-center gap-1">
              <PalcoPrevia plano={palcoDoShort.data} video={video}>
                {legendaVisivel && temPalavras && transcricao.data && (
                  <LegendaPrevia
                    palavras={transcricao.data.palavras}
                    inicioSeg={emQuadro.inicio_seg}
                    fimSeg={emQuadro.fim_seg}
                    tempoAtualSeg={tempoAtual}
                  />
                )}
              </PalcoPrevia>
              <span className="font-code text-[10px] uppercase tracking-wide text-[var(--wb-text-mute)]">
                como vai sair
              </span>
            </div>
          )}
          </div>

          {/* D-478: a regua so aparece quando ha o que desenhar nela. Uma faixa
              vazia diria "carreguei e nao achei nada", que e mentira enquanto o
              metadata do video nao chegou. */}
          {duracaoRegua > 0 && shorts.length > 0 && (
            <div className="w-full">
              <LinhaDoTempo
                duracaoSeg={duracaoRegua}
                shorts={shorts}
                emFoco={emQuadro}
                tempoAtual={tempoAtual}
                onSeek={irPara}
                onBordas={gravarBordas}
              />

              {/* O painel fino age sobre o candidato em foco — o mesmo da
                  timeline e da mascara. Sem candidato nao ha borda a ajustar. */}
              {emQuadro && (
                <div className="mt-2">
                  <BordasFinasPanel
                    bordas={{ inicio: emQuadro.inicio_seg, fim: emQuadro.fim_seg }}
                    duracaoSeg={duracaoRegua}
                    ocupado={atualizar.isPending}
                    onAplicar={(bordas) => gravarBordas(emQuadro.id, bordas)}
                  />
                </div>
              )}
            </div>
          )}
        </div>

        <aside className="flex min-h-0 flex-col gap-2 overflow-auto">
          {/* O palco e do CORTE: as regioes valem para todos os candidatos. */}
          <div className="flex-none rounded-[10px] border border-[var(--wb-border)] bg-[var(--wb-bg-panel)] p-2.5">
            <PalcoDoCorte corteId={corteId} />
          </div>

          {/* D-484: o trecho que a IA nao propos. Nasce onde o player esta,
              porque o operador acabou de assistir ao que quer recortar. */}
          <div className="flex flex-none items-center gap-2">
            <BotaoAcao
              onClick={onCriarManual}
              disabled={criarManual.isPending || duracaoRegua <= 0}
              icon={<Plus size={12} />}
            >
              novo trecho aqui ({mmss(tempoAtual)})
            </BotaoAcao>
            {criarManual.isError && (
              <span className="text-[11px] text-[var(--wb-warn-ink)]">
                {(criarManual.error as Error)?.message ?? 'nao consegui criar'}
              </span>
            )}
          </div>

          {isLoading && (
            <p className="py-8 text-center text-[13px] text-[var(--wb-text-mute)]">
              Carregando candidatos…
            </p>
          )}

          {/* Falha de rede NAO pode se parecer com "nao ha candidatos": a primeira
              pede para tentar de novo, a segunda pede para gerar o bruto. */}
          {isError && (
            <p className="py-8 text-center text-[13px] leading-relaxed text-[var(--wb-text-dim)]">
              Nao consegui carregar os candidatos: {(error as Error)?.message ?? 'erro desconhecido'}
            </p>
          )}

          {!isLoading && !isError && shorts.length === 0 && (
            <p className="py-8 text-center text-[13px] leading-relaxed text-[var(--wb-text-mute)]">
              Nenhum candidato ainda. Gere o bruto de novo para a IA propor os trechos.
            </p>
          )}

          {shorts.map((short) => (
            <Candidato
              key={short.id}
              short={short}
              corteId={corteId}
              emFoco={emQuadro?.id === short.id}
              onSelecionar={() => setSelecionado(short.id)}
              ocupado={atualizar.isPending || renderizar.isPending || previa.isPending}
              onTocar={() => {
                setSelecionado(short.id);
                tocarTrecho(short);
              }}
              onStatus={(status) => atualizar.mutate({ shortId: short.id, status })}
              onBorda={(campo) => moverBorda(short, campo)}
              onFoco={(delta) => moverFoco(short, delta)}
              onPrevia={() => previa.mutate(short.id)}
              onModelo={(modeloId) => atualizar.mutate({ shortId: short.id, modelo_palco: modeloId })}
              onRenderizar={() => renderizar.mutate(short.id)}
            />
          ))}

          {atualizar.isError && (
            <p className="rounded-[8px] bg-[var(--wb-bg-inset)] p-2 text-[12px] text-[var(--wb-text-dim)]">
              {(atualizar.error as Error)?.message ?? 'nao consegui salvar'}
            </p>
          )}

          {/* D-485: aqui e falha de DISPARO (ex.: ja ha render em andamento). A
              falha do render em si chega pelo progresso, no card — desde que
              virou assincrono, ela nao volta mais pela resposta do POST. */}
          {(previa.isError || renderizar.isError) && (
            <p className="rounded-[8px] border border-[var(--wb-warn-ink)] bg-[var(--wb-bg-inset)] p-2 text-[12px] leading-relaxed text-[var(--wb-text-dim)]">
              <span className="font-bold text-[var(--wb-warn-ink)]">Nao consegui iniciar.</span>{' '}
              {((previa.error ?? renderizar.error) as Error)?.message ?? 'erro desconhecido'}
            </p>
          )}
        </aside>
      </main>
    </div>
  );
}
