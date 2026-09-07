import { useEffect, useRef } from 'react';

// D-541: a onda de áudio do bruto, atrás da régua da curadoria.
//
// A régua era uma barra lisa. Para achar onde uma frase começa, o operador
// arrastava a alça, ouvia, corrigia, ouvia de novo — porque a barra não dizia
// nada sobre o CONTEÚDO. A onda diz: silêncio é vale, fala é bloco, e a pausa
// entre duas frases tem forma reconhecível a três metros da tela.
//
// ## Por que canvas, e não o wavesurfer do editor
//
// O editor usa wavesurfer, com zoom, regiões, arraste e mil coisas. Aqui a onda
// é FUNDO: não recebe clique, não tem zoom próprio, não guarda estado. Trazer a
// biblioteca junto significaria trazer o modelo de interação dela para uma
// régua que já tem o seu — e as duas brigariam pelo mesmo ponteiro.
//
// Um canvas desenha o mesmo envelope em trinta linhas e some do caminho.

interface Props {
  /** Picos em [-1, 1], já normalizados pelo backend. */
  picos: readonly number[];
  /** Enquanto carrega ou quando não há bruto legível: a régua fica lisa. */
  className?: string;
}

export function OndaDoBruto({ picos, className }: Props) {
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const el = canvas.current;
    if (!el || picos.length === 0) return;

    const desenhar = () => {
      const pai = el.parentElement;
      if (!pai) return;
      const { width, height } = pai.getBoundingClientRect();
      if (width < 1 || height < 1) return;

      // O canvas desenha em pixels de dispositivo e é ESTICADO por CSS para o
      // tamanho lógico. Sem isso, numa tela 2x a onda sai borrada — e uma onda
      // borrada esconde exatamente a transição que se está procurando.
      const escala = window.devicePixelRatio || 1;
      el.width = Math.round(width * escala);
      el.height = Math.round(height * escala);

      const ctx = el.getContext('2d');
      if (!ctx) return;
      ctx.clearRect(0, 0, el.width, el.height);
      ctx.fillStyle = getComputedStyle(el).color;

      const meio = el.height / 2;
      const colunas = Math.floor(width);
      const porColuna = picos.length / colunas;

      for (let coluna = 0; coluna < colunas; coluna += 1) {
        // Cada coluna resume uma fatia dos picos pelo MÁXIMO, e não pela média:
        // a média achata um estalo de meio quadro, que é justamente o que
        // marca o começo de uma palavra.
        const de = Math.floor(coluna * porColuna);
        const ate = Math.max(de + 1, Math.floor((coluna + 1) * porColuna));
        let pico = 0;
        for (let i = de; i < ate && i < picos.length; i += 1) {
          const v = Math.abs(picos[i]);
          if (v > pico) pico = v;
        }

        // Meio pixel de piso: uma linha de base contínua faz a régua parecer
        // um instrumento, e o silêncio absoluto continua legível como vale.
        const altura = Math.max(escala * 0.5, pico * meio * 0.94);
        ctx.fillRect(coluna * escala, meio - altura, Math.max(1, escala), altura * 2);
      }
    };

    desenhar();

    // A régua acompanha a largura do painel, que muda com a janela e com o
    // painel do palco abrindo ao lado. Redesenhar no resize é o que impede a
    // onda de descolar do eixo de tempo que ela deveria descrever.
    const observador = new ResizeObserver(desenhar);
    if (el.parentElement) observador.observe(el.parentElement);
    return () => observador.disconnect();
  }, [picos]);

  if (picos.length === 0) return null;

  return (
    <canvas
      ref={canvas}
      aria-hidden
      className={className ?? 'pointer-events-none absolute inset-0 h-full w-full opacity-70'}
    />
  );
}
