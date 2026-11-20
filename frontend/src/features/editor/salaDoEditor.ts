// D-1150 (E-069 H-17) · as peças de classe que o editor repete (DIRECAO §3.2, §3.4).
//
// O editor tem dezenas de controles pequenos dentro de painéis (transporte, ferramentas da
// linha do tempo, abas) que não são o `Button` da Sala: são ferramenta de painel, fantasma.
// Para eles a forma vem daqui, uma vez: pílula, cor por token, e o FOCO DE VERDADE —
// todo controle que leva `data-sala` sai da regra global de foco da `.ap` e precisa
// trazer o próprio anel (`upgrade/upgrade.css`, D-1124).
// Sem `backdrop-filter`: o editor toca vídeo (§3.6).

/** O anel de foco da Sala: 2 px `cc-foco`, afastado 2 px, só no teclado. */
export const FOCO =
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foco';

/** Ferramenta de painel só de ícone, 28 px: fantasma que clareia no hover. */
export const FERRAMENTA_ICONE =
  `inline-grid size-7 flex-none place-items-center rounded-pilula text-fg-2 transition-colors duration-150 hover:bg-vidro-2 hover:text-fg disabled:text-fg-off disabled:hover:bg-transparent motion-reduce:transition-none ${FOCO}`;

/** Ferramenta de painel com texto, 28 px: pílula de vidro ("Início aqui", "Fim aqui"). */
export const FERRAMENTA_TEXTO =
  `inline-flex h-7 flex-none items-center gap-1.5 rounded-pilula border border-fio-2 bg-vidro-2 px-3 text-pequeno text-fg shadow-topo transition-colors duration-150 hover:bg-vidro-3 disabled:border-fio disabled:bg-transparent disabled:text-fg-off disabled:shadow-none motion-reduce:transition-none ${FOCO}`;

/** Ligado (§3.4): fundo íris suave, fio íris, texto íris. Para usar com `aria-pressed`. */
export const LIGADO = 'aria-pressed:border-iris-fio aria-pressed:bg-iris-suave aria-pressed:text-iris-2';

/** Item de menu (ladrilho de 10 px), com a tecla à direita. */
export const ITEM_DE_MENU =
  `flex w-full items-center gap-2 rounded-[10px] px-2 py-1.5 text-left text-pequeno text-fg transition-colors duration-150 hover:bg-vidro-2 disabled:text-fg-off motion-reduce:transition-none ${FOCO}`;

/** Sobretítulo de grupo dentro de painel ou menu: em frase, sem caixa alta (§8.2). */
export const ROTULO_DE_GRUPO = 'px-2 pb-1 pt-0.5 text-micro text-fg-3';
