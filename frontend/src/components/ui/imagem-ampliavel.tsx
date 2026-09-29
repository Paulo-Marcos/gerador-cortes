import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

// Miniatura que AMPLIA ao clicar (D-821): conferir uma capa de 76px de largura
// era adivinhar. Clique abre a imagem inteira, sem recorte, quase na tela
// toda; clique fora, X ou Esc fecham.
//
// Não usa o `Modal` do app de propósito: várias destas imagens já vivem dentro
// de um modal, e o `Modal` não empilha — o Esc fecharia os dois, e fechar o de
// cima destravaria a rolagem com o de baixo ainda aberto. Aqui a camada vai por
// portal para o fim do body (fica por cima de tudo), e o Esc é capturado antes
// de chegar aos modais de baixo.

interface Props {
  src: string;
  alt: string;
  /** Classes do botão que envolve a miniatura (tamanho, borda, proporção). */
  className?: string;
  /** Classes da miniatura em si. */
  imgClassName?: string;
  imgStyle?: React.CSSProperties;
}

export function ImagemAmpliavel({ src, alt, className, imgClassName, imgStyle }: Props) {
  const [aberta, setAberta] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setAberta(true)}
        title="Ampliar"
        aria-label={`Ampliar: ${alt}`}
        className={cn('block cursor-zoom-in', className)}
      >
        <img src={src} alt={alt} className={imgClassName} style={imgStyle} />
      </button>
      {aberta &&
        createPortal(
          <ImagemAmpliada src={src} alt={alt} onFechar={() => setAberta(false)} />,
          document.body,
        )}
    </>
  );
}

/** A camada da imagem grande. Exportada para teste; na tela, só pelo `ImagemAmpliavel`. */
export function ImagemAmpliada({
  src,
  alt,
  onFechar,
}: {
  src: string;
  alt: string;
  onFechar: () => void;
}) {
  useEffect(() => {
    // Captura na janela, antes dos ouvintes do `document` que os modais usam:
    // o Esc fecha só a imagem, e o modal de baixo continua aberto.
    const aoTeclar = (evento: KeyboardEvent) => {
      if (evento.key !== 'Escape') return;
      evento.stopPropagation();
      onFechar();
    };
    window.addEventListener('keydown', aoTeclar, true);
    return () => window.removeEventListener('keydown', aoTeclar, true);
  }, [onFechar]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={alt}
      onClick={onFechar}
      className="fixed inset-0 z-[100] grid cursor-zoom-out place-items-center bg-[rgb(10_12_18/.82)] p-6 animate-fade-in"
    >
      <img
        src={src}
        alt={alt}
        className="max-h-[92vh] max-w-[94vw] rounded-[8px] object-contain shadow-[0_24px_64px_rgb(0_0_0/.45)]"
      />
      <button
        type="button"
        onClick={onFechar}
        aria-label="Fechar"
        className="absolute right-4 top-4 grid h-9 w-9 place-items-center rounded-full bg-[rgb(255_255_255/.14)] text-white hover:bg-[rgb(255_255_255/.24)]"
      >
        <X size={18} aria-hidden />
      </button>
    </div>
  );
}
