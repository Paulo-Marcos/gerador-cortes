// D-459/D-492: a curadoria dos candidatos de um Fire.
//
// A premissa editorial manda no desenho: o corte Fire já passou pelo funil
// inteiro, então esta tela não é de garimpo — é de ESCOLHA ENTRE BONS.
//
// O layout segue disso. À ESQUERDA o material (o bruto, o palco como vai sair,
// a régua); à DIREITA as decisões (o palco do corte e os candidatos). Olhar e
// decidir são movimentos diferentes, e misturá-los foi o que produziu a parede
// de botões que o operador reclamou (D-492).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Captions,
  Clapperboard,
  Gauge,
  LayoutTemplate,
  Move,
  Plus,
  Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { OverflowMenu } from '@/components/ui/overflow-menu';
import { cn, formatarDuracao } from '@/lib/utils';
import { useShortcuts } from '@/features/editor/shortcuts';
import { shortcutFromRegistry } from '@/features/editor/shortcutsRegistry';
import {
  normalizarVelocidade,
  useVelocidadeNoVideo,
  useVelocidadePlayerPadrao,
} from '@/hooks/useVelocidadePlayerPadrao';
import { isWorkbenchEnabled } from '@/components/workbench/workbenchFlag';
import { brutoUrl, type ShortSugerido, type VereditoDoRosto } from './shortsApi';
import { avisoDescarteBruto } from './descarteBruto';
import { janelaNova } from './linhaDoTempoShort';
import { BordasFinasPanel } from './BordasFinasPanel';
import { CandidatoCard } from './CandidatoCard';
import { BotaoTiktokHorizontal } from './BotaoTiktokHorizontal';
import { CenasDoShort } from './CenasDoShort';
import { CamposDoPalco, EditorDePalco } from './EditorDePalco';
import { LegendaPrevia } from './LegendaPrevia';
import { LinhaDoTempo } from './LinhaDoTempo';
import { MascaraEnquadramento } from './MascaraEnquadramento';
import { PalcoDoCorte } from './PalcoDoCorte';
import { ControlesDoRecorte, EditorDeRecorte } from './EditorDeRecorte';
import { PalcoPrevia } from './PalcoPrevia';
import { SeletorDeFundo } from './SeletorDeFundo';
import { useSimulacaoDePalco } from './useSimulacaoDePalco';
import { useFires } from './useFires';
import {
  useAtualizarShort,
  useCriarShortManual,
  useDefinirCenas,
  useSugerirCenas,
  useEnquadrarPeloRosto,
  useDescartarBruto,
  usePalcoDoShort,
  useRenderizarPrevia,
  useRenderizarShort,
  useShortsDoCorte,
  useTranscricaoDoCorte,
} from './useShortsDoCorte';

// D-479: o operador precisa saber a QUALIDADE do que está lendo. A auto-legenda
// erra grafia, e erro de grafia num short vira o produto — o texto é o conteúdo.
const ROTULO_FONTE: Record<string, string> = {
  auto_legenda: 'auto do YouTube',
  asr_local: 'transcrição fiel',
};

/**
 * D-477: o veredito do detector em uma linha.
 *
 * "Não achei" precisa de texto tanto quanto "achei": sem ele, um clique sem
 * efeito visível fica indistinguível de um botão quebrado.
 */
function textoDoVeredito(v: VereditoDoRosto): string {
  if (!v.achou) return `Não achei rosto — ${v.motivo}.`;
  const onde = `Enquadrado em ${Math.round((v.foco_x ?? 0) * 100)}% da largura (${v.motivo}).`;
  return v.aviso ? `${onde} ${v.aviso}` : onde;
}

function mmss(segundos: number): string {
  const total = Math.max(0, Math.round(segundos));
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

export default function FireDetalhePage() {
  const workbench = isWorkbenchEnabled();
  const { corteId = '' } = useParams();
  const navigate = useNavigate();
  const video = useRef<HTMLVideoElement>(null);

  const [selecionado, setSelecionado] = useState<string | null>(null);
  // Só UM card mostra os ajustes por vez: cinco blocos de refino abertos ao
  // mesmo tempo reconstroem a parede de controles que a D-492 desmontou.
  const [ajusteAberto, setAjusteAberto] = useState<string | null>(null);
  const [dimensoes, setDimensoes] = useState({ largura: 0, altura: 0 });
  const [duracaoVideo, setDuracaoVideo] = useState(0);
  const [tempoAtual, setTempoAtual] = useState(0);
  const [legendaVisivel, setLegendaVisivel] = useState(true);
  // D-493: o modo de edição do palco. Fora dele o overlay não existe — as alças
  // sobre o vídeo atrapalhariam quem só quer assistir ao trecho.
  const [editandoPalco, setEditandoPalco] = useState(false);
  // D-500: ver o short montado ou o quadro cru. Desligado, a prévia volta a ser
  // a janela 9:16 sobre o bruto — que é o que serve para escolher o TRECHO,
  // enquanto o palco serve para escolher o ENQUADRAMENTO.
  const [verPalco, setVerPalco] = useState(true);
  // D-499: marcar o recorte sobre o quadro-fonte. Modo à parte do palco: um
  // edita o que o bloco MOSTRA, o outro onde ele CAI, e as alças dos dois ao
  // mesmo tempo sobre telas diferentes seriam duas conversas de uma vez.
  const [recortando, setRecortando] = useState(false);

  const velocidadePadrao = useVelocidadePlayerPadrao();
  const [velocidade, setVelocidade] = useState(velocidadePadrao);
  useVelocidadeNoVideo(video, velocidade, corteId);
  useEffect(() => setVelocidade(velocidadePadrao), [velocidadePadrao, corteId]);

  const { data, isLoading, isError, error } = useShortsDoCorte(corteId);
  const fires = useFires();
  const atualizar = useAtualizarShort(corteId);
  const descartar = useDescartarBruto();
  const renderizar = useRenderizarShort(corteId);
  const previa = useRenderizarPrevia(corteId);
  const criarManual = useCriarShortManual(corteId);
  const definirCenas = useDefinirCenas(corteId);
  const sugerirCenas = useSugerirCenas(corteId);
  const enquadrarPeloRosto = useEnquadrarPeloRosto(corteId);
  const transcricao = useTranscricaoDoCorte(corteId);
  const temPalavras = (transcricao.data?.palavras.length ?? 0) > 0;

  const shorts = useMemo(() => data?.shorts ?? [], [data]);
  const emQuadro = shorts.find((s) => s.id === selecionado) ?? shorts[0];
  const fire = fires.data?.fires.find((f) => f.corte_id === corteId);
  const palcoDoShort = usePalcoDoShort(emQuadro?.id ?? null, emQuadro?.arranjo_palco ?? '');
  const duracaoRegua = duracaoVideo || fire?.duracao_seg || 0;
  const temPalco = (palcoDoShort.data?.recortes.length ?? 0) > 0;
  const palcoNaTela = temPalco && verPalco;
  // D-500: durante o arraste o backend resolve um plano hipotético; a tela
  // desenha esse, e volta ao gravado assim que ele chega.
  const simulacao = useSimulacaoDePalco(emQuadro?.id ?? null);
  const planoNaTela = simulacao.simulado ?? palcoDoShort.data;
  // A região vem junto de cada recorte (D-499) — casar esta lista com `slots`
  // pela posição quebraria em silêncio no dia em que a ordem mudasse.
  const recortesDaFonte = useMemo(
    () =>
      Object.fromEntries(
        (palcoDoShort.data?.recortes ?? []).map((r) => [r.regiao, r.origem]),
      ),
    [palcoDoShort.data],
  );
  const ocupado = atualizar.isPending || renderizar.isPending || previa.isPending;

  // O rascunho vive até o plano GRAVADO chegar — ou até a gravação falhar, e aí
  // manter o desenho seria mostrar um ajuste que o banco não tem.
  const descartarSimulacao = simulacao.descartar;
  useEffect(
    () => descartarSimulacao(),
    [palcoDoShort.data, atualizar.status, descartarSimulacao],
  );

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

  // Timeline e painel fino gravam pelo MESMO caminho: duas rotas de escrita para
  // o mesmo campo divergiriam no arredondamento.
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

  // O tempo corrente do player é a fonte da borda nova: o operador acabou de ver
  // onde o trecho deveria começar, e pedir que digite seria fazê-lo traduzir o
  // que já sabe.
  const moverBorda = useCallback(
    (short: ShortSugerido, campo: 'inicio_seg' | 'fim_seg') => {
      const el = video.current;
      if (!el) return;
      atualizar.mutate({ shortId: short.id, [campo]: Number(el.currentTime.toFixed(2)) });
    },
    [atualizar],
  );

  // Ajusta a partir do EFETIVO, não do zero: o operador empurra o que está
  // vendo, e o primeiro clique parte da facecam do layout.
  const moverFoco = useCallback(
    (short: ShortSugerido, delta: number) => {
      const alvo = Math.min(1, Math.max(0, short.foco_efetivo + delta));
      atualizar.mutate({ shortId: short.id, foco_x: Number(alvo.toFixed(3)) });
    },
    [atualizar],
  );

  // O trecho novo já nasce selecionado e com os ajustes abertos: quem acabou de
  // criá-lo vai mexer nas bordas, e as alças agem sobre o candidato em foco.
  const onCriarManual = () => {
    const janela = janelaNova(tempoAtual, duracaoRegua);
    criarManual.mutate(
      { inicio_seg: janela.inicio, fim_seg: janela.fim },
      {
        onSuccess: ({ short }) => {
          setSelecionado(short.id);
          setAjusteAberto(short.id);
        },
      },
    );
  };

  // D-493: o ajuste é PARCIAL. Mandamos o mapa inteiro já mesclado, porque o
  // PATCH substitui o campo — mandar só o bloco movido apagaria o outro.
  const gravarAjuste = (ajustes: Record<string, { x: number; y: number; w: number; h: number }>) => {
    if (!emQuadro) return;
    atualizar.mutate({
      shortId: emQuadro.id,
      ajustes_palco: { ...emQuadro.ajustes_palco, ...ajustes },
    });
  };

  // D-499: o recorte é PARCIAL, como o ajuste — mandar só o que mudou apagaria
  // as outras regiões, porque o PATCH substitui o campo inteiro.
  const gravarRecorte = (recortes: Record<string, { x: number; y: number; w: number; h: number }>) => {
    if (!emQuadro) return;
    atualizar.mutate({
      shortId: emQuadro.id,
      // `?? {}` porque o campo pode faltar: uma aba aberta desde antes do
      // deploy segue com o payload antigo em cache, e `Object.keys(undefined)`
      // derruba a página inteira em vez de só esconder um botão.
      recortes_palco: { ...(emQuadro.recortes_palco ?? {}), ...recortes },
    });
  };

  const onDescartar = () => {
    if (!fire) return;
    if (!confirm(avisoDescarteBruto(fire.titulo || `Corte ${fire.numero}`, fire.bruto_mb))) return;
    descartar.mutate(corteId, { onSuccess: () => navigate('/shorts') });
  };

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

  const legendaAtiva = legendaVisivel && temPalavras && transcricao.data;
  const legenda = emQuadro && legendaAtiva && transcricao.data && (
    <LegendaPrevia
      palavras={transcricao.data.palavras}
      inicioSeg={emQuadro.inicio_seg}
      fimSeg={emQuadro.fim_seg}
      tempoAtualSeg={tempoAtual}
    />
  );

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
          <Clapperboard size={16} className="text-[var(--wb-accent)]" aria-hidden />
          <div className="min-w-0">
            <h1 className="truncate text-[14.5px] font-extrabold leading-tight">
              {fire?.titulo || 'Candidatos do Fire'}
            </h1>
            {fire && (
              <p className="truncate text-[11.5px] text-[var(--wb-text-mute)]">
                {fire.projeto_titulo} · bruto de {formatarDuracao(fire.duracao_seg)}
              </p>
            )}
          </div>

          <div className="flex-1" />

          {temPalco && (
            <Button
              variant={verPalco ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => {
                setVerPalco((v) => !v);
                setEditandoPalco(false);
              }}
              title="Ver o short montado no palco, ou o quadro cru com a janela 9:16"
            >
              <LayoutTemplate />
              Palco {verPalco ? 'on' : 'off'}
            </Button>
          )}
          {transcricao.data && temPalavras && (
            <Button
              variant={legendaVisivel ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setLegendaVisivel((v) => !v)}
              title={`Fonte: ${ROTULO_FONTE[transcricao.data.fonte] ?? transcricao.data.fonte}`}
            >
              <Captions />
              Legenda {legendaVisivel ? 'on' : 'off'}
            </Button>
          )}
          {transcricao.data && !temPalavras && (
            <span
              className="font-code text-[11px] text-[var(--wb-text-mute)]"
              title="A transcrição deste corte não tem tempo por palavra (anterior a D-337)."
            >
              sem legenda
            </span>
          )}

          <span
            className="inline-flex items-center gap-1 rounded-[7px] bg-[var(--wb-bg-inset)] px-2 py-1 font-code text-[11px] tabular-nums text-[var(--wb-text-mute)]"
            title="Velocidade do player (Ctrl+J / Ctrl+K)"
          >
            <Gauge size={11} aria-hidden />
            {velocidade.toFixed(2)}×
          </span>

          {fire && (
            <OverflowMenu
              label="Mais ações deste Fire"
              align="right"
              items={[
                {
                  label: `Descartar o bruto (${fire.bruto_mb} MB)`,
                  icon: Trash2,
                  danger: true,
                  disabled: descartar.isPending,
                  onClick: onDescartar,
                },
              ]}
            />
          )}
        </div>
      </header>

      <main className="grid min-h-0 flex-1 gap-4 overflow-hidden p-4 lg:grid-cols-[minmax(0,1fr)_400px]">
        {/* ── Material: o que existe para olhar ───────────────────────── */}
        <section className="flex min-h-0 flex-col gap-3">
          <div className="flex min-h-0 w-full flex-[2] items-stretch justify-center gap-3">
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
              {emQuadro && !recortando && (
                <MascaraEnquadramento
                  largura={dimensoes.largura}
                  altura={dimensoes.altura}
                  focoX={emQuadro.foco_efetivo}
                >
                  {/* Com palco, a janela sobre o quadro cru deixa de descrever o
                      short — quem descreve é a prévia ao lado, e a legenda vai
                      para lá junto. */}
                  {!palcoNaTela && legenda}
                </MascaraEnquadramento>
              )}
              {/* D-499: as alças do recorte substituem a máscara enquanto se
                  marca. Sobrepostas, a janela 9:16 competiria com o retângulo
                  que o operador está tentando ver. */}
              {emQuadro && (
                <EditorDeRecorte
                  recortes={recortesDaFonte}
                  fonte={{ largura: dimensoes.largura, altura: dimensoes.altura }}
                  ativo={recortando}
                  onGravar={gravarRecorte}
                />
              )}
            </div>

            {palcoNaTela && planoNaTela && (
              <div className="flex min-h-0 flex-none flex-col items-center gap-1">
                <PalcoPrevia plano={planoNaTela} video={video}>
                  {legenda}
                  <EditorDePalco
                    slots={planoNaTela.slots}
                    ativo={editandoPalco}
                    onGravar={gravarAjuste}
                    onArrastando={simulacao.simular}
                    onSoltou={simulacao.encerrar}
                  />
                </PalcoPrevia>
                <button
                  type="button"
                  onClick={() => setEditandoPalco((v) => !v)}
                  className={cn(
                    'inline-flex items-center gap-1 rounded-[6px] px-1.5 py-0.5 font-code text-[9.5px] uppercase tracking-[0.06em] transition-colors',
                    editandoPalco
                      ? 'bg-[var(--wb-accent-soft)] text-[var(--wb-accent-strong)]'
                      : 'text-[var(--wb-text-mute)] hover:bg-[var(--wb-bg-inset)]',
                  )}
                >
                  <Move size={10} aria-hidden />
                  {editandoPalco ? 'editando o palco' : 'como vai sair'}
                </button>
              </div>
            )}
          </div>

          {/* O painel abaixo ROLA em vez de ser cortado (D-499). Ele cresce com
              o número de cenas e ganhou o recorte e o fundo; com `flex-none` e o
              `overflow-hidden` do grid, as últimas linhas simplesmente sumiam —
              sem barra, sem sinal, sem jeito de chegar nelas numa janela de
              800px de altura.
              O vídeo leva 2 partes e o painel 1: deixar os dois em `flex-1`
              espremia o player para uma tira, e é nele que se decide o corte. */}
          {duracaoRegua > 0 && shorts.length > 0 && (
            <div className="min-h-0 flex-1 overflow-y-auto rounded-[10px] border border-[var(--wb-border)] bg-[var(--wb-bg-panel)] p-2.5">
              <LinhaDoTempo
                duracaoSeg={duracaoRegua}
                shorts={shorts}
                emFoco={emQuadro}
                tempoAtual={tempoAtual}
                onSeek={irPara}
                onBordas={gravarBordas}
              />
              {emQuadro && (
                <div className="mt-2.5 border-t border-[var(--wb-border-soft)] pt-2.5">
                  <BordasFinasPanel
                    bordas={{ inicio: emQuadro.inicio_seg, fim: emQuadro.fim_seg }}
                    duracaoSeg={duracaoRegua}
                    ocupado={atualizar.isPending}
                    onAplicar={(bordas) => gravarBordas(emQuadro.id, bordas)}
                  />
                  {emQuadro && (
                    <div className="mt-2.5 border-t border-[var(--wb-border-soft)] pt-2.5">
                      <CenasDoShort
                        cenas={emQuadro.cenas}
                        duracaoSeg={emQuadro.duracao_seg}
                        ocupado={definirCenas.isPending || sugerirCenas.isPending}
                        erro={
                          definirCenas.isError || sugerirCenas.isError
                            ? (((definirCenas.error ?? sugerirCenas.error) as Error)?.message ??
                              'não consegui salvar')
                            : null
                        }
                        onGravar={(cenas) =>
                          definirCenas.mutate({ shortId: emQuadro.id, cenas })
                        }
                        onSugerir={() => sugerirCenas.mutate(emQuadro.id)}
                        sugerindo={sugerirCenas.isPending}
                        descartes={sugerirCenas.data?.descartes ?? []}
                      />
                    </div>
                  )}
                  {/* D-499: o outro lado do palco — o que cada bloco MOSTRA
                      da live, e a cor por trás de tudo. Fica fora do bloco de
                      edição do palco de propósito: o recorte se marca sobre o
                      player à esquerda, não sobre a prévia. */}
                  {emQuadro && temPalco && (
                    <div className="mt-2.5 space-y-1.5 border-t border-[var(--wb-border-soft)] pt-2.5">
                      <ControlesDoRecorte
                        ativo={recortando}
                        marcados={Object.keys(emQuadro.recortes_palco ?? {})}
                        ocupado={atualizar.isPending}
                        onAlternar={() => setRecortando((v) => !v)}
                        onDesfazer={() =>
                          atualizar.mutate({ shortId: emQuadro.id, recortes_palco: {} })
                        }
                      />
                      <SeletorDeFundo
                        escolhido={emQuadro.fundo_palco ?? ''}
                        ocupado={atualizar.isPending}
                        onEscolher={(chave) =>
                          atualizar.mutate({ shortId: emQuadro.id, fundo_palco: chave })
                        }
                      />
                    </div>
                  )}
                  {/* Com o palco oculto os campos editariam algo que ninguém
                      está vendo — a mesma cegueira que o arraste sem prévia
                      tinha. Desligar a visualização desliga a edição junto. */}
                  {editandoPalco && palcoNaTela && palcoDoShort.data && (
                    <div className="mt-2.5 border-t border-[var(--wb-border-soft)] pt-2.5">
                      <CamposDoPalco
                        slots={palcoDoShort.data.slots}
                        ajustados={palcoDoShort.data.ajustados}
                        ocupado={atualizar.isPending}
                        onGravar={gravarAjuste}
                        onDesfazer={() =>
                          emQuadro &&
                          atualizar.mutate({ shortId: emQuadro.id, ajustes_palco: {} })
                        }
                      />
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </section>

        {/* ── Decisões: o que fazer com o material ────────────────────── */}
        <aside className="flex min-h-0 flex-col gap-2.5 overflow-auto">
          <div className="flex-none space-y-2 rounded-[10px] border border-[var(--wb-border)] bg-[var(--wb-bg-panel)] p-2.5">
            <PalcoDoCorte corteId={corteId} />
            {/* D-503: o corte HORIZONTAL tambem publica — e o mesmo MP4 que foi
                para o YouTube, sem render novo. Fica aqui porque a tela do Fire
                e onde o operador ja esta olhando este corte. */}
            <div className="border-t border-[var(--wb-border-soft)] pt-2">
              <BotaoTiktokHorizontal
                corteId={corteId}
                habilitado={Boolean(fire?.tem_video_final)}
              />
            </div>

            <div className="flex items-center gap-2 border-t border-[var(--wb-border-soft)] pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={onCriarManual}
                disabled={criarManual.isPending || duracaoRegua <= 0}
              >
                <Plus />
                Novo trecho em {mmss(tempoAtual)}
              </Button>
              {criarManual.isError && (
                <span className="text-[11px] text-[var(--wb-warn-ink)]">
                  {(criarManual.error as Error)?.message ?? 'não consegui criar'}
                </span>
              )}
            </div>
          </div>

          {isLoading && (
            <p className="py-8 text-center text-[13px] text-[var(--wb-text-mute)]">
              Carregando candidatos…
            </p>
          )}

          {/* Falha de rede NÃO pode se parecer com "não há candidatos": a
              primeira pede para tentar de novo, a segunda pede para gerar. */}
          {isError && (
            <p className="py-8 text-center text-[13px] leading-relaxed text-[var(--wb-text-dim)]">
              Não consegui carregar os candidatos:{' '}
              {(error as Error)?.message ?? 'erro desconhecido'}
            </p>
          )}

          {!isLoading && !isError && shorts.length === 0 && (
            <p className="py-8 text-center text-[13px] leading-relaxed text-[var(--wb-text-mute)]">
              Nenhum candidato ainda. Gere o bruto de novo para a IA propor os trechos, ou marque
              um trecho à mão.
            </p>
          )}

          {shorts.map((short) => (
            <CandidatoCard
              key={short.id}
              short={short}
              corteId={corteId}
              emFoco={emQuadro?.id === short.id}
              temRegiao={temPalco}
              ocupado={ocupado}
              aberto={ajusteAberto === short.id}
              onAlternarAjuste={() =>
                setAjusteAberto((atual) => (atual === short.id ? null : short.id))
              }
              onSelecionar={() => setSelecionado(short.id)}
              onTocar={() => {
                setSelecionado(short.id);
                tocarTrecho(short);
              }}
              onStatus={(status) => atualizar.mutate({ shortId: short.id, status })}
              onBorda={(campo) => moverBorda(short, campo)}
              onFoco={(delta) => moverFoco(short, delta)}
              onEnquadrarPeloRosto={() => enquadrarPeloRosto.mutate(short.id)}
              enquadrando={enquadrarPeloRosto.isPending && enquadrarPeloRosto.variables === short.id}
              vereditoDoRosto={
                enquadrarPeloRosto.data && enquadrarPeloRosto.variables === short.id
                  ? textoDoVeredito(enquadrarPeloRosto.data)
                  : ''
              }
              onArranjo={(chave) =>
                atualizar.mutate({ shortId: short.id, arranjo_palco: chave })
              }
              onPreset={(presetId) =>
                atualizar.mutate({ shortId: short.id, palco_preset: presetId })
              }
              onMoldura={(moldura) => atualizar.mutate({ shortId: short.id, moldura })}
              onPrevia={() => previa.mutate(short.id)}
              onRenderizar={() => renderizar.mutate(short.id)}
            />
          ))}

          {atualizar.isError && (
            <p className="rounded-[9px] bg-[var(--wb-bg-inset)] p-2 text-[12px] text-[var(--wb-text-dim)]">
              {(atualizar.error as Error)?.message ?? 'não consegui salvar'}
            </p>
          )}

          {/* Falha de DISPARO (ex.: já há render em andamento). A falha do render
              em si chega pelo progresso, no card. */}
          {(previa.isError || renderizar.isError) && (
            <p className="rounded-[9px] border border-[var(--wb-warn-ink)] bg-[var(--wb-warn-soft)] p-2 text-[12px] leading-relaxed text-[var(--wb-warn-ink)]">
              <span className="font-bold">Não consegui iniciar.</span>{' '}
              {((previa.error ?? renderizar.error) as Error)?.message ?? 'erro desconhecido'}
            </p>
          )}
        </aside>
      </main>
    </div>
  );
}
