// Os arquivos da fila: pedido, início, cancelamento e desfecho
// (D-732: saiu do native_worker.js). O contrato está em protocol/job.schema.json.
const fs = require("fs");
const path = require("path");
const { clockNow } = require("../worker_time.js");

/**
 * Grava JSON de forma ATÔMICA: escreve num `.tmp` e renomeia.
 *
 * D-638: o backend reage ao evento de CRIAÇÃO do arquivo (watchfiles) e lê na
 * hora. Com `writeFileSync` direto, ele podia abrir o `res_` no meio da escrita
 * e receber JSON pela metade — que vira um `WorkerJobFailed` mentiroso ("falha
 * ao ler resposta") num job que na verdade DEU CERTO. O rename é atômico no
 * NTFS: o arquivo aparece inteiro ou não aparece.
 *
 * É a mesma receita que o lado Python já usa (`worker_queue.escrever_json_atomico`),
 * agora dos dois lados da fila.
 */
function escreverJsonAtomico(destino, payload) {
  const temporario = `${destino}.tmp`;
  fs.writeFileSync(temporario, JSON.stringify(payload));
  fs.renameSync(temporario, destino);
}

function removerSeExistir(filePath) {
  try {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch (e) {
    console.warn(`⚠️ Não foi possível remover ${path.basename(filePath)}: ${e.message}`);
  }
}

/** Os caminhos e o porteiro das respostas de uma pasta de fila. */
function criarFila(filaDir) {
  // D-639: jobs cujo desfecho já foi escrito (um job, uma resposta).
  const respondidos = new Set();

  const ackPath = (id) => path.join(filaDir, `ack_${id}.json`);
  const cancelPath = (id) => path.join(filaDir, `cancel_${id}.json`);
  const resPath = (id) => path.join(filaDir, `res_${id}.json`);

  /**
   * Escreve o desfecho do job — UMA vez, e só uma.
   *
   * D-639: cancelar um job matava o filho, o `executarJob` via "saiu com código
   * 1" e escrevia `erro`; logo depois o `processJob` escrevia `cancelado` por
   * cima. Quem lesse primeiro (o backend lê no evento de criação) via FALHA num
   * job que o operador tinha mandado parar — e "falhou" manda investigar bug;
   * "cancelado" manda seguir a vida.
   *
   * Cancelamento tem precedência sobre o código de saída porque o kill É a causa
   * daquele código.
   */
  function responderJob(id, destino, payload) {
    if (respondidos.has(id)) {
      console.debug(
        `[${clockNow()}] desfecho de ${id} já escrito; ignorando "${payload.status}".`,
      );
      return false;
    }
    respondidos.add(id);
    escreverJsonAtomico(destino, payload);
    return true;
  }

  /** Terminado o job, o id pode voltar à fila numa nova tentativa. */
  function esquecerResposta(id) {
    respondidos.delete(id);
  }

  return { ackPath, cancelPath, resPath, responderJob, esquecerResposta };
}

module.exports = { escreverJsonAtomico, removerSeExistir, criarFila };
