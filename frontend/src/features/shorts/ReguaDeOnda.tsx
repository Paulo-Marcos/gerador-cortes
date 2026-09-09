import { useCallback, useEffect, useRef, useState } from 'react';
import WaveSurfer from 'wavesurfer.js';
import RegionsPlugin from 'wavesurfer.js/dist/plugins/regions.esm.js';
import { Minus, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { brutoUrl, type ShortSugerido } from './shortsApi';
import { arrastar, mmss, type Borda, type Bordas } from './linhaDoTempoShort';
import { BORDA_DO_REJEITADO, COR_DO_REJEITADO, bordaDoShort, corDoShort } from './coresDosShorts';

// D-548: a régua da curadoria, com o mesmo instrumento do editor de bruto.
//
// A D-541 desenhou a onda num canvas próprio — suficiente para VER o envelope,
// insuficiente para trabalhar nele. Num corte de dez minutos, meio segundo é
// menos de um pixel: dá para achar a frase, não para achar onde ela começa.
//
// Zoom não é conforto, é a diferença entre as duas coisas. E zoom pede scroll,
// que pede que as alças acompanhem o scroll, que pede que a régua e a onda
// sejam o MESMO objeto — que é exatamente o que o wavesurfer resolve, e o que
// um canvas nosso teria de reimplementar inteiro.
//
// ## Por que não reusar o painel do editor
//
// Ele é o mesmo wavesurfer, e a tentação é extrair. São 1500 linhas amarradas
// às preocupações do editor — desvios com categoria, dividir corte, smartplay,
// pin — e travadas por duas features. Generalizá-lo para servir a dois donos
// faria dele o lugar onde os dois quebram juntos.
//
// O que se compartilha é a BIBLIOTECA e as convenções: mesmo wavesurfer, mesmo
// plugin de regiões, mesma escala de zoom (50px/s × nível), mesmos picos vindos
// prontos do backend. O operador reconhece o instrumento; o código não herda a
// bagagem.

// Zoom 1 = o corte INTEIRO cabendo na régua. O px/s base sai da largura medida
// dividida pela duração, e não de uma constante.
//
// O editor usa 50px/s fixos porque a janela dele é a do corte — poucos minutos,
// e o começo fica perto do x=0. Aqui a régua é o bruto inteiro: 438s a 50px/s
// dão 21.900px de onda para ~740px de painel, e o operador via os primeiros
// quinze segundos achando que via tudo. Pior: as regiões são virtualizadas, e
// nenhuma delas caía na janela visível — a régua ficava sem bloco nenhum.
const ZOOM_MINIMO = 1;
const ZOOM_MAXIMO = 12;
const PASSO_DO_ZOOM = 1;

interface Props {
  corteId: string;
  duracaoSeg: number;
  picos: readonly number[];
  shorts: ShortSugerido[];
  emFoco: ShortSugerido | null;
  tempoAtual: number;
  onSeek: (segundos: number) => void;
  onBordas: (shortId: string, bordas: Partial<Bordas>, focar?: Borda) => void;
  /** Clicar num bloco põe aquele trecho em foco, como clicar no card. */
  onSelecionar: (shortId: string) => void;
}

type Plugin = ReturnType<typeof RegionsPlugin.create>;

/** Põe um bloco por trecho sobre a onda, cada um com a sua cor. */
function desenhar(plugin: Plugin, shorts: ShortSugerido[], emFoco: ShortSugerido | null): void {
  plugin.clearRegions();

  shorts.forEach((short, indice) => {
    const rejeitado = short.status === 'rejeitado';
    plugin.addRegion({
      id: short.id,
      start: short.inicio_seg,
      end: short.fim_seg,
      color: rejeitado ? COR_DO_REJEITADO : corDoShort(indice),
      // Só o trecho EM FOCO tem alça. Todas arrastáveis convidariam a mexer no
      // trecho errado — e aqui um pixel vale meio segundo.
      drag: false,
      resize: short.id === emFoco?.id && !rejeitado,
      content: `${indice + 1}`,
    });
  });

  // A borda marca onde o bloco acaba; o contorno diz qual está em foco.
  for (const regiao of plugin.getRegions()) {
    const indice = shorts.findIndex((s) => s.id === regiao.id);
    const elemento = (regiao as unknown as { element?: HTMLElement }).element;
    if (!elemento || indice < 0) continue;
    const rejeitado = shorts[indice].status === 'rejeitado';
    elemento.style.borderLeft = `2px solid ${
      rejeitado ? BORDA_DO_REJEITADO : bordaDoShort(indice)
    }`;
    elemento.style.borderRight = elemento.style.borderLeft;
    elemento.style.outline = regiao.id === emFoco?.id ? '2px solid var(--wb-accent)' : 'none';
  }
}

export function ReguaDeOnda({
  corteId,
  duracaoSeg,
  picos,
  shorts,
  emFoco,
  tempoAtual,
  onSeek,
  onBordas,
  onSelecionar,
}: Props) {
  const caixa = useRef<HTMLDivElement>(null);
  const onda = useRef<WaveSurfer | null>(null);
  const regioes = useRef<ReturnType<typeof RegionsPlugin.create> | null>(null);
  const pronta = useRef(false);
  // px/s que faz o corte inteiro caber. Medido no `ready`, quando a caixa já
  // tem largura — antes disso qualquer conta daria zero.
  const base = useRef(1);
  const [zoom, setZoom] = useState(1);
  // D-548: o plugin de regiões só posiciona um bloco depois que a onda tem
  // DURAÇÃO, e a duração só existe no `ready`. Desenhar antes disso não levanta
  // erro — simplesmente não aparece nada, que foi o que aconteceu na primeira
  // execução. Este contador é o que faz o efeito das regiões rodar de novo
  // quando a onda fica pronta, sem acoplar os dois efeitos.
  const [prontidao, setProntidao] = useState(0);

  // Os handlers mudam a cada render e o wavesurfer só recebe os seus uma vez.
  // Guardá-los numa ref é o que permite criar a onda UMA vez — recriá-la a cada
  // mudança de props recarregaria o áudio e perderia o scroll do operador.
  const atual = useRef({ shorts, emFoco, onSeek, onBordas, onSelecionar, duracaoSeg, picos, zoom });
  atual.current = { shorts, emFoco, onSeek, onBordas, onSelecionar, duracaoSeg, picos, zoom };

  // O gatilho é "já HÁ picos", e não "quais picos": o array chega uma vez e não
  // muda, e depender do conteúdo dele reintroduziria a recriação que a D-548
  // passou a tarde caçando.
  const temPicos = picos.length > 0;

  // ── a onda, criada uma vez por corte ───────────────────────────────────
  useEffect(() => {
    if (!caixa.current || !temPicos) return;

    let cancelado = false;
    const plugin = RegionsPlugin.create();
    regioes.current = plugin;

    const ws = WaveSurfer.create({
      container: caixa.current,
      waveColor: 'oklch(0.58 0.13 225 / 0.82)',
      progressColor: 'oklch(0.58 0.13 225 / 0.45)',
      cursorColor: 'var(--wb-accent-strong)',
      cursorWidth: 2,
      barWidth: 1.5,
      barGap: 0.6,
      height: 'auto',
      autoCenter: false,
      autoScroll: false,
      // Provisório: a escala real é calculada no `ready`, com a largura medida.
      minPxPerSec: 1,
    });
    ws.registerPlugin(plugin);
    // Mudo: quem toca é o `<video>` ao lado. Dois áudios do mesmo arquivo
    // tocando juntos sairiam em eco e fora de fase.
    ws.setVolume(0);
    onda.current = ws;

    ws.on('interaction', (segundos: number) => atual.current.onSeek(segundos));
    // Esperar a CONDIÇÃO, e não o evento `ready`.
    //
    // O plugin de regiões precisa de duas coisas para pintar um bloco: uma
    // duração (senão `addRegion` fica esperando `ready` para sempre) e uma
    // largura medida (a virtualização compara a posição do bloco com
    // `getWidth()`, e com zero ele conclui que nada está visível).
    //
    // `ready` deveria anunciar as duas, e neste caminho ele não chega — a onda
    // desenha, `getDuration()` responde, e o evento não vem. Perseguir o
    // porquê custou caro e não mudaria o que a régua precisa: perguntar pelas
    // duas condições é mais curto que descobrir por que o mensageiro sumiu, e
    // não depende de um detalhe interno da biblioteca continuar valendo.
    let quadro = 0;
    const esperarParaDesenhar = () => {
      if (cancelado) return;
      const duracao = ws.getDuration();
      const largura = ws.getWidth();
      if (duracao > 0 && largura > 0) {
        pronta.current = true;
        // Zoom 1 = o corte inteiro na régua. Sem isto a onda sai a 50px/s: um
        // bruto de sete minutos vira 21.900px para ~740px de painel, e o
        // operador vê os primeiros quinze segundos achando que vê tudo.
        base.current = largura / duracao;
        try {
          ws.zoom(base.current * atual.current.zoom);
        } catch {
          // Sem duração ainda; o próximo clique de zoom acerta.
        }
        desenhar(plugin, atual.current.shorts, atual.current.emFoco);
        setProntidao((n) => n + 1);
        return;
      }
      quadro = requestAnimationFrame(esperarParaDesenhar);
    };
    quadro = requestAnimationFrame(esperarParaDesenhar);

    plugin.on('region-clicked', (regiao, evento) => {
      evento.stopPropagation();
      atual.current.onSelecionar(regiao.id);
    });

    // Só ao SOLTAR, e não a cada pixel: sessenta escritas por segundo entupiriam
    // a fila e ainda deixariam a última chegar fora de ordem.
    plugin.on('region-updated', (regiao) => {
      const alvo = atual.current.emFoco;
      if (!alvo || regiao.id !== alvo.id) return;

      const mexeuNoInicio = Math.abs(regiao.start - alvo.inicio_seg) > 0.01;
      const borda: Borda = mexeuNoInicio ? 'inicio' : 'fim';
      const travadas = arrastar(
        { inicio: alvo.inicio_seg, fim: alvo.fim_seg },
        borda,
        mexeuNoInicio ? regiao.start : regiao.end,
        atual.current.duracaoSeg,
      );
      atual.current.onBordas(alvo.id, travadas, borda);
    });

    // Os picos vêm prontos do backend; o arquivo entra só para o wavesurfer ter
    // duração e poder posicionar o cursor. O navegador já o tem em cache — é o
    // mesmo `src` do player ao lado.
    void ws.load(
      brutoUrl(corteId),
      [atual.current.picos as number[]],
      atual.current.duracaoSeg || undefined,
    );

    return () => {
      cancelado = true;
      cancelAnimationFrame(quadro);
      pronta.current = false;
      ws.destroy();
      onda.current = null;
      regioes.current = null;
      void cancelado;
    };
    // SÓ o corte. Nem zoom, nem picos, nem duração.
    //
    // `duracaoSeg` estava aqui e foi o que quebrou tudo: ela nasce com o valor
    // do banco (438) e vira o do arquivo (438,023) quando o `<video>` lê os
    // metadados. Um número diferente = efeito reexecutado = onda destruída e
    // recriada — e a instância que terminava de carregar já estava fora do DOM
    // quando o `ready` dela chegava. As regiões eram criadas num container
    // órfão: o plugin listava as cinco, nenhuma tinha pai, nada aparecia.
    //
    // Um refino de milissegundo na duração não justifica recarregar a onda.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [corteId, temPicos]);

  // ── zoom, sem recarregar nada ──────────────────────────────────────────
  useEffect(() => {
    if (!pronta.current) return;
    try {
      onda.current?.zoom(base.current * zoom);
    } catch {
      // `zoom` levanta se a onda ainda não tem duração. Não é motivo para
      // derrubar a tela: o próximo clique acerta.
    }
  }, [zoom]);

  // ── os blocos, redesenhados quando os trechos mudam ────────────────────
  useEffect(() => {
    const plugin = regioes.current;
    if (!plugin || !pronta.current) return;

    desenhar(plugin, shorts, emFoco);
  }, [shorts, emFoco, prontidao]);

  // ── o cursor segue o player ────────────────────────────────────────────
  useEffect(() => {
    if (!pronta.current || !onda.current) return;
    const duracao = onda.current.getDuration() || 0;
    if (duracao <= 0) return;
    onda.current.setTime(Math.min(tempoAtual, duracao));
  }, [tempoAtual]);

  const mudarZoom = useCallback((delta: number) => {
    setZoom((n) => Math.min(ZOOM_MAXIMO, Math.max(ZOOM_MINIMO, n + delta)));
  }, []);

  if (picos.length === 0) return null;

  return (
    <div className="flex-none select-none">
      <div className="mb-1 flex items-center gap-2 font-code text-[10.5px] tabular-nums text-[var(--wb-text-mute)]">
        <span>00:00</span>
        <div className="flex-1" />
        {emFoco && (
          <span>
            {mmss(emFoco.inicio_seg)} → {mmss(emFoco.fim_seg)} ·{' '}
            {Math.round(emFoco.fim_seg - emFoco.inicio_seg)}s
          </span>
        )}
        <div className="flex-1" />
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Diminuir o zoom da régua"
          disabled={zoom <= ZOOM_MINIMO}
          onClick={() => mudarZoom(-PASSO_DO_ZOOM)}
        >
          <Minus />
        </Button>
        <span className="w-[30px] text-center">{zoom.toFixed(0)}×</span>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Aumentar o zoom da régua"
          disabled={zoom >= ZOOM_MAXIMO}
          onClick={() => mudarZoom(PASSO_DO_ZOOM)}
        >
          <Plus />
        </Button>
        <span>{mmss(duracaoSeg)}</span>
      </div>

      {/* `overflow-x-auto` é do wavesurfer: com zoom a onda fica mais larga que
          o painel, e é o scroll dela que leva as alças junto. */}
      <div
        ref={caixa}
        className="h-24 w-full rounded-[8px] bg-[var(--wb-bg-inset)]"
        role="presentation"
      />
    </div>
  );
}
