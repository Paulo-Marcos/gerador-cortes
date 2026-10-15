import { useLayoutEffect, useRef, useState, type Dispatch, type PointerEvent, type RefObject, type SetStateAction } from 'react';
import type { RascunhoDoPalco } from '@/features/channels/PalcoComponentesSection';
import { limitar } from '@/lib/limitar';
import { cn } from '@/lib/utils';
import { TAMANHO_MAXIMO, TAMANHO_MINIMO } from '@/features/channels/ControlesDoPalco';
import { AlcaDeTamanho } from './SlotPreviewPartes';

// D-927: o cabeçalho e a placa do estilo limpo se movem e se redimensionam com
// o mouse na prévia do modal, como as janelas do short. A caixa de cada um sai
// do próprio desenho (`data-componente` no renderer): o tamanho depende do
// texto e da imagem, e medir é o único jeito de a alça cair no canto certo.

export type ComponenteDoPalco = 'cabecalho' | 'placa';

/** O que o modal faz com o arraste: mover grava a posição manual; a alça, o tamanho. */
export interface EdicaoDosComponentes {
  escala: (componente: ComponenteDoPalco) => number;
  mover: (componente: ComponenteDoPalco, x: number, y: number) => void;
  escalar: (componente: ComponenteDoPalco, escala: number) => void;
  selecionado?: ComponenteDoPalco | null;
  onSelecionar?: (componente: ComponenteDoPalco) => void;
}

interface Caixa {
  x: number;
  y: number;
  w: number;
  h: number;
}

const NOMES: Record<ComponenteDoPalco, string> = { cabecalho: 'Cabeçalho', placa: 'Placa' };
const COMPONENTES: ComponenteDoPalco[] = ['cabecalho', 'placa'];

/** A caixa do componente no quadro de 1920x1080, medida no desenho escalado. */
function medir(frame: HTMLElement, componente: ComponenteDoPalco): Caixa | null {
  const el = frame.querySelector<HTMLElement>(`[data-componente="${componente}"]`);
  if (!el) return null;
  const quadro = frame.getBoundingClientRect();
  const r = el.getBoundingClientRect();
  if (quadro.width === 0 || r.width === 0) return null;
  const k = 1920 / quadro.width;
  return {
    x: Math.round((r.left - quadro.left) * k),
    y: Math.round((r.top - quadro.top) * k),
    w: Math.round(r.width * k),
    h: Math.round(r.height * k),
  };
}

const iguais = (a: Caixa | null, b: Caixa | null) =>
  a === b || (!!a && !!b && a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h);

export function ComponentesArrastaveis({
  frameRef,
  edicao,
}: {
  frameRef: RefObject<HTMLDivElement | null>;
  edicao: EdicaoDosComponentes;
}) {
  const [caixas, setCaixas] = useState<Record<ComponenteDoPalco, Caixa | null>>({ cabecalho: null, placa: null });
  // Mede depois de cada desenho (posição e tamanho mudam com o rascunho), sem
  // lista de dependências de propósito; só regrava quando a caixa mudou.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useLayoutEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const novas = { cabecalho: medir(frame, 'cabecalho'), placa: medir(frame, 'placa') };
    setCaixas((atuais) =>
      iguais(novas.cabecalho, atuais.cabecalho) && iguais(novas.placa, atuais.placa) ? atuais : novas,
    );
  });
  const arraste = useArrastarComponente(frameRef, edicao);
  return (
    <>
      {COMPONENTES.map((componente) => {
        const caixa = caixas[componente];
        if (!caixa) return null;
        const selecionado = edicao.selecionado === componente;
        return (
          <div
            key={componente}
            role="presentation"
            data-arrastavel={componente}
            onPointerDown={arraste.comecar(componente, caixa, 'mover')}
            onPointerMove={arraste.mover}
            onPointerUp={arraste.soltar}
            onPointerCancel={arraste.soltar}
            className={cn(
              'absolute cursor-grab border-2 border-dashed transition-colors',
              selecionado ? 'border-[var(--sel-line)]' : 'border-transparent hover:border-[var(--wb-border)]',
            )}
            style={{
              left: `${(caixa.x / 1920) * 100}%`,
              top: `${(caixa.y / 1080) * 100}%`,
              width: `${(caixa.w / 1920) * 100}%`,
              height: `${(caixa.h / 1080) * 100}%`,
            }}
          >
            {selecionado && (
              <>
                <span className="pointer-events-none absolute -top-5 left-0 rounded-sm bg-[var(--sel-bg)] px-1 font-code text-[11px] font-bold text-[var(--sel-ink)]">
                  {NOMES[componente]} {Math.round(edicao.escala(componente) * 100)}%
                </span>
                <AlcaDeTamanho
                  rotulo={NOMES[componente]}
                  onPointerDown={arraste.comecar(componente, caixa, 'redimensionar')}
                  onPointerMove={arraste.mover}
                  onPointerUp={arraste.soltar}
                />
              </>
            )}
          </div>
        );
      })}
    </>
  );
}

/** Prende o ponteiro no elemento; um ponteiro que já não existe não derruba o arraste. */
export function capturar(event: PointerEvent<HTMLElement>) {
  try {
    event.currentTarget.setPointerCapture(event.pointerId);
  } catch {
    // ponteiro já solto (ou sintético): segue sem captura
  }
}

/** Mover leva o canto de cima à esquerda junto com o mouse; a alça escala pela largura. */
function useArrastarComponente(frameRef: RefObject<HTMLDivElement | null>, edicao: EdicaoDosComponentes) {
  const atual = useRef<{
    componente: ComponenteDoPalco;
    modo: 'mover' | 'redimensionar';
    x0: number;
    y0: number;
    caixa: Caixa;
    escala: number;
  } | null>(null);
  return {
    comecar:
      (componente: ComponenteDoPalco, caixa: Caixa, modo: 'mover' | 'redimensionar') =>
      (event: PointerEvent<HTMLElement>) => {
        // A alça fica dentro da caixa: parar antes de tudo, senão o "mover" da caixa assume.
        event.stopPropagation();
        atual.current = { componente, modo, x0: event.clientX, y0: event.clientY, caixa, escala: edicao.escala(componente) };
        edicao.onSelecionar?.(componente);
        capturar(event);
      },
    mover: (event: PointerEvent<HTMLElement>) => {
      const a = atual.current;
      const quadro = frameRef.current?.getBoundingClientRect();
      if (!a || !quadro) return;
      const k = 1920 / quadro.width;
      const dx = (event.clientX - a.x0) * k;
      const dy = (event.clientY - a.y0) * k;
      if (a.modo === 'mover') {
        edicao.mover(
          a.componente,
          limitar(Math.round(a.caixa.x + dx), 0, 1920 - a.caixa.w),
          limitar(Math.round(a.caixa.y + dy), 0, 1080 - a.caixa.h),
        );
        return;
      }
      const fator = Math.max(1, a.caixa.w + dx) / a.caixa.w;
      const escala = limitar(a.escala * fator, TAMANHO_MINIMO / 100, TAMANHO_MAXIMO / 100);
      edicao.escalar(a.componente, Math.round(escala * 100) / 100);
    },
    soltar: (event: PointerEvent<HTMLElement>) => {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
      atual.current = null;
    },
  };
}

/** O arraste ligado ao rascunho do palco do modal (posição vira manual; a alça, o tamanho). */
export function edicaoDoRascunho(
  rascunho: RascunhoDoPalco,
  mudar: Dispatch<SetStateAction<RascunhoDoPalco | null>>,
  selecionado: ComponenteDoPalco | null,
  onSelecionar: (componente: ComponenteDoPalco) => void,
): EdicaoDosComponentes {
  const campo = (c: ComponenteDoPalco) =>
    c === 'cabecalho' ? ({ posicao: 'cabecalhoPosicao', escala: 'cabecalhoEscala' } as const) : ({ posicao: 'placaPosicao', escala: 'placaEscala' } as const);
  return {
    escala: (c) => rascunho[campo(c).escala],
    mover: (c, x, y) => mudar((r) => r && { ...r, [campo(c).posicao]: { automatica: false, x, y } }),
    escalar: (c, escala) => mudar((r) => r && { ...r, [campo(c).escala]: escala }),
    selecionado,
    onSelecionar,
  };
}
