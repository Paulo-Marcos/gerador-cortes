// O canal em tempo real do progresso de um projeto (D-724).
//
// Aqui mora só o TRANSPORTE: abrir o WebSocket, ler as mensagens, religar
// quando a linha cai. O que a tela faz com cada mensagem — guardar o último
// estado, reler as queries — é de quem assina, e fica no hook da feature.
import { wsUrl } from '@/lib/apiBase';
import type { ProgressoUpdate } from '@/types/models';

export function progressoWsUrl(projetoId: string): string {
  return wsUrl(`/projetos/${projetoId}/ws`);
}

// D-661: o socket de progresso não religava. Se o backend reiniciasse no meio
// de um download (atualizar a PROD, por exemplo), a tela congelava no último
// percentual até um F5. Mas "caiu" precisa ser distinguido de "acabou": o
// backend FECHA de propósito depois de `pronto`/`erro`, e responde
// `sem_progresso` e fecha na hora quando não há nada rodando — o caso comum.
// Religar nesses casos seria bater na porta a cada 30 s para sempre.
const STATUS_QUE_ENCERRAM: ReadonlySet<ProgressoUpdate['status']> = new Set([
  'pronto',
  'erro',
  'sem_progresso',
]);

export const ESPERA_MAXIMA_PARA_RELIGAR_MS = 30_000;

/** Espera antes da tentativa `n` (0, 1, 2…): 1 s, 2 s, 4 s… até 30 s. */
export function esperaParaReligar(tentativa: number): number {
  return Math.min(ESPERA_MAXIMA_PARA_RELIGAR_MS, 1000 * 2 ** tentativa);
}

/** Religa só se a conexão fechou SEM o servidor ter dito que acabou. */
export function deveReligar(ultimoStatus: ProgressoUpdate['status'] | null): boolean {
  return ultimoStatus === null || !STATUS_QUE_ENCERRAM.has(ultimoStatus);
}

interface AssinaturaDoProgresso {
  /** Cada mensagem válida do servidor. */
  aoReceber: (update: ProgressoUpdate) => void;
  /** A linha voltou depois de cair: o que mudou nesse meio-tempo não chegou por aqui. */
  aoReligar: () => void;
}

/**
 * Assina o progresso de `projetoId` (`/api/projetos/{id}/ws`) e devolve a
 * função que cancela a assinatura.
 */
export function assinarProgresso(
  projetoId: string,
  { aoReceber, aoReligar }: AssinaturaDoProgresso,
): () => void {
  // D-227: guarda contra troca rápida de projeto. Ao cancelar, um socket ainda
  // CONNECTING pode disparar onmessage depois. `ativo` garante uma única
  // conexão efetiva e ignora eventos da conexão já descartada.
  let ativo = true;
  let ws: WebSocket | null = null;
  let tentativa = 0;
  let religar: ReturnType<typeof setTimeout> | null = null;

  const conectar = () => {
    const socket = new WebSocket(progressoWsUrl(projetoId));
    ws = socket;
    // Status recebido NESTA conexão: decide se o fechamento foi fim ou queda.
    let statusDaConexao: ProgressoUpdate['status'] | null = null;

    socket.onopen = () => {
      if (!ativo || tentativa === 0) return;
      tentativa = 0;
      aoReligar();
    };

    socket.onmessage = (event) => {
      if (!ativo) return;
      let msg: ProgressoUpdate;
      try {
        msg = JSON.parse(event.data) as ProgressoUpdate;
      } catch {
        return; // mensagem mal formada — ignora
      }
      statusDaConexao = msg.status;
      aoReceber(msg);
    };

    socket.onclose = () => {
      if (!ativo || ws !== socket || !deveReligar(statusDaConexao)) return;
      religar = setTimeout(conectar, esperaParaReligar(tentativa));
      tentativa += 1;
    };
  };

  conectar();

  return () => {
    ativo = false;
    if (religar) clearTimeout(religar);
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
      ws.close();
    }
  };
}
