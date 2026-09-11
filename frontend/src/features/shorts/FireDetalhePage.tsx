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
  Plus,
  Send,
  SlidersHorizontal,
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
import { janelaNova, mmss, type Borda } from './linhaDoTempoShort';
import { mudancaDoPalco } from './aplicarPalco';
import { NavegacaoDoPlayer } from './NavegacaoDoPlayer';
import { useParadaNoFim } from './useParadaNoFim';
import { CandidatoCard } from './CandidatoCard';
import { LegendaPrevia } from './LegendaPrevia';
import { LinhaDoTempo } from './LinhaDoTempo';
import { ReguaDeOnda } from './ReguaDeOnda';
import { MascaraEnquadramento } from './MascaraEnquadramento';
import { PalcoDoCorte } from './PalcoDoCorte';
import { DefinirPalcoModal } from './DefinirPalcoModal';
import { GanchoModal } from './GanchoModal';
import { GanchoPrevia } from './GanchoPrevia';
import { PublicarEmLoteModal } from './PublicarEmLoteModal';
import { shortsPublicaveis } from './selecaoDoLote';
import { PalcoPrevia } from './PalcoPrevia';
import { useSimulacaoDePalco } from './useSimulacaoDePalco';
import { useFires } from './useFires';
import {
  useAtualizarShort,
  useCriarShortManual,
  useEnquadrarPeloRosto,
  useDescartarBruto,
  usePalcoDoShort,
  useRenderizarPrevia,
  useRenderizarShort,
  useShortsDoCorte,
  useOndaDoBruto,
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
  // D-500: ver o short montado ou o quadro cru. Desligado, a prévia volta a ser
  // a janela 9:16 sobre o bruto — que é o que serve para escolher o TRECHO,
  // enquanto o palco serve para escolher o ENQUADRAMENTO.
  const [verPalco, setVerPalco] = useState(true);
  // D-499: marcar o recorte sobre o quadro-fonte. Modo à parte do palco: um
  // edita o que o bloco MOSTRA, o outro onde ele CAI, e as alças dos dois ao
  // mesmo tempo sobre telas diferentes seriam duas conversas de uma vez.
  // D-509: o modal onde a tela do short se monta inteira, num lugar so.
  const [definindoPalco, setDefinindoPalco] = useState(false);
  const [escrevendoGancho, setEscrevendoGancho] = useState(false);
  // D-564: publicar vários de uma vez, nas plataformas escolhidas.
  const [publicandoEmLote, setPublicandoEmLote] = useState(false);

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
  const enquadrarPeloRosto = useEnquadrarPeloRosto(corteId);
  const transcricao = useTranscricaoDoCorte(corteId);
  // D-541: a onda do bruto por tras da regua. Falha em silencio — sem bruto
  // legivel a regua fica lisa, que e exatamente como ela era antes disto.
  const onda = useOndaDoBruto(corteId);
  const temPalavras = (transcricao.data?.palavras.length ?? 0) > 0;

  const shorts = useMemo(() => data?.shorts ?? [], [data]);
  // D-564: o botão do lote só existe quando há o que publicar — sem MP4 final,
  // ele abriria um modal para dizer que não há nada.
  const temPublicavel = useMemo(() => shortsPublicaveis(shorts).length > 0, [shorts]);
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
  const ocupado = atualizar.isPending || renderizar.isPending || previa.isPending;

  // O rascunho vive até o plano GRAVADO chegar — ou até a gravação falhar, e aí
  // manter o desenho seria mostrar um ajuste que o banco não tem.
  const descartarSimulacao = simulacao.descartar;
  useEffect(
    () => descartarSimulacao(),
    [palcoDoShort.data, atualizar.status, descartarSimulacao],
  );

  // D-539: assistir um trecho para NO FIM dele. O player é o bruto inteiro, e
  // sem isso o vídeo seguia pelo assunto seguinte — o operador só percebia que
  // passou do fim quando o tema mudava, que é tarde para julgar se o corte
  // fecha bem.
  const { tocarAte, irPara, aoBuscar } = useParadaNoFim(video);

  const tocarTrecho = useCallback(
    (short: ShortSugerido) => tocarAte(short.inicio_seg, short.fim_seg),
    [tocarAte],
  );

  // Timeline e painel fino gravam pelo MESMO caminho: duas rotas de escrita para
  // o mesmo campo divergiriam no arredondamento.
  const gravarBordas = useCallback(
    (shortId: string, bordas: { inicio?: number; fim?: number }, focar?: Borda) => {
      atualizar.mutate({
        shortId,
        ...(bordas.inicio !== undefined && { inicio_seg: Number(bordas.inicio.toFixed(2)) }),
        ...(bordas.fim !== undefined && { fim_seg: Number(bordas.fim.toFixed(2)) }),
      });
      // D-539: o cursor vai para a borda que acabou de mudar. A alça da régua
      // já fazia isso; o ajuste fino não, e é justamente ele que move de um
      // quadro por vez — precisão que só serve se der para CONFERIR.
      if (!focar) return;
      const alvo = focar === 'inicio' ? bordas.inicio : bordas.fim;
      if (alvo !== undefined) irPara(alvo);
    },
    [atualizar, irPara],
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
  // D-565: o gancho e a legenda coexistem na tela — ele no terco superior, ela
  // no rodape. Viajam no MESMO no para nunca aparecerem em previas diferentes:
  // e a coexistencia que precisa ser julgada, nao cada um por si.
  const legenda = emQuadro && (
    <>
      <GanchoPrevia
        texto={emQuadro.gancho_tela}
        ateSeg={emQuadro.gancho_ate_seg}
        inicioSeg={emQuadro.inicio_seg}
        fimSeg={emQuadro.fim_seg}
        tempoAtualSeg={tempoAtual}
      />
      {legendaAtiva && transcricao.data && (
        <LegendaPrevia
          palavras={transcricao.data.palavras}
          inicioSeg={emQuadro.inicio_seg}
          fimSeg={emQuadro.fim_seg}
          tempoAtualSeg={tempoAtual}
          cor={emQuadro.legenda_cor}
          fonte={emQuadro.legenda_fonte}
        />
      )}
    </>
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
              onClick={() => setVerPalco((v) => !v)}
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

          {temPublicavel && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setPublicandoEmLote(true)}
              title="Publicar vários trechos deste Fire, nas plataformas escolhidas"
            >
              <Send />
              Publicar em lote
            </Button>
          )}

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
                // Mexer no cursor com a mão cancela a parada armada pelo
                // "Assistir" — senão um `pause` dispararia minutos depois, num
                // ponto que não tem nada a ver com o trecho que se mandou tocar.
                onSeeking={aoBuscar}
                className="absolute inset-0 h-full w-full"
              />
              {/* D-558: a máscara é o enquadramento DESENHADO, e some pelo
                  mesmo motivo que o controle sumiu do modal — com palco, a
                  janela 9:16 sobre o quadro cru não descreve o short que vai
                  sair. Quem descreve é a prévia ao lado. Sem palco ela é a
                  única prévia que existe, e continua. */}
              {emQuadro && !temPalco && (
                <MascaraEnquadramento
                  largura={dimensoes.largura}
                  altura={dimensoes.altura}
                  focoX={emQuadro.foco_efetivo}
                >
                  {legenda}
                </MascaraEnquadramento>
              )}
              {/* Com palco a legenda não perde o pai: ela vinha dentro da
                  máscara e sairia de cena junto com ela. */}
              {emQuadro && temPalco && !palcoNaTela && legenda}

            </div>

            {palcoNaTela && planoNaTela && (
              <div className="flex min-h-0 flex-none flex-col items-center gap-1">
                <PalcoPrevia plano={planoNaTela} video={video}>
                  {legenda}
                </PalcoPrevia>
                {/* D-562: aqui a prévia só MOSTRA. Mover e dimensionar as
                    janelas passaram os dois para a seção 3 do "Definir o
                    palco", onde a prévia é fixa e o controle de tamanho já
                    morava — eram metades da mesma decisão em telas diferentes.
                    O gesto era bom; o lugar é que estava errado. */}
                <span className="font-code text-[9.5px] uppercase tracking-[0.06em] text-[var(--wb-text-mute)]">
                  como vai sair
                </span>
              </div>
            )}
          </div>

          {/* D-539: os endereços fixos do player. Ficam colados nele, e não no
              painel da régua: são gesto de ASSISTIR, e quem está olhando o
              vídeo não deveria ter que descer os olhos para voltar ao começo. */}
          <NavegacaoDoPlayer trecho={emQuadro ?? null} onIrPara={irPara} />

          {/* O painel abaixo ROLA em vez de ser cortado (D-499). Ele cresce com
              o número de cenas e ganhou o recorte e o fundo; com `flex-none` e o
              `overflow-hidden` do grid, as últimas linhas simplesmente sumiam —
              sem barra, sem sinal, sem jeito de chegar nelas numa janela de
              800px de altura.
              O vídeo leva 2 partes e o painel 1: deixar os dois em `flex-1`
              espremia o player para uma tira, e é nele que se decide o corte. */}
          {duracaoRegua > 0 && shorts.length > 0 && (
            <div className="min-h-0 flex-1 overflow-y-auto rounded-[10px] border border-[var(--wb-border)] bg-[var(--wb-bg-panel)] p-2.5">
              {/* D-550: de volta a regua lisa enquanto a `ReguaDeOnda` nao
                  desenha os blocos coloridos. Ela ja tem onda e zoom, mas os
                  trechos nao aparecem — e perder a cor de cada trecho custa
                  mais do que ganhar o zoom. O componente fica no repo. */}
              {/* D-551: a regua e o mesmo instrumento do editor de bruto —
                  onda, zoom, scroll e um bloco colorido por trecho, com alca
                  no que esta em foco. Sem picos (bruto ausente ou ilegivel)
                  cai na regua lisa, que ainda serve para ver a distribuicao. */}
              {onda.data?.peaks?.length ? (
                <ReguaDeOnda
                  corteId={corteId}
                  duracaoSeg={duracaoRegua}
                  picos={onda.data.peaks}
                  shorts={shorts}
                  emFoco={emQuadro}
                  tempoAtual={tempoAtual}
                  onSeek={irPara}
                  onBordas={gravarBordas}
                  onSelecionar={setSelecionado}
                />
              ) : (
                <>
                  <LinhaDoTempo
                    duracaoSeg={duracaoRegua}
                    shorts={shorts}
                    emFoco={emQuadro}
                    tempoAtual={tempoAtual}
                    onSeek={irPara}
                    onBordas={gravarBordas}
                  />
                  {/* D-554: a queda para a régua lisa era MUDA.
                      A onda e o zoom existem desde a D-551, mas dependem dos
                      picos do bruto — e sem bruto em disco a tela trocava de
                      instrumento sem dizer nada. De fora, isso é
                      indistinguível de "pediram zoom e não implementaram":
                      o operador procura o botão, não acha, e conclui que a
                      funcionalidade não veio. A régua lisa continua sendo a
                      resposta certa; o que faltava era ela se explicar. */}
                  {!onda.isLoading && (
                    <p className="mt-1.5 font-code text-[10.5px] leading-relaxed text-[var(--wb-text-mute)]">
                      {fire?.tem_bruto === false
                        ? 'Régua lisa: sem o bruto em disco não há onda nem zoom. Gere o bruto deste corte para ter a régua do editor.'
                        : 'Régua lisa: não deu para ler o áudio do bruto, então não há onda nem zoom neste corte.'}
                    </p>
                  )}
                </>
              )}
              {/* D-560: o painel de bordas finas saiu. Ele existia porque a
                  régua não tinha resolução para encostar no milésimo — os
                  campos eram a única via. Agora a régua abre a 50px/s e vai a
                  20x, e cada pixel vale milissegundos: a alça faz o que os
                  campos faziam, olhando para a onda em vez de para um número. */}
              {emQuadro && (
                <div className="mt-2.5 border-t border-[var(--wb-border-soft)] pt-2.5">
                  {/* D-560: as CENAS saíram da tela junto com o render.
                      "É tudo texto, e jogar texto no shorts acho que é ruim. Já
                      tem a legenda, ficar adicionando mais texto polui demais."
                      O `CENAS_LIGADAS` do `render_short.py` é o outro lado
                      disto — e o interruptor único para religar as duas pontas.
                      O componente e os dados ficam onde estão. */}
                  {/* D-509: um botão no lugar da fileira de controles. Como a
                      tela monta, de onde vem cada janela, o fundo e os presets
                      eram cinco perguntas soltas com pesos iguais; agora são
                      uma sequência, dentro do modal, com a prévia ao lado.

                      D-560: e o "Recortar da live" foi junto. Ele e a seção 2
                      do modal são o MESMO `EditorDeRecorte` gravando no MESMO
                      `recortes_palco` — dois caminhos para uma decisão só, o de
                      fora sem a prévia ao lado que diz o que a marcação fez. */}
                  {emQuadro && (
                    <div className="mt-2.5 flex flex-wrap items-center gap-1.5 border-t border-[var(--wb-border-soft)] pt-2.5">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setDefinindoPalco(true)}
                      >
                        <SlidersHorizontal />
                        Definir o palco
                      </Button>
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
              onEnquadrarPeloRosto={() => enquadrarPeloRosto.mutate(short.id)}
              enquadrando={enquadrarPeloRosto.isPending && enquadrarPeloRosto.variables === short.id}
              vereditoDoRosto={
                enquadrarPeloRosto.data && enquadrarPeloRosto.variables === short.id
                  ? textoDoVeredito(enquadrarPeloRosto.data)
                  : ''
              }
              // D-552: aplicar um palco copia os valores E marca a origem, para
              // o select poder dizer qual preset descreve este trecho.
              onPalco={(presetId, payload) =>
                atualizar.mutate({ shortId: short.id, ...mudancaDoPalco(presetId, payload) })
              }
              // D-542: seleciona ANTES de abrir. O modal edita `emQuadro`, e
              // abri-lo a partir de um card que nao esta em foco editaria outro
              // trecho — sem erro nenhum, que e o pior jeito de errar.
              onDefinirPalco={() => {
                setSelecionado(short.id);
                setDefinindoPalco(true);
              }}
              // Mesma regra do palco (D-542): seleciona ANTES de abrir, senao o
              // modal editaria o gancho de outro trecho sem erro nenhum.
              onEscreverGancho={() => {
                setSelecionado(short.id);
                setEscrevendoGancho(true);
              }}
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
      {emQuadro && (
        <DefinirPalcoModal
          open={definindoPalco}
          onClose={() => setDefinindoPalco(false)}
          short={emQuadro}
          corteId={corteId}
          plano={palcoDoShort.data ?? null}
          fonte={{ largura: dimensoes.largura, altura: dimensoes.altura }}
          video={video}
          ocupado={atualizar.isPending}
          tempoAtualSeg={tempoAtual}
          onAplicar={(mudanca) => atualizar.mutate({ shortId: emQuadro.id, ...mudanca })}
        />
      )}
      {emQuadro && (
        <GanchoModal
          open={escrevendoGancho}
          onClose={() => setEscrevendoGancho(false)}
          short={emQuadro}
          plano={palcoNaTela ? (palcoDoShort.data ?? null) : null}
          video={video}
          palavras={transcricao.data?.palavras ?? []}
          ocupado={atualizar.isPending}
          onGravar={(texto, ateSeg) => {
            atualizar.mutate({
              shortId: emQuadro.id,
              gancho_tela: texto,
              gancho_ate_seg: ateSeg,
            });
            setEscrevendoGancho(false);
          }}
        />
      )}
      <PublicarEmLoteModal
        open={publicandoEmLote}
        onClose={() => setPublicandoEmLote(false)}
        corteId={corteId}
        shorts={shorts}
      />
    </div>
  );
}
