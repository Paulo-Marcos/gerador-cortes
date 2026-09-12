// D-459/D-492: a curadoria dos candidatos de um Fire.
//
// A premissa editorial manda no desenho: o corte Fire já passou pelo funil
// inteiro, então esta tela não é de garimpo — é de ESCOLHA ENTRE BONS.
//
// O layout segue disso. À ESQUERDA o material (o bruto, o palco como vai sair,
// a régua); à DIREITA as decisões (o palco do corte e os candidatos). Olhar e
// decidir são movimentos diferentes, e misturá-los foi o que produziu a parede
// de botões que o operador reclamou (D-492).
//
// D-582: e é essa mesma divisão que dá os arquivos. A página ficou com o que
// os quatro blocos COMPARTILHAM — o player, o candidato em foco, o histórico
// de edição e os modais — e cada bloco levou consigo o que só ele usa.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { useShortcuts } from '@/features/editor/shortcuts';
import { shortcutFromRegistry } from '@/features/editor/shortcutsRegistry';
import {
  normalizarVelocidade,
  useVelocidadeNoVideo,
  useVelocidadePlayerPadrao,
} from '@/hooks/useVelocidadePlayerPadrao';
import { isWorkbenchEnabled } from '@/components/workbench/workbenchFlag';
import type { ShortSugerido } from './shortsApi';
import { avisoDescarteBruto } from './descarteBruto';
import type { Borda } from './linhaDoTempoShort';
import { NavegacaoDoPlayer } from './NavegacaoDoPlayer';
import { useParadaNoFim } from './useParadaNoFim';
import { CabecalhoDoFire } from './CabecalhoDoFire';
import { ColunaDeDecisoes } from './ColunaDeDecisoes';
import { PainelDaRegua } from './PainelDaRegua';
import { PlayerDoBruto } from './PlayerDoBruto';
import { LegendaPrevia } from './LegendaPrevia';
import { DefinirPalcoModal } from './DefinirPalcoModal';
import { GanchoModal } from './GanchoModal';
import { GanchoPrevia } from './GanchoPrevia';
import { useEdicaoDoShort } from './useEdicaoDoShort';
import { useSimulacaoDePalco } from './useSimulacaoDePalco';
import { useFires } from './useFires';
import {
  useDescartarBruto,
  usePalcoDoShort,
  useShortsDoCorte,
  useTranscricaoDoCorte,
} from './useShortsDoCorte';

// D-479: o operador precisa saber a QUALIDADE do que está lendo. A auto-legenda
// erra grafia, e erro de grafia num short vira o produto — o texto é o conteúdo.
// D-581: o par que o Ctrl+U alterna. Espelha o do Bruto (D-575) de proposito:
// a semente desacelera porque o pedido nasceu de precisar ouvir DEVAGAR para
// acertar a borda, e conferir o resultado exige 1x.
const VELOCIDADE_NORMAL = 1;
const VELOCIDADE_TRABALHO_INICIAL = 0.75;

export default function FireDetalhePage() {
  const workbench = isWorkbenchEnabled();
  const { corteId = '' } = useParams();
  const navigate = useNavigate();
  const video = useRef<HTMLVideoElement>(null);

  const [selecionado, setSelecionado] = useState<string | null>(null);
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

  const velocidadePadrao = useVelocidadePlayerPadrao();
  const [velocidade, setVelocidade] = useState(velocidadePadrao);
  // D-581: a ultima velocidade != 1x em uso, para o Ctrl+U ir e voltar sem
  // reconstruir o caminho no Ctrl+J/K. Ref e nao state, como no Bruto (D-575):
  // e memoria do gatilho, nao coisa que a tela desenha, e os bindings de atalho
  // sao memoizados — state ficaria stale dentro deles.
  const velocidadeTrabalhoRef = useRef(VELOCIDADE_TRABALHO_INICIAL);
  useVelocidadeNoVideo(video, velocidade, corteId);
  useEffect(() => setVelocidade(velocidadePadrao), [velocidadePadrao, corteId]);

  // D-581: a "velocidade de trabalho" aprende OBSERVANDO — o mesmo arranjo que
  // a D-575 adotou no Bruto, e pela mesma razao.
  //
  // Prende-la so no `ajustarVelocidade` (Ctrl+J/K) a deixaria cega para a via
  // que mais importa: a velocidade tambem chega pelo efeito acima, quando os
  // Ajustes carregam ou o corte troca. Quem configurou 1,50x via o Ctrl+U ir
  // para 1x (certo) e voltar para 0,75x (errado) — perdendo, na primeira ida e
  // volta, a velocidade em que escolheu trabalhar. Medido na tela.
  //
  // A semente de 0,75x continua valendo para quem abre em 1x e nunca ajustou.
  useEffect(() => {
    if (Math.abs(velocidade - VELOCIDADE_NORMAL) > 0.01) {
      velocidadeTrabalhoRef.current = velocidade;
    }
  }, [velocidade]);

  const { data, isLoading, isError, error } = useShortsDoCorte(corteId);
  const fires = useFires();
  const descartar = useDescartarBruto();
  const transcricao = useTranscricaoDoCorte(corteId);
  const temPalavras = (transcricao.data?.palavras.length ?? 0) > 0;

  const shorts = useMemo(() => data?.shorts ?? [], [data]);
  // D-581: o caminho UNICO de escrita desta tela. Todo PATCH passa por aqui
  // para o Ctrl+Z enxergar tudo — um segundo caminho seria uma mudanca que o
  // historico nao viu, e um desfazer que pula um passo e pior que nenhum.
  const edicao = useEdicaoDoShort(corteId, shorts);
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

  // O rascunho vive até o plano GRAVADO chegar — ou até a gravação falhar, e aí
  // manter o desenho seria mostrar um ajuste que o banco não tem.
  const descartarSimulacao = simulacao.descartar;
  useEffect(
    () => descartarSimulacao(),
    [palcoDoShort.data, edicao.estado, descartarSimulacao],
  );

  // D-539: assistir um trecho para NO FIM dele. O player é o bruto inteiro, e
  // sem isso o vídeo seguia pelo assunto seguinte — o operador só percebia que
  // passou do fim quando o tema mudava, que é tarde para julgar se o corte
  // fecha bem.
  const { tocarAte, irPara, aoBuscar } = useParadaNoFim(video);

  const tocarTrecho = useCallback(
    (short: ShortSugerido) => {
      setSelecionado(short.id);
      tocarAte(short.inicio_seg, short.fim_seg);
    },
    [tocarAte],
  );

  // Timeline e painel fino gravam pelo MESMO caminho: duas rotas de escrita para
  // o mesmo campo divergiriam no arredondamento.
  const gravarBordas = useCallback(
    (shortId: string, bordas: { inicio?: number; fim?: number }, focar?: Borda) => {
      edicao.gravar(shortId, {
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
    [edicao, irPara],
  );

  // O tempo corrente do player é a fonte da borda nova: o operador acabou de ver
  // onde o trecho deveria começar, e pedir que digite seria fazê-lo traduzir o
  // que já sabe.
  const moverBorda = useCallback(
    (short: ShortSugerido, campo: 'inicio_seg' | 'fim_seg') => {
      const el = video.current;
      if (!el) return;
      edicao.gravar(short.id, { [campo]: Number(el.currentTime.toFixed(2)) });
    },
    [edicao],
  );

  // D-542: seleciona ANTES de abrir. O modal edita `emQuadro`, e abri-lo a
  // partir de um card que nao esta em foco editaria outro trecho — sem erro
  // nenhum, que e o pior jeito de errar. Vale para o gancho pela mesma razao.
  const abrirPalcoDe = useCallback((shortId: string) => {
    setSelecionado(shortId);
    setDefinindoPalco(true);
  }, []);

  const abrirGanchoDe = useCallback((shortId: string) => {
    setSelecionado(shortId);
    setEscrevendoGancho(true);
  }, []);

  const onDescartar = () => {
    if (!fire) return;
    if (!confirm(avisoDescarteBruto(fire.titulo || `Corte ${fire.numero}`, fire.bruto_mb))) return;
    descartar.mutate(corteId, { onSuccess: () => navigate('/shorts') });
  };

  const ajustarVelocidade = useCallback((passo: number) => {
    setVelocidade((atual) => normalizarVelocidade(atual + passo));
  }, []);

  const alternarVelocidade = useCallback(() => {
    setVelocidade((atual) =>
      Math.abs(atual - VELOCIDADE_NORMAL) < 0.01
        ? normalizarVelocidade(velocidadeTrabalhoRef.current)
        : VELOCIDADE_NORMAL,
    );
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
    shortcutFromRegistry('shorts.alternarVelocidade', alternarVelocidade),
    shortcutFromRegistry('shorts.undo', edicao.desfazer),
    shortcutFromRegistry('shorts.redo', edicao.refazer),
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
        cor={emQuadro.gancho_cor}
        realce={emQuadro.gancho_realce}
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
      <CabecalhoDoFire
        workbench={workbench}
        corteId={corteId}
        fire={fire}
        edicao={edicao}
        temPalco={temPalco}
        verPalco={verPalco}
        onAlternarPalco={() => setVerPalco((v) => !v)}
        fonteDaTranscricao={transcricao.data?.fonte ?? null}
        temPalavras={temPalavras}
        legendaVisivel={legendaVisivel}
        onAlternarLegenda={() => setLegendaVisivel((v) => !v)}
        velocidade={velocidade}
        emVelocidadeNormal={Math.abs(velocidade - VELOCIDADE_NORMAL) < 0.01}
        onAlternarVelocidade={alternarVelocidade}
        descartando={descartar.isPending}
        onDescartar={onDescartar}
      />

      <main className="grid min-h-0 flex-1 gap-4 overflow-hidden p-4 lg:grid-cols-[minmax(0,1fr)_400px]">
        {/* ── Material: o que existe para olhar ───────────────────────── */}
        <section className="flex min-h-0 flex-col gap-3">
          <PlayerDoBruto
            corteId={corteId}
            video={video}
            dimensoes={dimensoes}
            emQuadro={emQuadro}
            temPalco={temPalco}
            palcoNaTela={palcoNaTela}
            planoNaTela={planoNaTela}
            legenda={legenda}
            onMetadados={({ largura, altura, duracao }) => {
              setDimensoes({ largura, altura });
              setDuracaoVideo(duracao);
            }}
            onTempo={setTempoAtual}
            aoBuscar={aoBuscar}
          />

          {/* D-539: os endereços fixos do player. Ficam colados nele, e não no
              painel da régua: são gesto de ASSISTIR, e quem está olhando o
              vídeo não deveria ter que descer os olhos para voltar ao começo. */}
          <NavegacaoDoPlayer trecho={emQuadro ?? null} onIrPara={irPara} />

          {/* O vídeo leva 2 partes e o painel 1: deixar os dois em `flex-1`
              espremia o player para uma tira, e é nele que se decide o corte. */}
          <PainelDaRegua
            corteId={corteId}
            duracaoRegua={duracaoRegua}
            shorts={shorts}
            emQuadro={emQuadro}
            tempoAtual={tempoAtual}
            temBruto={fire?.tem_bruto}
            onSeek={irPara}
            onBordas={gravarBordas}
            onSelecionar={setSelecionado}
            onDefinirPalco={() => setDefinindoPalco(true)}
          />
        </section>

        {/* ── Decisões: o que fazer com o material ────────────────────── */}
        <ColunaDeDecisoes
          corteId={corteId}
          shorts={shorts}
          emFocoId={emQuadro?.id}
          carregando={isLoading}
          falhou={isError}
          erroDaLista={error}
          edicao={edicao}
          tempoAtual={tempoAtual}
          duracaoRegua={duracaoRegua}
          onSelecionar={setSelecionado}
          onTocar={tocarTrecho}
          onBorda={moverBorda}
          onDefinirPalco={abrirPalcoDe}
          onEscreverGancho={abrirGanchoDe}
        />
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
          ocupado={edicao.ocupado}
          tempoAtualSeg={tempoAtual}
          onAplicar={(mudanca) => edicao.gravar(emQuadro.id, mudanca)}
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
          ocupado={edicao.ocupado}
          onGravar={(texto, ateSeg, cor, realce) => {
            edicao.gravar(emQuadro.id, {
              gancho_tela: texto,
              gancho_ate_seg: ateSeg,
              gancho_cor: cor,
              gancho_realce: realce,
            });
            setEscrevendoGancho(false);
          }}
        />
      )}
    </div>
  );
}
