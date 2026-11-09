import type { ShortcutSpec } from './shortcutsRegistry';

// Fire, leitura e modo foco do Bruto (D-1085), fora de `shortcutsRegistry` para
// o registro caber no teto de tamanho de arquivo (D-771). Entram lá por spread,
// na mesma posição, e o detector de conflitos os vê como antes.

export const ATALHOS_DAS_MARCAS_DO_CORTE: readonly ShortcutSpec[] = [
  {
    id: 'bruto.fire',
    screen: 'bruto',
    key: 'f',
    description: 'Alternar Fire',
    group: 'edicao',
  },
  {
    id: 'bruto.leitura',
    screen: 'bruto',
    key: 'l',
    description: 'Alternar leitura',
    group: 'edicao',
  },
  {
    id: 'bruto.modoFoco',
    screen: 'bruto',
    key: 'f',
    mod: 'shift',
    // D-1085: esconde a casca e põe o navegador em tela cheia; o mesmo atalho (ou Esc) sai.
    description: 'Modo foco (player e onda em tela cheia)',
    group: 'edicao',
  },
];
