import { useCallback, useEffect, useRef, useState } from 'react';
import WaveSurfer from 'wavesurfer.js';
import RegionsPlugin from 'wavesurfer.js/dist/plugins/regions.esm.js';
import { Minus, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { comOffsets, duracaoLiquida, efetivos, temColagem } from './segmentosDoShort';
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

// ## D-558: a régua tinha zoom, e mesmo assim não dava para trabalhar nela
//
// A D-551 fez zoom 1 = "o corte inteiro cabendo na régua", medindo px/s como
// largura÷duração. Parecia certo — a tela abria mostrando tudo — e era o erro.
//
// Um bruto de sete minutos num painel de mil pixels dá 2,4 px/s. No teto de
// 12× isso vira 29 px/s, ainda ABAIXO dos 50 px/s com que o editor de bruto
// COMEÇA. O operador tinha um botão de zoom que funcionava e nunca chegava
// onde ele precisava chegar: "não dá para ver onde acaba uma fala e onde
// começa outra". A queixa não era do controle, era do alcance.
//
// Agora a escala é a MESMA do editor: 50 px/s × nível, 0,1× a 20×, botões em
// passo multiplicativo e Ctrl+roda sobre a onda. Zoom 1 já nasce com a onda
// mais larga que o painel — que é o ponto: a régua rola, e a barra de rolagem
// é o que diz que há mais coisa fora da vista.
//
// O que a D-551 tentava evitar com o "cabe tudo" continua real: as regiões são
// VIRTUALIZADAS, e uma que cai fora da janela visível não existe no DOM. A
// resposta certa não era espremer a onda até tudo caber — era ROLAR até o
// trecho em foco, que é o que o editor faz e o que `centrarEm` faz aqui.

/** O px/s do editor de bruto (`TimelinePanel`). Zoom 1 = a escala de lá. */
const PX_POR_SEGUNDO = 50;

const ZOOM_MINIMO = 0.1;
const ZOOM_MAXIMO = 20;
/** Passo dos botões e da roda — multiplicativo, como no editor. */
const FATOR_DO_BOTAO = 1.5;
const FATOR_DA_RODA = 1.1;

/** Quanto o cursor pode chegar perto da borda antes da janela correr atrás. */
const MARGEM_DO_CURSOR = 24;

// A onda em altura FIXA, e a caixa um pouco maior que ela.
//
// Com `height: 'auto'` o wavesurfer faz a onda ocupar a caixa inteira — e aí a
// barra de rolagem, que ele acrescenta POR FORA do conteúdo, fica 10px além do
// fundo da caixa e é cortada. É por isso que o `::part(scroll)` do `index.css`
// existia há meses sem nunca ter aparecido para ninguém: o editor de bruto tem
// o mesmo arranjo, e lá a barra também nunca coube.
//
// Reservando a tira aqui, ela passa a ser visível — que era o pedido: sem barra
// não há como o operador saber que existe mais onda fora da vista.
// D-560: mais alta. A régua deixou de ser um resumo e virou o instrumento de
// trabalho — é nela que se acha o começo da frase agora que o painel de bordas
// finas saiu. Altura é resolução vertical: com 88px o envelope de uma fala
// baixa quase encosta no de um silêncio.
const ALTURA_DA_ONDA = 148;
const ALTURA_DA_BARRA = 12;

// De quanto em quanto perguntamos se a onda já pode receber os blocos.
//
// `setTimeout` e não `requestAnimationFrame`, e a diferença não é estilo: rAF
// NÃO DISPARA em aba que o navegador não está pintando. A régua montada numa
// aba de fundo — ou numa janela minimizada — nunca desenharia bloco nenhum, e
// o sintoma seria exatamente o que se viu: as regiões existindo no plugin e
// nenhuma no DOM, sem erro em lugar nenhum.
const INTERVALO_DA_ESPERA = 60;

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

// D-604: um short pode ser vários segmentos do bruto, então o id da região
// deixou de ser o id do short. `s1__2` é o terceiro segmento do short `s1`.
//
// O separador é duplo de propósito: um uuid tem hífens, e um `split('-')` faria
// o id do short virar lixo no primeiro clique.
const SEPARADOR = '__';

function idDaRegiao(shortId: string, indice: number): string {
  return `${shortId}${SEPARADOR}${indice}`;
}

/** De qual short é esta região. Id sem sufixo (legado) devolve ele mesmo. */
export function shortDaRegiao(idRegiao: string): string {
  return idRegiao.split(SEPARADOR)[0];
}

/** Qual segmento do short é esta região, na ordem de toque (0 = o primeiro). */
function segmentoDaRegiao(idRegiao: string): number {
  const partes = idRegiao.split(SEPARADOR);
  return partes.length > 1 ? Number(partes[1]) : 0;
}

/**
 * Põe um bloco por SEGMENTO sobre a onda, cada short com a sua cor.
 *
 * D-604: antes era um bloco por short. Um short colado precisa mostrar os N
 * segmentos onde eles realmente estão — desenhar o envelope pintaria de cor
 * sólida o buraco que o operador tirou fora, e ele veria na régua um trecho
 * contínuo que o arquivo não tem.
 *
 * Os segmentos de um mesmo short dividem a COR (é ela que agrupa) e o rótulo diz
 * `1.2` — short 1, segundo segmento na ordem de toque. Com ordem livre esse
 * número pode crescer da direita para a esquerda, e isso é informação: é como se
 * vê, na régua, que o short abre com o que vem depois na live.
 */
function desenhar(plugin: Plugin, shorts: ShortSugerido[], emFoco: ShortSugerido | null): void {
  plugin.clearRegions();

  shorts.forEach((short, indice) => {
    const rejeitado = short.status === 'rejeitado';
    const pedacos = comOffsets(short);
    const colado = pedacos.length > 1;

    pedacos.forEach(({ segmento, ordem }, posicao) => {
      plugin.addRegion({
        id: idDaRegiao(short.id, posicao),
        start: segmento.inicio_seg,
        end: segmento.fim_seg,
        color: rejeitado ? COR_DO_REJEITADO : corDoShort(indice),
        // Só o trecho EM FOCO tem alça. Todas arrastáveis convidariam a mexer no
        // trecho errado — e aqui um pixel vale meio segundo.
        drag: false,
        // D-604: num short COLADO a alça sai. Arrastar a borda de um segmento é
        // editar a colagem, e o `region-updated` só sabe dizer "mexeu no início
        // ou no fim" — com N segmentos ele não tem como saber em QUAL. Quem tem
        // colagem a edita na lista do card, onde cada segmento tem a sua linha.
        resize: short.id === emFoco?.id && !rejeitado && !colado,
        content: colado ? `${indice + 1}.${ordem}` : `${indice + 1}`,
      });
    });
  });

  // A borda marca onde o bloco acaba; o contorno diz qual está em foco.
  for (const regiao of plugin.getRegions()) {
    const shortId = shortDaRegiao(regiao.id);
    const indice = shorts.findIndex((s) => s.id === shortId);
    const elemento = (regiao as unknown as { element?: HTMLElement }).element;
    if (!elemento || indice < 0) continue;
    const rejeitado = shorts[indice].status === 'rejeitado';
    elemento.style.borderLeft = `2px solid ${
      rejeitado ? BORDA_DO_REJEITADO : bordaDoShort(indice)
    }`;
    elemento.style.borderRight = elemento.style.borderLeft;
    elemento.style.outline = shortId === emFoco?.id ? '2px solid var(--wb-accent)' : 'none';
    // D-604: o segmento que NÃO é o primeiro da ordem ganha um tracejado no
    // topo. É a pista, na própria régua, de que aquele bloco é continuação de
    // outro — sem ela, dois blocos da mesma cor pareceriam dois shorts parecidos.
    elemento.style.borderTop =
      segmentoDaRegiao(regiao.id) > 0 ? `2px dashed ${bordaDoShort(indice)}` : 'none';
  }
}

/**
 * Rola a régua até `segundos` ficar no meio da janela visível.
 *
 * É a peça que substitui o "cabe tudo" da D-551. Com a onda maior que o painel,
 * abrir no minuto zero mostraria silêncio — e os blocos, que são virtualizados,
 * nem entrariam no DOM. Rolar até o trecho em foco resolve os dois de uma vez.
 */
function centrarEm(ws: WaveSurfer, segundos: number, zoom: number): void {
  const visivel = ws.getWidth();
  if (visivel <= 0) return;
  ws.setScroll(Math.max(0, segundos * PX_POR_SEGUNDO * zoom - visivel / 2));
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
      height: ALTURA_DA_ONDA,
      autoCenter: false,
      autoScroll: false,
      minPxPerSec: PX_POR_SEGUNDO * atual.current.zoom,
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
    let relogio: ReturnType<typeof setTimeout> | undefined;
    const esperarParaDesenhar = () => {
      if (cancelado) return;
      const duracao = ws.getDuration();
      const largura = ws.getWidth();
      if (duracao > 0 && largura > 0) {
        pronta.current = true;
        desenhar(plugin, atual.current.shorts, atual.current.emFoco);
        // A régua abre NO TRECHO, e não no minuto zero. A 50px/s um bruto de
        // sete minutos tem 21 mil pixels, e o bloco que interessa quase nunca
        // cai nos primeiros mil.
        centrarEm(ws, atual.current.emFoco?.inicio_seg ?? 0, atual.current.zoom);
        setProntidao((n) => n + 1);
        return;
      }
      relogio = setTimeout(esperarParaDesenhar, INTERVALO_DA_ESPERA);
    };
    esperarParaDesenhar();

    // D-569: clicar num bloco SELECIONA e move o ponteiro — as duas coisas.
    //
    // O `stopPropagation` daqui era o que impedia a segunda. O wavesurfer ouve
    // o clique no wrapper e emite `interaction`, que é quem chama o `onSeek`;
    // barrar a subida do evento fazia o bloco virar uma camada surda. Na
    // prática: dentro do trecho o ponteiro não ia, e a única forma de chegar
    // num instante dali era arrastar o cursor de fora para dentro.
    //
    // Deixar subir é melhor que calcular o instante aqui: o tempo sob o mouse
    // passaria a ter DUAS contas, a do wavesurfer e a minha, e elas divergiriam
    // no primeiro ajuste de escala — a mesma armadilha da D-558 e da D-568.
    plugin.on('region-clicked', (regiao) => {
      // D-604: o id da região carrega o segmento; quem entra em foco é o SHORT.
      atual.current.onSelecionar(shortDaRegiao(regiao.id));
    });

    // Só ao SOLTAR, e não a cada pixel: sessenta escritas por segundo entupiriam
    // a fila e ainda deixariam a última chegar fora de ordem.
    plugin.on('region-updated', (regiao) => {
      const alvo = atual.current.emFoco;
      if (!alvo || shortDaRegiao(regiao.id) !== alvo.id) return;
      // D-604: short colado não tem alça (ver `desenhar`), então chegar aqui com
      // colagem seria um arraste que a régua não deveria ter oferecido — aplicá-lo
      // mexeria no envelope e deixaria ele e os segmentos discordando.
      if ((alvo.segmentos?.length ?? 0) > 1) return;

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
      clearTimeout(relogio);
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
  //
  // D-569: amplia em volta do que está NA TELA, e não do trecho em foco.
  //
  // Recentrar no início do bloco parecia atencioso e era o contrário: o
  // operador arrastava até o meio da frase que queria examinar, clicava em
  // ampliar, e a régua o levava de volta ao começo do trecho — desfazendo
  // justamente a navegação que ele tinha acabado de fazer. Zoom é para olhar
  // mais de perto o que já se está olhando.
  //
  // A âncora é o CENTRO da janela: mede-se o instante que está no meio antes
  // de mudar a escala e repõe-se ele no meio depois. O trecho em foco continua
  // mandando na abertura da régua e na troca de candidato, que são os dois
  // momentos em que ele é, de fato, o assunto.
  const zoomAnterior = useRef(zoom);
  useEffect(() => {
    const ws = onda.current;
    if (!pronta.current || !ws) return;
    try {
      const visivel = ws.getWidth();
      const centroSeg =
        visivel > 0
          ? (ws.getScroll() + visivel / 2) / (PX_POR_SEGUNDO * zoomAnterior.current)
          : (atual.current.emFoco?.inicio_seg ?? 0);
      ws.zoom(PX_POR_SEGUNDO * zoom);
      centrarEm(ws, centroSeg, zoom);
    } catch {
      // `zoom` levanta se a onda ainda não tem duração. Não é motivo para
      // derrubar a tela: o próximo clique acerta.
    }
    zoomAnterior.current = zoom;
  }, [zoom]);

  // ── trocar de trecho leva a janela junto ───────────────────────────────
  const idEmFoco = emFoco?.id;
  useEffect(() => {
    const ws = onda.current;
    if (!pronta.current || !ws || !idEmFoco) return;
    const alvo = atual.current.shorts.find((s) => s.id === idEmFoco);
    if (alvo) centrarEm(ws, alvo.inicio_seg, atual.current.zoom);
  }, [idEmFoco, prontidao]);

  // ── os blocos, redesenhados quando os trechos mudam ────────────────────
  useEffect(() => {
    const plugin = regioes.current;
    if (!plugin || !pronta.current) return;

    desenhar(plugin, shorts, emFoco);
  }, [shorts, emFoco, prontidao]);

  // ── o cursor segue o player, e a janela segue o cursor ─────────────────
  const tempoAnterior = useRef(tempoAtual);
  useEffect(() => {
    const ws = onda.current;
    if (!pronta.current || !ws) return;
    const duracao = ws.getDuration() || 0;
    if (duracao <= 0) return;
    const instante = Math.min(tempoAtual, duracao);
    ws.setTime(instante);

    // Correr atrás do cursor SÓ quando ele sai da janela.
    //
    // Recentrar a cada quadro brigaria com o scroll que o operador acabou de
    // dar com a mão: ele arrasta para ver o fim da frase, o player avança
    // meio segundo, e a régua o joga de volta. Aqui a janela só se mexe
    // quando de fato perdeu o cursor de vista — ou quando ele pulou.
    const visivel = ws.getWidth();
    const scroll = ws.getScroll();
    const x = instante * PX_POR_SEGUNDO * atual.current.zoom;
    const pulou = Math.abs(instante - tempoAnterior.current) > 0.75;
    tempoAnterior.current = instante;
    if (pulou || x < scroll + MARGEM_DO_CURSOR || x > scroll + visivel - MARGEM_DO_CURSOR) {
      centrarEm(ws, instante, atual.current.zoom);
    }
  }, [tempoAtual]);

  // Passo MULTIPLICATIVO, como o editor: somar 1 em 12 níveis é imperceptível,
  // e somar 1 em 0,1 é um salto de dez vezes. Multiplicar dá o mesmo degrau
  // percebido em toda a faixa.
  const mudarZoom = useCallback((fator: number) => {
    setZoom((n) => Math.min(ZOOM_MAXIMO, Math.max(ZOOM_MINIMO, n * fator)));
  }, []);

  // Ctrl+roda sobre a onda — o mesmo gesto do editor de bruto. `passive: false`
  // porque precisamos do `preventDefault`: sem ele o navegador dá zoom na
  // página inteira em vez de na régua.
  useEffect(() => {
    const alvo = caixa.current;
    if (!alvo) return;
    const naRoda = (evento: WheelEvent) => {
      if (!evento.ctrlKey && !evento.metaKey) return;
      evento.preventDefault();
      mudarZoom(evento.deltaY < 0 ? FATOR_DA_RODA : 1 / FATOR_DA_RODA);
    };
    alvo.addEventListener('wheel', naRoda, { passive: false });
    return () => alvo.removeEventListener('wheel', naRoda);
  }, [mudarZoom]);

  if (picos.length === 0) return null;

  return (
    <div className="flex-none select-none">
      <div className="mb-1 flex items-center gap-2 font-code text-[10.5px] tabular-nums text-[var(--wb-text-mute)]">
        <span title="Duração do bruto inteiro">{mmss(duracaoSeg)}</span>
        <div className="flex-1" />
        {emFoco && (
          <span>
            {mmss(emFoco.inicio_seg)} → {mmss(emFoco.fim_seg)} ·{' '}
            {/* D-604: a duração LÍQUIDA, e não o span. Num short colado a
                subtração mentiria para cima, e é justamente na régua que o
                operador vê os buracos — dizer 60s ao lado de dois blocos
                separados seria a tela se contradizendo. */}
            {Math.round(duracaoLiquida(emFoco))}s
            {temColagem(emFoco) && (
              <span className="ml-1 text-[var(--wb-accent-strong)]">
                ({efetivos(emFoco).length} segmentos)
              </span>
            )}
          </span>
        )}
        <div className="flex-1" />
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Diminuir o zoom da régua"
          disabled={zoom <= ZOOM_MINIMO}
          onClick={() => mudarZoom(1 / FATOR_DO_BOTAO)}
        >
          <Minus />
        </Button>
        <span className="w-[38px] text-center" title="Ctrl + roda do mouse sobre a onda">
          {zoom.toFixed(1)}×
        </span>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Aumentar o zoom da régua"
          disabled={zoom >= ZOOM_MAXIMO}
          onClick={() => mudarZoom(FATOR_DO_BOTAO)}
        >
          <Plus />
        </Button>
      </div>

      {/* A barra de rolagem é do wavesurfer, dentro do shadow DOM dele — por
          isso a classe, e não um `overflow-x-auto` aqui: o seletor
          `::part(scroll)` do `index.css` é o único jeito de alcançá-la. A regra
          já existia lá desde o editor e nunca tinha sido usada por ninguém.

          Sem barra visível a onda larga vira um bug: o operador não tem como
          saber que há mais coisa fora da vista — e foi exatamente assim que
          "não quero ela toda contida no visível" virou "coloca aí barra de
          rolagem".

          O `--wb-border` local é o polegar dela. A regra do `index.css` pinta o
          polegar com esse token, e no tema claro ele (L 0,90) fica a quatro
          centésimos do fundo da caixa (L 0,945): a barra existia, ocupava os
          seus 10px, e era invisível. Repontar o token AQUI a torna legível sem
          mexer no arquivo de tokens — dentro desta caixa o único que lê
          `--wb-border` é a própria barra. */}
      <div
        ref={caixa}
        className="timeline-waveform-host w-full rounded-[8px] bg-[var(--wb-bg-inset)]"
        style={
          {
            height: ALTURA_DA_ONDA + ALTURA_DA_BARRA,
            '--wb-border': 'var(--wb-text-dim)',
          } as React.CSSProperties
        }
        role="presentation"
      />
    </div>
  );
}
