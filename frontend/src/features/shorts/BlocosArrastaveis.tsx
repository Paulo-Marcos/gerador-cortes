import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { cn } from '@/lib/utils';
import { arrastarSlot, paraCanvas, type Limites, type Pega, type Retangulo } from './arrastarSlot';

// D-499: retângulos arrastáveis sobre um quadro, sejam eles slots ou recortes.
//
// Nasceu de dentro do `EditorDePalco` quando o recorte por short (D-499) pediu
// exatamente o mesmo gesto do outro lado da transformação: o SLOT diz onde o
// bloco cai no short, o RECORTE diz o que ele mostra da live. Duas telas, dois
// quadros, uma mão só.
//
// Copiar o overlay teria sido mais rápido e teria criado a segunda
// implementação de arraste — a mesma armadilha que este épico evitou na
// geometria e que já custou dois bugs de divergência silenciosa (D-490, D-493).
// Aqui a diferença entre os dois usos é declarada em props: as bordas do quadro
// e o vocabulário dos rótulos.
//
// O PATCH sai no soltar, nunca durante: durante o arraste manda o estado local,
// senão o bloco andaria atrás do cursor esperando o servidor.

const CANTOS: { pega: Pega; classe: string; cursor: string }[] = [
  { pega: 'nw', classe: 'left-0 top-0 -translate-x-1/2 -translate-y-1/2', cursor: 'nwse-resize' },
  { pega: 'ne', classe: 'right-0 top-0 translate-x-1/2 -translate-y-1/2', cursor: 'nesw-resize' },
  { pega: 'sw', classe: 'bottom-0 left-0 -translate-x-1/2 translate-y-1/2', cursor: 'nesw-resize' },
  { pega: 'se', classe: 'bottom-0 right-0 translate-x-1/2 translate-y-1/2', cursor: 'nwse-resize' },
];

interface Props {
  /** Os retângulos a desenhar, em coordenadas de `limites`. */
  blocos: Record<string, Retangulo>;
  /** As bordas do quadro: o canvas do short, ou a resolução do bruto. */
  limites: Limites;
  /** Como cada região se chama na tela. */
  rotulo: (regiao: string) => string;
  /** O que o leitor de tela ouve: "Mover o bloco X" / "Mover o recorte de X". */
  substantivo: string;
  /** Cada movimento do ponteiro, para quem quiser redesenhar ao vivo. */
  onArrastando?: (regiao: string, retangulo: Retangulo) => void;
  /** Soltou tendo MUDADO algo. Clique seco não chega aqui. */
  onSoltar: (regiao: string, retangulo: Retangulo) => void;
  /** Soltou, tendo mudado ou não. */
  onFim?: () => void;
}

export function BlocosArrastaveis({
  blocos,
  limites,
  rotulo,
  substantivo,
  onArrastando,
  onSoltar,
  onFim,
}: Props) {
  const caixa = useRef<HTMLDivElement>(null);
  // O rascunho vive num REF e é espelhado no estado só para desenhar.
  //
  // Ler o estado no `pointerup` parecia natural e estava errado: React não
  // re-renderiza entre eventos do mesmo tique, então um arraste rápido chegava
  // ao soltar com o rascunho ainda nulo — e a mudança se perdia sem erro nenhum.
  const rascunhoRef = useRef<{ regiao: string; retangulo: Retangulo } | null>(null);
  const [rascunho, setRascunho] = useState<{ regiao: string; retangulo: Retangulo } | null>(null);
  const inicio = useRef<{ x: number; y: number; base: Retangulo; pega: Pega } | null>(null);

  const anotar = (valor: { regiao: string; retangulo: Retangulo } | null) => {
    rascunhoRef.current = valor;
    setRascunho(valor);
  };

  const visivel = (regiao: string): Retangulo =>
    rascunho?.regiao === regiao ? rascunho.retangulo : blocos[regiao];

  const pegar = (regiao: string, pega: Pega) => (evento: ReactPointerEvent<HTMLElement>) => {
    evento.preventDefault();
    evento.stopPropagation();
    evento.currentTarget.setPointerCapture(evento.pointerId);
    inicio.current = { x: evento.clientX, y: evento.clientY, base: blocos[regiao], pega };
    anotar({ regiao, retangulo: blocos[regiao] });
  };

  const mover = (regiao: string) => (evento: ReactPointerEvent<HTMLElement>) => {
    const partida = inicio.current;
    const largura = caixa.current?.getBoundingClientRect().width ?? 0;
    if (!partida || !largura) return;

    const retangulo = arrastarSlot(
      partida.base,
      partida.pega,
      paraCanvas(evento.clientX - partida.x, largura, limites.largura),
      paraCanvas(evento.clientY - partida.y, largura, limites.largura),
      limites,
    );
    anotar({ regiao, retangulo });
    onArrastando?.(regiao, retangulo);
  };

  const soltar = (evento: ReactPointerEvent<HTMLElement>) => {
    evento.currentTarget.releasePointerCapture?.(evento.pointerId);
    const final = rascunhoRef.current;
    // Só grava se o retângulo realmente mudou: um clique seco não deve gastar
    // uma escrita, e um PATCH por clique acidental encheria o histórico de ruído.
    if (final && inicio.current && !mesmoRetangulo(final.retangulo, inicio.current.base)) {
      onSoltar(final.regiao, final.retangulo);
    }
    inicio.current = null;
    anotar(null);
    onFim?.();
  };

  return (
    <div ref={caixa} className="pointer-events-none absolute inset-0">
      {Object.keys(blocos).map((regiao) => {
        const r = visivel(regiao);
        if (!r) return null;
        const estilo = {
          left: `${(r.x / limites.largura) * 100}%`,
          top: `${(r.y / limites.altura) * 100}%`,
          width: `${(r.w / limites.largura) * 100}%`,
          height: `${(r.h / limites.altura) * 100}%`,
        };
        const nome = rotulo(regiao);
        return (
          <div
            key={regiao}
            role="button"
            tabIndex={0}
            aria-label={`Mover ${substantivo} ${nome}`}
            onPointerDown={pegar(regiao, 'mover')}
            onPointerMove={mover(regiao)}
            onPointerUp={soltar}
            onPointerCancel={soltar}
            style={estilo}
            className={cn(
              'pointer-events-auto absolute cursor-move touch-none border-2 border-dashed transition-colors',
              rascunho?.regiao === regiao
                ? 'border-[var(--wb-accent)] bg-[var(--wb-accent)]/15'
                : 'border-white/70 hover:border-[var(--wb-accent)] hover:bg-[var(--wb-accent)]/10',
            )}
          >
            <span className="absolute left-1 top-1 rounded-[4px] bg-black/70 px-1 font-code text-[9px] font-bold uppercase tracking-wide text-white">
              {nome}
            </span>
            {CANTOS.map(({ pega, classe, cursor }) => (
              <span
                key={pega}
                role="button"
                tabIndex={-1}
                aria-label={`Redimensionar ${nome} pelo canto ${pega}`}
                onPointerDown={pegar(regiao, pega)}
                onPointerMove={mover(regiao)}
                onPointerUp={soltar}
                onPointerCancel={soltar}
                style={{ cursor }}
                className={cn(
                  'absolute h-3 w-3 touch-none rounded-[2px] border border-black/40 bg-white',
                  classe,
                )}
              />
            ))}
          </div>
        );
      })}
    </div>
  );
}

function mesmoRetangulo(a: Retangulo, b: Retangulo): boolean {
  return a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;
}
