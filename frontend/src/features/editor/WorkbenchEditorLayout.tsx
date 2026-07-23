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
 * espaço vertical para timeline/ferramentas.
 *
 * AUDITORIA-v2 §4 (CP4): largura 100% do centro, `max-height:44vh`,
 * `min-height:0`. A `width` abaixo já embute esse teto de altura — convertida
 * pra largura via a proporção 16/9 — para o vídeo encolher CENTRALIZADO
 * (mantendo a proporção) em vez de estourar a altura e esconder a timeline;
 * `maxHeight`/`minHeight` ficam como reforço direto do texto da auditoria.
 * `minWidth` é o piso que evita o player ficar minúsculo em janelas bem
 * baixas, sem violar o mínimo de 420px do centro (nunca ultrapassa 100%).
 *
 * D-411: `shrink` no lugar de `flex-none`. Como flex-none, o player era
 * intocável e QUEM cedia era sempre a timeline — com Tempos e Sincronia
 * abertos numa janela baixa ela chegava a 0px e a onda sumia inteira. Sendo
 * o maior bloco da coluna, é ele quem tem folga para ceder; `maxHeight:44vh`
 * segue valendo como TETO, então em janela alta nada muda.
 */
export function PlayerCap({ children }: { children: ReactNode }) {
  return (
    <div
      className="shrink self-center"
      style={{
        width: 'min(100%, calc(44vh * 16 / 9))',
        aspectRatio: '16 / 9',
        maxWidth: '100%',
        maxHeight: '44vh',
        minHeight: 0,
        minWidth: 'min(100%, 420px)',
      }}
    >
      {children}
    </div>
  );
}
