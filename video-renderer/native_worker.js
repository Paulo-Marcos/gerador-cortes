const fs = require("fs");
const path = require("path");
const { clockNow, formatDuration } = require("./worker_time.js");
const { problemaDoPedido } = require("./protocolo_job.js");
const { inteiroDoAmbiente } = require("./worker/ambiente.js");
const { configureLogLevel, instalarConsoleFiltrado, anotarNoLogDoJob } = require("./worker/log.js");
const { removerSeExistir, escreverJsonAtomico, criarFila } = require("./worker/fila.js");
const { categoryOf, ehExclusiva, criarAgenda } = require("./worker/agenda.js");
const { comJob, matarFilhos, esquecerFilhos, jobsComFilhos, runCommand } = require("./worker/processos.js");

// D-732: este arquivo é só o maestro — pastas, partida, o ciclo de vida de um
// job, a varredura da fila e a saída. O resto mora em worker/: log.js (nível e
// worker_debug.log), fila.js (arquivos da fila e o porteiro das respostas),
// agenda.js (quem roda junto com quem), processos.js (filhos, kill, watchdog)
// e ambiente.js (configuração lida do ambiente).

const repoRoot = path.resolve(__dirname, "..");
const backendDir = path.join(repoRoot, "backend");

// D-155: os dados operacionais (banco + midias + fila de render) vivem na pasta
// do canal ativo (instance/channels/<ativo>/projetos). Espelha o
// channel_paths.projetos_dir do backend: vira para o canal quando o banco ja foi
// consolidado la; senao cai no legado (PROJETOS_DIR ou backend/projetos).
function resolveProjetosDir() {
  try {
    const canal = fs
      .readFileSync(path.join(repoRoot, "instance", "active-channel"), "utf-8")
      .trim();
    if (canal) {
      const canalProjetos = path.join(repoRoot, "instance", "channels", canal, "projetos");
      if (fs.existsSync(path.join(canalProjetos, "projetos.db"))) {
        return canalProjetos;
      }
    }
  } catch (_) {
    // sem ponteiro de canal ativo -> usa o legado abaixo
  }
  return process.env.PROJETOS_DIR
    ? path.resolve(process.env.PROJETOS_DIR)
    : path.join(backendDir, "projetos");
}

const canalDoBoot = (() => {
  try {
    return fs
      .readFileSync(path.join(repoRoot, "instance", "active-channel"), "utf-8")
      .trim();
  } catch (_) {
    return "";
  }
})();
const projetosDir = resolveProjetosDir();
const filaDir = path.join(projetosDir, "fila_remotion");

instalarConsoleFiltrado();

// Garante que a pasta existe
if (!fs.existsSync(filaDir)) {
  fs.mkdirSync(filaDir, { recursive: true });
}

console.log("🚀 Native Worker Iniciado!");
console.log(`Buscando tarefas em: ${filaDir}`);
console.log(
  "Pressione Ctrl+C para encerrar o worker quando não for mais utilizá-lo.\n",
);

const activeJobs = new Map();
const { canStartJob } = criarAgenda(activeJobs);
const { ackPath, cancelPath, resPath, responderJob, esquecerResposta } = criarFila(filaDir);

// ── Ack de início e cancelamento (D-424 / D-426) ───────────────────────────
// O protocolo original tinha só dois arquivos: `req_` (pedido) e `res_`
// (desfecho). Faltavam dois sinais:
//
//   `ack_{id}.json`    — o worker COMEÇOU a executar. Sem ele, o backend não
//     distingue "esperando na fila" de "renderizando", e o timeout do job
//     acabava sendo consumido pela espera (D-424): com dois cortes em voo, um
//     chunk de overlay podia estourar os 30 min sem nunca ter rodado.
//   `cancel_{id}.json` — o operador desistiu. Mata a árvore de processos do
//     job e devolve `res_` com status `cancelado` (D-426), em vez de exigir
//     que se derrube a aplicação inteira.
//
// O id do job viaja por AsyncLocalStorage em vez de parâmetro: `runCommand`
// tem 8 pontos de chamada e jobs rodam em paralelo, então uma variável de
// módulo apontaria para o job errado.
const cancelados = new Set();

// Quantos frames o Remotion renderiza em paralelo. 12 é o valor que esta
// máquina praticava desde sempre; subir satura a iGPU e derruba o render.
const CONCORRENCIA_REMOTION = inteiroDoAmbiente("REMOTION_CONCURRENCY", 12, 1);

/**
 * Envelope de execução: anuncia o início (`ack_`), amarra o id do job ao
 * contexto assíncrono (para `registrarFilho` saber de quem é cada processo)
 * e converte um kill por cancelamento no desfecho `cancelado` — sem isso o
 * job morto sairia como "Exit code: 1", indistinguível de uma falha real.
 */
async function processJob(jobData, jobFile) {
  const { id } = jobData;
  const caminhoDaResposta = resPath(id);

  try {
    escreverJsonAtomico(ackPath(id), { id, started_at: Date.now() });
  } catch (e) {
    console.warn(`⚠️ Falha ao anunciar início de ${id}: ${e.message}`);
  }

  try {
    await comJob(id, () => executarJob(jobData, jobFile));
    // Rede de segurança: se o `executarJob` saiu sem responder (erro antes do
    // desfecho), o cancelamento ainda precisa chegar ao backend. O porteiro
    // garante que isto NÃO sobrescreve um desfecho já escrito (D-639).
    if (cancelados.has(id)) {
      responderJob(id, caminhoDaResposta, {
        status: "cancelado",
        erro: "Cancelado pelo operador",
      });
    }
  } finally {
    esquecerResposta(id);
    cancelados.delete(id);
    esquecerFilhos(id);
    removerSeExistir(ackPath(id));
    removerSeExistir(cancelPath(id));
  }
}

async function executarJob(jobData, jobFile) {
  configureLogLevel(jobData.log_level || jobData.logLevel);
  const { id, cmd, cwd } = jobData;
  const caminhoDaResposta = resPath(id);
  const reqPath = path.join(filaDir, jobFile);
  const jobStartedAt = Date.now();
  // D-440: o res_*.json é apagado pelo backend após a leitura; o
  // worker_debug.log do corte é o único registro durável da duração do job.
  let debugCwd = null;
  const registrarDesfecho = (status) => {
    if (!debugCwd) return;
    anotarNoLogDoJob(
      debugCwd,
      `[${new Date().toISOString()}] Fim: ${id} status=${status} duration_ms=${Date.now() - jobStartedAt}\n`,
    );
  };

  try {
    console.log(`\n----------------------------------------------------`);
    console.log(`[${clockNow()}] 📦 [Pipeline] INÍCIO da tarefa: ${id}`);

    // 0. Configuração de Ambiente
    const shellPath = process.env.ComSpec || "cmd.exe";
    let finalCwd = cwd;
    if (cwd === "/video-renderer" || cwd === "/app/video-renderer") {
      finalCwd = path.resolve(__dirname);
    } else if (cwd && cwd.startsWith("/app/")) {
      finalCwd = path.join(backendDir, cwd.replace("/app/", ""));
    }

    // 1. Tradução de Caminhos
    const translatedCmd = cmd.map((arg) => {
      if (typeof arg === "string") {
        if (arg.startsWith("projetos/") || arg.startsWith("assets/")) {
          return path.join(backendDir, arg);
        } else if (arg.startsWith("/app/")) {
          return path.join(backendDir, arg.replace("/app/", ""));
        }
      }
      return arg;
    });

    const isRemotion =
      translatedCmd[0] &&
      translatedCmd[0].toLowerCase().includes("npx") &&
      translatedCmd
        .slice(1, 4)
        .some(
          (a) => a.toLowerCase() === "render" || a.toLowerCase() === "remotion",
        );

    // No Windows, usamos shell: true apenas para 'npx' (remotion) pois é um .cmd.
    // Para ffmpeg/ffprobe, shell: false é MUITO mais seguro para evitar que espaços em filtros quebrem o comando.
    const useShell = isRemotion;

    console.log(`🔍 [Debug] isRemotion: ${isRemotion}`);
    console.log(
      `🔍 [Debug] Comando[0-3]: ${translatedCmd.slice(0, 4).join(" ")}`,
    );

    // Log para arquivo no diretório de trabalho
    debugCwd = finalCwd;
    anotarNoLogDoJob(
      finalCwd,
      `\n[${new Date().toISOString()}] Job: ${id}\nCMD: ${translatedCmd.join(" ")}\nCWD: ${finalCwd}\n`,
    );

    // 2. FFmpeg: o backend já cuida de deletar o output antes de enfileirar.
    // NÃO pular execução com base em tamanho — arquivo residual pode estar
    // corrompido/desatualizado e o worker retornaria "sucesso" indevido.

    // 4. Execução Padrão (se não for Remotion ou se for renderização completa)
    // Se for Remotion mas caiu aqui (ex: vídeo curto ou muitas cenas), adiciona concorrência
    let finalCmd = [...translatedCmd];
    if (isRemotion && !finalCmd.includes("--concurrency")) {
      finalCmd.splice(
        finalCmd.length - 1,
        0,
        "--concurrency",
        String(CONCORRENCIA_REMOTION),
      );
    }

    console.log(`⚛️ [Exec] ${finalCmd.join(" ")} (shell: ${useShell})`);
    const { code, stderrTail } = await runCommand(
      finalCmd[0],
      finalCmd.slice(1),
      finalCwd,
      useShell,
    );

    const duracaoJob = formatDuration(Date.now() - jobStartedAt);
    if (cancelados.has(id)) {
      // O código de saída aqui é consequência do kill: reportá-lo como falha
      // faria o operador caçar um bug que ele mesmo interrompeu (D-639).
      console.log(
        `[${clockNow()}] 🛑 [Cancelado] Tarefa ${id} interrompida após ${duracaoJob}.`,
      );
      registrarDesfecho("cancelado");
      responderJob(id, caminhoDaResposta, {
        status: "cancelado",
        erro: "Cancelado pelo operador",
        duration_ms: Date.now() - jobStartedAt,
      });
    } else if (code === 0) {
      console.log(
        `[${clockNow()}] ✅ [Sucesso] Tarefa ${id} concluída em ${duracaoJob}.`,
      );
      registrarDesfecho("sucesso");
      responderJob(id, caminhoDaResposta, {
        status: "sucesso",
        duration_ms: Date.now() - jobStartedAt,
      });
    } else {
      console.error(
        `[${clockNow()}] ❌ [Erro] Falha na tarefa ${id} após ${duracaoJob}. Código: ${code}`,
      );
      registrarDesfecho("erro");
      responderJob(id, caminhoDaResposta, {
        status: "erro",
        erro: stderrTail
          ? `Exit code: ${code}\n${stderrTail}`
          : `Exit code: ${code} (sem saída de erro do processo)`,
        duration_ms: Date.now() - jobStartedAt,
      });
    }

    if (fs.existsSync(reqPath)) fs.unlinkSync(reqPath);
  } catch (err) {
    console.error(
      `[${clockNow()}] ❌ [Fatal] Erro na tarefa ${id} após ${formatDuration(Date.now() - jobStartedAt)}:`,
      err,
    );
    registrarDesfecho("fatal");
    responderJob(id, caminhoDaResposta, {
      status: "erro",
      erro: err.message,
      duration_ms: Date.now() - jobStartedAt,
    });
    if (fs.existsSync(reqPath)) fs.unlinkSync(reqPath);
  }
}

/**
 * Atende os pedidos de cancelamento (D-426). Job em execução tem a árvore de
 * processos encerrada e o desfecho escrito pelo `processJob`; job ainda na
 * fila é respondido aqui mesmo, para o backend não esperar o timeout inteiro
 * por algo que nunca vai rodar.
 */
function tratarCancelamentos(files) {
  const removidos = new Set();
  for (const nome of files) {
    if (!nome.startsWith("cancel_") || !nome.endsWith(".json")) continue;
    const id = nome.slice("cancel_".length, -".json".length);
    const jobFile = `req_${id}.json`;

    if (activeJobs.has(jobFile)) {
      if (cancelados.has(id)) continue; // kill já disparado neste job
      cancelados.add(id);
      const mortos = matarFilhos(id);
      console.log(
        `[${clockNow()}] 🛑 [Cancelamento] ${id}: ${mortos} processo(s) encerrado(s).`,
      );
      continue; // o processJob escreve o res_ e limpa os sentinelas
    }

    const reqPath = path.join(filaDir, jobFile);
    if (fs.existsSync(reqPath)) {
      removerSeExistir(reqPath);
      removidos.add(jobFile);
      responderJob(id, resPath(id), {
        status: "cancelado",
        erro: "Cancelado pelo operador antes de iniciar",
      });
      console.log(`[${clockNow()}] 🛑 [Cancelamento] ${id}: removido da fila.`);
    }
    removerSeExistir(path.join(filaDir, nome));
  }
  return removidos;
}

// req_ lido com erro CONSECUTIVAMENTE, por arquivo. O `fs.watch` dispara no
// evento de CRIACAO do arquivo -- em Windows, antes de o conteudo chegar ao
// disco quando o produtor nao escreve de forma atomica. A primeira leitura
// pega "" e o JSON.parse estoura com "Unexpected end of JSON input".
// Tratar isso como falha definitiva (res_ de erro + req_ apagado) matava um
// job valido; aqui a leitura so vira erro depois de N tentativas seguidas,
// dando ao poll de 1,5s a chance de reler o arquivo ja completo.
const leiturasFalhas = new Map();
const MAX_LEITURAS_FALHAS = 3;

async function checkFilaParallel() {
  try {
    const files = fs.readdirSync(filaDir);
    // O snapshot de `files` é anterior ao cancelamento: sem descontar os
    // pedidos que acabaram de sair, o loop abaixo leria um req_ inexistente e
    // sobrescreveria o `res_ cancelado` com um erro de leitura.
    const removidos = tratarCancelamentos(files);
    const reqFiles = files.filter(
      (f) => f.startsWith("req_") && f.endsWith(".json") && !removidos.has(f),
    );

    for (const jobFile of reqFiles) {
      if (activeJobs.has(jobFile)) continue;

      const jobPath = path.join(filaDir, jobFile);
      try {
        const jobData = JSON.parse(fs.readFileSync(jobPath, "utf8"));
        leiturasFalhas.delete(jobFile);
        // D-725: pedido que não tem como rodar volta como erro dito com todas
        // as letras, em vez de estourar lá dentro do spawn.
        const problema = problemaDoPedido(jobData);
        if (problema) {
          console.error(`❌ Pedido recusado ${jobFile}: ${problema}`);
          const id = jobFile.replace("req_", "").replace(".json", "");
          responderJob(id, resPath(id), {
            status: "erro",
            erro: `pedido inválido: ${problema}`,
          });
          removerSeExistir(jobPath);
          continue;
        }
        if (!canStartJob(jobData)) continue;

        const category = categoryOf(jobData);
        const overlay = category === "overlay";
        activeJobs.set(jobFile, { overlay, category });
        console.log(`\n📦 Nova tarefa: ${jobFile} (categoria=${category})`);

        processJob(jobData, jobFile).finally(() => {
          activeJobs.delete(jobFile);
        });

        // Mantém o loop varrendo se há slot p/ paralelismo (overlay ou bundle∥grade).
        // Só "break" quando a categoria é exclusiva (default, render_final).
        if (ehExclusiva(category)) break;
      } catch (err) {
        const tentativas = (leiturasFalhas.get(jobFile) || 0) + 1;
        leiturasFalhas.set(jobFile, tentativas);
        if (tentativas < MAX_LEITURAS_FALHAS) {
          // Provavel escrita em andamento: ignora e deixa o poll reler.
          continue;
        }
        leiturasFalhas.delete(jobFile);
        console.error(`❌ Erro ao ler a tarefa ${jobFile}:`, err);
        const id = jobFile.replace("req_", "").replace(".json", "");
        responderJob(id, resPath(id), { status: "erro", erro: err.message });
        if (fs.existsSync(jobPath)) fs.unlinkSync(jobPath);
      }
    }
    for (const jobFile of leiturasFalhas.keys()) {
      if (!reqFiles.includes(jobFile)) leiturasFalhas.delete(jobFile);
    }
  } catch (err) {
    console.error("Erro ao ler a fila:", err);
  }
}


// ─── Saída limpa, entrada limpa e troca de canal (D-640) ────────────────────

/**
 * Encerra o worker sem deixar rastro: mata os filhos (ffmpeg, Chromium) e
 * apaga os `ack_` dos jobs em voo.
 *
 * Sem isto, fechar o app deixava processos órfãos comendo CPU — o mesmo que
 * aconteceu aqui com um worker de produção esquecido no Gerenciador de Tarefas.
 * E o `ack_` abandonado é pior que inútil: o relógio do backend só começa a
 * contar quando ele aparece, então um `ack_` velho faz o próximo job herdar um
 * cronômetro que já correu.
 */
let encerrando = false;
function encerrarComCalma(motivo) {
  if (encerrando) return;
  encerrando = true;
  console.log(`[${clockNow()}] 🔻 Encerrando o worker (${motivo}).`);
  for (const id of jobsComFilhos()) {
    const mortos = matarFilhos(id);
    if (mortos) console.log(`   ${mortos} processo(s) do job ${id} encerrados.`);
    removerSeExistir(ackPath(id));
  }
}

for (const sinal of ["SIGINT", "SIGTERM", "SIGHUP", "SIGBREAK"]) {
  process.on(sinal, () => {
    encerrarComCalma(sinal);
    process.exit(0);
  });
}
process.on("exit", () => encerrarComCalma("saída do processo"));

/**
 * No boot NÃO existe job em execução — todo `ack_` no disco é resto de um
 * worker que morreu no meio. Deixá-los faz o backend achar que um job já está
 * rodando e esperar por uma resposta que nunca vem.
 */
function limparAcksOrfaos() {
  let removidos = 0;
  try {
    for (const nome of fs.readdirSync(filaDir)) {
      if (nome.startsWith("ack_") && nome.endsWith(".json")) {
        removerSeExistir(path.join(filaDir, nome));
        removidos += 1;
      }
    }
  } catch (e) {
    console.warn(`⚠️ Não consegui limpar os ack_ antigos: ${e.message}`);
  }
  if (removidos) {
    console.log(
      `[${clockNow()}] 🧹 ${removidos} ack_ órfão(s) de uma execução anterior removido(s).`,
    );
  }
}

/**
 * O canal ativo é resolvido UMA vez, na subida (o `filaDir` nasce dele). Se o
 * operador troca de canal com o app no ar, este worker continua olhando a fila
 * do canal antigo — e os jobs do canal novo ficam parados sem explicação.
 *
 * Trocar a pasta em pleno voo seria pior (job em andamento escreve a resposta
 * onde ninguém lê): a decisão do projeto é que a troca vale no PRÓXIMO restart
 * (D-629). O que faltava era DIZER isso — em vez de deixar a fila muda.
 */
let canalAvisado = false;
function vigiarTrocaDeCanal() {
  if (canalAvisado) return;
  let canalAgora = "";
  try {
    canalAgora = fs
      .readFileSync(path.join(repoRoot, "instance", "active-channel"), "utf-8")
      .trim();
  } catch (_) {
    return; // sem ponteiro: nada a comparar
  }
  if (!canalDoBoot || canalAgora === canalDoBoot) return;
  canalAvisado = true;
  console.warn(
    `[${clockNow()}] ⚠️ Canal ativo mudou de "${canalDoBoot}" para "${canalAgora}". ` +
      `Este worker continua na fila do canal anterior — feche e abra o app para a troca valer.`,
  );
}
setInterval(vigiarTrocaDeCanal, 5000);

limparAcksOrfaos();

// Pickup quase instantaneo via fs.watch + poll de seguranca (eventos de FS
// podem ser perdidos em alguns sistemas/SMB). Antes era so um poll de 2s, que
// adicionava ate ~2s de latencia em cada transicao de job.
try {
  fs.watch(filaDir, () => {
    checkFilaParallel();
  });
} catch (e) {
  console.warn(`fs.watch indisponivel (${e.message}); usando so o poll.`);
}
setInterval(checkFilaParallel, 1500);
checkFilaParallel();