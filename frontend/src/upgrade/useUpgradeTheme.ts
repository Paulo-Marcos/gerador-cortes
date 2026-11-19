// D-1133: o tema mudou para `@/lib/tema`. Este reexport mantém o caminho antigo
// para `UpgradeKitPage` (D-1132 mexe nela); sai quando ela passar a importar de lá.
export { useUpgradeTheme, temaEscuro, type UpgradeTheme } from '@/lib/tema';
