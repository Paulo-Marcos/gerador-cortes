import type { ReactNode } from 'react';
import { useRegisterPagePanels } from '@/components/workbench/WorkbenchPanelsProvider';
import type { WorkbenchPanelId } from '@/components/workbench/useWorkbenchPanels';

// ─────────────────────────────────────────────────────────────
// WorkbenchEditorLayout — casca das telas de edição no shell novo
// (Etapa 3): painel esquerdo retrátil + centro em coluna + painel
// direito retrátil. Registra os painéis da página no auto-colapso
// do shell. O centro empilha player (16:9 com cap), linhas de
// transporte/contexto e a timeline em flex:1.
// ─────────────────────────────────────────────────────────────

interface Props {
  /** Painéis retráteis desta tela (participam do auto-colapso). */
  panelIds: readonly WorkbenchPanelId[];
  leftPanel?: ReactNode;
  rightPanel?: ReactNode;
  children: ReactNode;
}

export function WorkbenchEditorLayout({ panelIds, leftPanel, rightPanel, children }: Props) {
  useRegisterPagePanels(panelIds);
  return (
    <div className="flex h-full min-h-0">
      {leftPanel}
      <div className="flex min-w-0 flex-1 flex-col gap-2 overflow-hidden p-3">{children}</div>
      {rightPanel}
    </div>
  );
}

/**
 * Container do player: sempre 16:9, altura limitada para sobrar
 * espaço vertical para timeline/ferramentas (README do hand-off:
 * `width:min(100%, calc((100vh - 330px)*16/9))`).
 */
export function PlayerCap({ children }: { children: ReactNode }) {
  // Reserve de 500px (validação 3): o hand-off cita 330px, mas a coluna
  // real tem sincronia + transporte + contexto + título (~170px a mais);
  // sem esse ajuste o player engolia a altura e a TIMELINE sumia.
  return (
    <div
      className="flex-none self-center"
      style={{
        width: 'min(100%, calc((100vh - 500px) * 1.7778))',
        aspectRatio: '16 / 9',
        maxWidth: '100%',
        minWidth: 'min(100%, 420px)',
      }}
    >
      {children}
    </div>
  );
}
