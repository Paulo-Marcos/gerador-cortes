import { useMemo, useState } from 'react';
import { useShortcuts } from '@/shared/atalhos/shortcuts';
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
  const atalho = useMemo(() => [shortcutFromRegistry('corte.porQue', () => setAberto((v) => !v))], []);
  useShortcuts(atalho);
  return (
    <>
      <SeloDaNota score={corte.score} onAbrir={() => setAberto(true)} />
      {aberto ? <PorQueDoCorteModal corte={corte} aoFechar={() => setAberto(false)} /> : null}
    </>
  );
}
