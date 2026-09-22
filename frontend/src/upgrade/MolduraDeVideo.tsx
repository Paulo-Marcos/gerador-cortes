import type { ReactNode } from 'react';

// ─────────────────────────────────────────────────────────────────
// D-746 · RODADA 3 · moldura de verdade.
//
// A rodada 2 entregou padding: 8px + border: 1px. Tecnicamente é
// moldura; visualmente é a arte da live encostada no card com um risco
// em volta — e a queixa ("ficou bem simples, não ficou legal") descrevia
// exatamente isso.
//
// Uma moldura que funciona tem três camadas, e nenhuma delas é a borda:
//
//   1. PASSE-PARTOUT (--mat): superfície mais escura que o card, que é o
//      que separa "a live" de "o card que fala dela". É o papel da
//      moldura de galeria — e era a camada que faltava.
//   2. BISEL: filete escuro externo + highlight de 1px no topo interno.
//      Dois pixels que fazem a imagem parecer montada, não colada.
//   3. VINHETA inferior: a arte de live vem cheia de texto e cor alta;
//      sem ela os selos sobrepostos perdem contraste em metade das
//      miniaturas.
//
// A sombra projetada é curta de propósito (10px, -12px de espalhamento):
// moldura não flutua, ela assenta.
// ─────────────────────────────────────────────────────────────────

export function MolduraDeVideo({
  proporcao = '16/9',
  children,
  onClick,
  rotulo,
  mat = 8,
}: {
  proporcao?: string;
  children?: ReactNode;
  onClick?: () => void;
  /** aria-label — obrigatório quando a moldura é clicável. */
  rotulo?: string;
  /** Largura do passe-partout. 8px no card, 4px na linha de corte. */
  mat?: number;
}) {
  const Quadro = onClick ? 'button' : 'span';
  return (
    <span
      style={{
        display: 'block',
        padding: mat + 'px',
        background: 'var(--mat)',
        borderRadius: 'var(--r3)',
      }}
    >
      <Quadro
        {...(onClick
          ? { type: 'button' as const, onClick, 'aria-label': rotulo }
          : { 'aria-hidden': true })}
        style={{
          position: 'relative',
          display: 'block',
          width: '100%',
          aspectRatio: proporcao,
          padding: 0,
          border: 0,
          borderRadius: 'var(--r2)',
          overflow: 'hidden',
          background: 'var(--inset)',
          boxShadow:
            '0 0 0 1px var(--moldura), 0 1px 0 rgb(255 255 255/.4), 0 10px 20px -12px rgb(8 12 22/.7)',
          cursor: onClick ? 'pointer' : 'default',
        }}
      >
        {children}
        {/* Bisel + vinheta. Ficam por cima de tudo e não interceptam clique. */}
        <span
          aria-hidden
          style={{
            position: 'absolute',
            inset: 0,
            borderRadius: 'var(--r2)',
            boxShadow:
              'inset 0 1px 0 rgb(255 255 255/.24), inset 0 0 0 1px rgb(8 12 22/.28), inset 0 -30px 40px -26px rgb(8 12 22/.75)',
            pointerEvents: 'none',
          }}
        />
      </Quadro>
    </span>
  );
}
