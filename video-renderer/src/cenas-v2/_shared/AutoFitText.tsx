import React, { useLayoutEffect, useRef } from "react";

interface AutoFitTextProps {
  children: React.ReactNode;
  maxHeight: number;
  /**
   * Largura útil para detectar overflow horizontal. Quando omitida,
   * o componente usa o clientWidth do container medido.
   */
  maxWidth?: number;
  /** Menor escala permitida. Default 0.4. */
  minScale?: number;
  /** Tamanho do passo de redução. Default 0.05. */
  step?: number;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * Envolve o conteúdo num container que mede scrollHeight/scrollWidth e aplica
 * iterativamente uma variável CSS (--font-scale) garantindo que o conteúdo
 * caiba dentro do card (vertical e horizontal).
 *
 * Filhos só escalam se usarem `calc(NPX * var(--font-scale, 1))` no fontSize.
 */
export const AutoFitText: React.FC<AutoFitTextProps> = ({
  children,
  maxHeight,
  maxWidth,
  minScale = 0.4,
  step = 0.05,
  className,
  style,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const container = containerRef.current;
    const content = contentRef.current;
    if (!container || !content) return;

    let scale = 1.0;
    container.style.setProperty("--font-scale", scale.toString());

    const widthLimit = maxWidth ?? container.clientWidth;

    let iterations = 0;
    const maxIterations = Math.ceil((1 - minScale) / step) + 2;
    while (
      (content.scrollHeight > maxHeight || content.scrollWidth > widthLimit) &&
      scale > minScale &&
      iterations < maxIterations
    ) {
      scale -= step;
      container.style.setProperty("--font-scale", scale.toString());
      iterations++;
    }
  }, [children, maxHeight, maxWidth, minScale, step]);

  return (
    <div
      ref={containerRef}
      className={className}
      style={{
        ...style,
        height: maxHeight,
        ...(maxWidth !== undefined ? { width: maxWidth } : {}),
        display: "flex",
        flexDirection: "column",
        justifyContent: style?.justifyContent || "flex-start",
      }}
    >
      <div
        ref={contentRef}
        style={{
          display: "flex",
          flexDirection: "column",
          width: "100%",
        }}
      >
        {children}
      </div>
    </div>
  );
};
