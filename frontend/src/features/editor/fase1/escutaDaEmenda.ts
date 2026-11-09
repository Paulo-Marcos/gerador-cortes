// D-1091: "Ouvir a emenda" toca alguns segundos antes do trecho que sai, pula o
// trecho e toca alguns segundos depois: é como o corte vai soar no bruto.
//
// Função solta, e não estado de componente: ao recuar para antes do trecho, o
// cursor sai dele e o aviso que tem o botão desmonta. A escuta tem de seguir
// sozinha, vigiando o próprio <video>, até terminar ou o operador intervir.
//
// Vigia por dois caminhos: o quadro (rAF), que acerta o salto no tempo do
// quadro, e o `timeupdate`, que segue disparando quando o navegador segura o
// rAF (aba ou painel em segundo plano), e a escuta não passa da emenda.

export const MARGEM_DA_EMENDA_SEG = 3;
/** Folga para o salto do quadro: além dela, foi o operador quem mexeu no tempo. */
const FOLGA_SEG = 0.5;

/** O mínimo do <video> que a escuta usa (o elemento real serve). */
export interface VideoDaEmenda {
  currentTime: number;
  readonly paused: boolean;
  readonly isConnected: boolean;
  play(): Promise<void> | void;
  pause(): void;
  addEventListener(tipo: 'timeupdate', ouvinte: () => void): void;
  removeEventListener(tipo: 'timeupdate', ouvinte: () => void): void;
}

interface Relogio {
  agendar: (passo: () => void) => number;
  cancelar: (id: number) => void;
}

const RELOGIO_DO_NAVEGADOR: Relogio = {
  agendar: (passo) => requestAnimationFrame(passo),
  cancelar: (id) => cancelAnimationFrame(id),
};

// Uma escuta por vídeo: pedir outra emenda encerra a anterior.
const escutas = new WeakMap<VideoDaEmenda, () => void>();

/** Toca a emenda e devolve como pará-la. */
export function ouvirEmenda(
  video: VideoDaEmenda,
  trecho: { inicio: number; emenda: number },
  relogio: Relogio = RELOGIO_DO_NAVEGADOR,
): () => void {
  escutas.get(video)?.();
  const de = Math.max(0, trecho.inicio - MARGEM_DA_EMENDA_SEG);
  const ate = trecho.emenda + MARGEM_DA_EMENDA_SEG;
  let pulou = false;
  let parada = false;
  let quadro = 0;

  const parar = () => {
    if (parada) return;
    parada = true;
    relogio.cancelar(quadro);
    video.removeEventListener('timeupdate', conferir);
    if (escutas.get(video) === parar) escutas.delete(video);
  };
  const mexeuNoTempo = (t: number) =>
    pulou ? t < trecho.emenda - FOLGA_SEG || t > ate + FOLGA_SEG : t < de - FOLGA_SEG;

  function conferir() {
    if (parada) return;
    const t = video.currentTime;
    if (!video.isConnected || video.paused || mexeuNoTempo(t)) return parar();
    if (!pulou && t >= trecho.inicio) {
      video.currentTime = trecho.emenda;
      pulou = true;
    } else if (pulou && t >= ate) {
      video.pause();
      parar();
    }
  }
  const vigiar = () => {
    conferir();
    if (!parada) quadro = relogio.agendar(vigiar);
  };

  escutas.set(video, parar);
  video.addEventListener('timeupdate', conferir);
  video.currentTime = de;
  Promise.resolve(video.play()).catch(parar);
  quadro = relogio.agendar(vigiar);
  return parar;
}
