// D-1122 (E-069 H-11b): a pele comum do que flutua — menu, popover e tooltip.
//
// Fundo `bg-pop` (94% opaco, o "sólido" do que flutua) + fio `fio-2` + brilho de 1 px
// no topo + sombra difusa `pop-luz`. Sem `backdrop-filter`: o desfoque é da casca
// (DIRECAO §3.6) e um menu abre em qualquer tela, inclusive sobre o vídeo tocando.
// Só o que flutua tem sombra (§3.5).

export const PELE_FLUTUANTE =
  'border border-fio-2 bg-pop text-fg shadow-pop-luz';

/** Entrada e saída de 150 ms em `opacity` e `transform`; `motion-reduce` troca na hora. */
export const MOVIMENTO_FLUTUANTE =
  'data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 ' +
  'data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 ' +
  'data-[state=open]:duration-150 data-[state=closed]:duration-150 ' +
  'data-[side=bottom]:slide-in-from-top-1 data-[side=top]:slide-in-from-bottom-1 ' +
  'data-[side=left]:slide-in-from-right-1 data-[side=right]:slide-in-from-left-1 ' +
  'motion-reduce:animate-none';
