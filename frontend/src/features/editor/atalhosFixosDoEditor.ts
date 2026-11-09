import { alternarModoFoco } from '@/upgrade/modoFoco';

// D-1085: atalhos do editor que não dependem do estado dele (o foco é da
// casca). Ficam fora de `useEditorPage`, que está no teto de tamanho.
export const ACOES_FIXAS: Record<string, () => void> = { 'bruto.modoFoco': alternarModoFoco };

/** Os ids deles, para entrarem na lista de atalhos ligados do editor. */
export const ATALHOS_FIXOS = Object.keys(ACOES_FIXAS) as 'bruto.modoFoco'[];
