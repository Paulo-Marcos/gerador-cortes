import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  aplicarCampo,
  arrastarSlot,
  CANVAS,
  paraCanvas,
  type Pega,
  type Retangulo,
} from './arrastarSlot';

// D-493: os blocos do palco, arrastáveis sobre a própria prévia.
//
// Os quatro modelos deixam de ser gaiola e viram ponto de partida: você pega a
// pessoa ou a tela e move onde quiser, com os números ao lado para fechar.
//
// O overlay fica SOBRE o canvas da prévia, não ao lado: mover um bloco olhando
// para outro lugar da tela é pedir que o operador faça a correspondência de
// cabeça — e essa correspondência é justamente o que a prévia veio eliminar.
//
// O PATCH sai no soltar, nunca durante. Durante o arraste manda o estado local,
// senão o bloco andaria atrás do cursor esperando o servidor.

const ROTULO: Record<string, string> = {
  pessoa: 'pessoa',
  tela: 'tela',
  quadro: 'quadro',
};

const CANTOS: { pega: Pega; classe: string; cursor: string }[] = [
  { pega: 'nw', classe: 'left-0 top-0 -translate-x-1/2 -translate-y-1/2', cursor: 'nwse-resize' },
  { pega: 'ne', classe: 'right-0 top-0 translate-x-1/2 -translate-y-1/2', cursor: 'nesw-resize' },
  { pega: 'sw', classe: 'bottom-0 left-0 -translate-x-1/2 translate-y-1/2', cursor: 'nesw-resize' },
  { pega: 'se', classe: 'bottom-0 right-0 translate-x-1/2 translate-y-1/2', cursor: 'nwse-resize' },
];

interface Props {
  /** Slots resolvidos (modelo + ajuste), como o backend os calculou. */
  slots: Record<string, Retangulo>;
  ativo: boolean;
  onGravar: (ajustes: Record<string, Retangulo>) => void;
}

export function EditorDePalco({ slots, ativo, onGravar }: Props) {
  const caixa = useRef<HTMLDivElement>(null);
  // O rascunho vive num REF e é espelhado no estado só para desenhar.
  //
  // Ler o estado no `pointerup` parecia natural e estava errado: React não
  // re-renderiza entre eventos do mesmo tique, então um arraste rápido chegava
  // ao soltar com o rascunho ainda nulo — e a mudança se perdia sem erro nenhum.
  // O ref não depende de render, e é dele que sai o que grava.
  const rascunhoRef = useRef<{ regiao: string; retangulo: Retangulo } | null>(null);
  const [rascunho, setRascunho] = useState<{ regiao: string; retangulo: Retangulo } | null>(null);
  const inicio = useRef<{ x: number; y: number; base: Retangulo; pega: Pega } | null>(null);

  const anotar = (valor: { regiao: string; retangulo: Retangulo } | null) => {
    rascunhoRef.current = valor;
    setRascunho(valor);
  };

  if (!ativo) return null;

  const visivel = (regiao: string): Retangulo =>
    rascunho?.regiao === regiao ? rascunho.retangulo : slots[regiao];

  const pegar =
    (regiao: string, pega: Pega) => (evento: ReactPointerEvent<HTMLElement>) => {
      evento.preventDefault();
      evento.stopPropagation();
      evento.currentTarget.setPointerCapture(evento.pointerId);
      inicio.current = { x: evento.clientX, y: evento.clientY, base: slots[regiao], pega };
      anotar({ regiao, retangulo: slots[regiao] });
    };

  const mover = (regiao: string) => (evento: ReactPointerEvent<HTMLElement>) => {
    const partida = inicio.current;
    const largura = caixa.current?.getBoundingClientRect().width ?? 0;
    if (!partida || !largura) return;

    anotar({
      regiao,
      retangulo: arrastarSlot(
        partida.base,
        partida.pega,
        paraCanvas(evento.clientX - partida.x, largura),
        paraCanvas(evento.clientY - partida.y, largura),
      ),
    });
  };

  const soltar = (evento: ReactPointerEvent<HTMLElement>) => {
    evento.currentTarget.releasePointerCapture?.(evento.pointerId);
    const final = rascunhoRef.current;
    // Só grava se o bloco realmente mudou: um clique seco não deve gastar uma
    // escrita, e um PATCH por clique acidental encheria o histórico de ruído.
    if (final && inicio.current && !mesmoRetangulo(final.retangulo, inicio.current.base)) {
      onGravar({ [final.regiao]: final.retangulo });
    }
    inicio.current = null;
    anotar(null);
  };

  return (
    <>
      <div ref={caixa} className="pointer-events-none absolute inset-0">
        {Object.keys(slots).map((regiao) => {
          const r = visivel(regiao);
          const estilo = {
            left: `${(r.x / CANVAS.largura) * 100}%`,
            top: `${(r.y / CANVAS.altura) * 100}%`,
            width: `${(r.w / CANVAS.largura) * 100}%`,
            height: `${(r.h / CANVAS.altura) * 100}%`,
          };
          return (
            <div
              key={regiao}
              role="button"
              tabIndex={0}
              aria-label={`Mover o bloco ${ROTULO[regiao] ?? regiao}`}
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
                {ROTULO[regiao] ?? regiao}
              </span>
              {CANTOS.map(({ pega, classe, cursor }) => (
                <span
                  key={pega}
                  role="button"
                  tabIndex={-1}
                  aria-label={`Redimensionar ${ROTULO[regiao] ?? regiao} pelo canto ${pega}`}
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
    </>
  );
}

function mesmoRetangulo(a: Retangulo, b: Retangulo): boolean {
  return a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;
}

/** Os mesmos slots em números — para fechar o que o arraste aproximou. */
export function CamposDoPalco({
  slots,
  ajustados,
  ocupado,
  onGravar,
  onDesfazer,
}: {
  slots: Record<string, Retangulo>;
  ajustados: string[];
  ocupado: boolean;
  onGravar: (ajustes: Record<string, Retangulo>) => void;
  onDesfazer: () => void;
}) {
  if (Object.keys(slots).length === 0) return null;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <span className="font-code text-[10px] uppercase tracking-[0.06em] text-[var(--wb-text-mute)]">
          blocos do palco
        </span>
        <div className="flex-1" />
        {ajustados.length > 0 && (
          <Button variant="ghost" size="sm" disabled={ocupado} onClick={onDesfazer}>
            <RotateCcw />
            voltar ao modelo
          </Button>
        )}
      </div>

      {Object.entries(slots).map(([regiao, retangulo]) => (
        <div key={regiao} className="flex flex-wrap items-center gap-1">
          <span
            className={cn(
              'w-[52px] flex-none font-code text-[10.5px]',
              ajustados.includes(regiao)
                ? 'font-bold text-[var(--wb-accent)]'
                : 'text-[var(--wb-text-mute)]',
            )}
            title={ajustados.includes(regiao) ? 'Ajustado por você' : 'Vem do modelo'}
          >
            {ROTULO[regiao] ?? regiao}
          </span>
          {(['x', 'y', 'w', 'h'] as const).map((lado) => (
            <CampoDeLado
              key={lado}
              lado={lado}
              valor={retangulo[lado]}
              ocupado={ocupado}
              onAplicar={(texto) => {
                const novo = aplicarCampo(retangulo, lado, texto);
                if (novo) onGravar({ [regiao]: novo });
              }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

function CampoDeLado({
  lado,
  valor,
  ocupado,
  onAplicar,
}: {
  lado: string;
  valor: number;
  ocupado: boolean;
  onAplicar: (texto: string) => void;
}) {
  const [texto, setTexto] = useState(String(valor));
  const [editando, setEditando] = useState(false);

  // Enquanto o operador digita, o valor de fora não atropela o rascunho — mas
  // fora da edição ele manda, para o campo acompanhar o arraste.
  const mostrado = editando ? texto : String(valor);

  return (
    <label className="inline-flex items-center gap-0.5">
      <span className="font-code text-[9.5px] uppercase text-[var(--wb-text-mute)]">{lado}</span>
      <input
        value={mostrado}
        disabled={ocupado}
        aria-label={`${lado} do bloco`}
        onFocus={() => {
          setTexto(String(valor));
          setEditando(true);
        }}
        onChange={(e) => setTexto(e.target.value)}
        onBlur={() => {
          setEditando(false);
          onAplicar(texto);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
          if (e.key === 'Escape') {
            setEditando(false);
            e.currentTarget.blur();
          }
        }}
        className="w-[46px] rounded-[5px] border border-[var(--wb-border)] bg-[var(--wb-bg-panel)] px-1 py-0.5 text-center font-code text-[10.5px] tabular-nums outline-none focus-visible:border-[var(--wb-accent)] disabled:opacity-50"
      />
    </label>
  );
}
