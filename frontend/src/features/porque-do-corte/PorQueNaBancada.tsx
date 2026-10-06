import { useMemo, useState } from 'react';
import { overlayAberto, useShortcuts } from '@/shared/atalhos/shortcuts';
import { shortcutFromRegistry } from '@/shared/atalhos/shortcutsRegistry';
import type { Corte } from '@/types/models';
import { SeloDaNota } from './SeloDaNota';
import { PorQueDoCorteModal } from './PorQueDoCorteModal';

/**
 * D-886: a nota e o porquê nas telas de UM corte (bruto, Pós, revisão). Mora
 * na barra de ações, que é a mesma nas três; o W abre e fecha de qualquer
 * ponto da tela, como os outros atalhos do editor.
 */
export function PorQueNaBancada({ corte }: { corte: Corte }) {
  const [aberto, setAberto] = useState(false);
  // D-887: com modal aberto o editor cala as teclas sem Ctrl; o W segue vivo
  // para fechar o próprio porquê, mas não o abre por cima de outro diálogo.
  const atalho = useMemo(
    () => [
      {
        ...shortcutFromRegistry('corte.porQue', () => {
          const outroDialogo = overlayAberto();
          setAberto((v) => (v ? false : !outroDialogo));
        }),
        valeComModal: true,
      },
    ],
    [],
  );
  useShortcuts(atalho);
  return (
    <>
      <SeloDaNota score={corte.score} onAbrir={() => setAberto(true)} />
      {aberto ? <PorQueDoCorteModal corte={corte} aoFechar={() => setAberto(false)} /> : null}
    </>
  );
}
