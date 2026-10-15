import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';

// D-927: a prévia do modal ocupa o maior 16:9 que cabe no espaço que sobra —
// largura e altura —, então fica sempre inteira na tela, sem barra de rolagem.
// `reserva` é a altura de quem vem junto da imagem (a barra do recorte).

/** O maior 16:9 dentro de `largura` x `altura` (descontada a reserva). */
export function tamanhoQueCabe(largura: number, altura: number, reserva = 0): { w: number; h: number } {
  const livre = Math.max(0, altura - reserva);
  const w = Math.max(0, Math.min(largura, (livre * 16) / 9));
  return { w: Math.floor(w), h: Math.floor((w * 9) / 16) };
}

export function PreviaQueCabe({ reserva = 0, children }: { reserva?: number; children: ReactNode }) {
  const caixa = useRef<HTMLDivElement>(null);
  const [largura, setLargura] = useState<number | null>(null);
  useLayoutEffect(() => {
    const el = caixa.current;
    if (!el) return;
    const medir = () => {
      const r = el.getBoundingClientRect();
      setLargura(tamanhoQueCabe(r.width, r.height, reserva).w);
    };
    medir();
    const observador = new ResizeObserver(medir);
    observador.observe(el);
    return () => observador.disconnect();
  }, [reserva]);
  return (
    <div ref={caixa} className="flex min-h-0 flex-1 items-start justify-center overflow-hidden">
      <div style={{ width: largura ?? '100%' }}>{children}</div>
    </div>
  );
}
