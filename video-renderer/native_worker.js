const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");
const { AsyncLocalStorage } = require("node:async_hooks");
const { clockNow, formatDuration } = require("./worker_time.js");

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

const projetosDir = resolveProjetosDir();
const filaDir = path.join(projetosDir, "fila_remotion");
const settingsPath = path.join(projetosDir, "app_settings.json");
const originalConsole = {
  log: console.log.bind(console),
  info: console.info.bind(console),
  debug: console.debug.bind(console),
  warn: console.warn.bind(console),
  error: console.error.bind(console),
};
let currentLogLevel = readConfiguredLogLevel();

function readConfiguredLogLevel() {
  try {
    if (!fs.existsSync(settingsPath)) return "disabled";
    const data = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
    return normalizeLogLevel(data.log_level);
  } catch {
    return "disabled";
  }
}

function normalizeLogLevel(level) {
  return ["disabled", "info", "debug"].includes(level) ? level : "disabled";
}

function configureLogLevel(level) {
  currentLogLevel = normalizeLogLevel(level || readConfiguredLogLevel());
}

function isDebugLog(message) {
  const text = String(message).toLowerCase();
  return (
    text.includes("[debug]") ||
    text.includes("debug") ||
    text.includes("cmd") ||
    text.includes("comando") ||
    text.includes("props") ||
    text.includes("payload") ||
    text.includes("ffprobe")
  );
}

function isInfoLog(message) {
  const text = String(message).toLowerCase();
  return (
    text.includes("iniciando") ||
    text.includes("iniciado") ||
    text.includes("fase") ||
    text.includes("etapa") ||
    text.includes("conclu") ||
    text.includes("finalizando") ||
    text.includes("processando") ||
    text.includes("progress") ||
    text.includes("progresso") ||
    text.includes("enfileir") ||
    text.includes("aguardando") ||
    text.includes("pulando") ||
    text.includes("pular") ||
    text.includes("tempo") ||
    text.includes("tarefa") ||
    text.includes("job")
  );
}

function shouldLogInfo(args) {
  if (currentLogLevel === "debug") return true;
  if (currentLogLevel !== "info") return false;
  const message = args.join(" ");
  return isInfoLog(message) && !isDebugLog(message);
}

console.log = (...args) => {
  if (shouldLogInfo(args)) originalConsole.log(...args);
};
console.info = console.log;
console.debug = (...args) => {
  if (currentLogLevel === "debug") originalConsole.debug(...args);
};
console.warn = (...args) => {
  if (currentLogLevel !== "disabled") originalConsole.warn(...args);
};
console.error = (...args) => originalConsole.error(...args);

// Garante que a pasta existe
if (!fs.existsSync(filaDir)) {
  fs.mkdirSync(filaDir, { recursive: true });
}

console.log("🚀 Native Worker Iniciado!");
console.log(`Buscando tarefas em: ${filaDir}`);
console.log(
  "Pressione Ctrl+C para encerrar o worker quando não for mais utilizá-lo.\n",
);

const MAX_PARALLEL_OVERLAYS = Number(
  process.env.REMOTION_OVERLAY_PARALLEL || "2",
);
const activeJobs = new Map();

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
const jobContext = new AsyncLocalStorage();
const cancelados = new Set();
const filhosPorJob = new Map();

function ackPath(id) {
  return path.join(filaDir, `ack_${id}.json`);
}

function cancelPath(id) {
  return path.join(filaDir, `cancel_${id}.json`);
}

function removerSeExistir(filePath) {
  try {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch (e) {
    console.warn(`⚠️ Não foi possível remover ${path.basename(filePath)}: ${e.message}`);
  }
}

function registrarFilho(child) {
  const store = jobContext.getStore();
  if (!store) return;
  if (!filhosPorJob.has(store.id)) filhosPorJob.set(store.id, new Set());
  filhosPorJob.get(store.id).add(child);
  const esquecer = () => filhosPorJob.get(store.id)?.delete(child);
  child.once("close", esquecer);
  child.once("error", esquecer);
}

/** Mata a árvore de processos do job. Por PID + /T — NUNCA por nome de imagem,
 *  que derrubaria ffmpeg de outros cortes (e da produção). */
function matarFilhos(id) {
  const filhos = filhosPorJob.get(id);
  if (!filhos || filhos.size === 0) return 0;
  let mortos = 0;
  for (const child of filhos) {
    if (!child.pid || child.killed) continue;
    try {
      if (process.platform === "win32") {
        spawn("taskkill", ["/PID", String(child.pid), "/T", "/F"], {
          stdio: "ignore",
        });
      } else {
        child.kill("SIGKILL");
      }
      mortos += 1;
    } catch (e) {
      console.warn(`⚠️ Falha ao encerrar PID ${child.pid}: ${e.message}`);
    }
  }
  return mortos;
}

// D-065: folga mínima de RAM livre (MB) para INICIAR um job concorrente.
// Um único ffmpeg de compose+encode com vários overlays ProRes 4444 pode
// passar de 4-5 GB; rodar dois jobs pesados ao mesmo tempo (ex.: grade ∥
// overlay, ou dois cortes em paralelo) estourava a memória e derrubava as
// execuções. O gate NUNCA bloqueia o único job ativo — só impede empilhar um
// segundo quando a RAM disponível já está abaixo da folga. Override por env.
const MIN_FREE_MEM_MB = Number(process.env.WORKER_MIN_FREE_MEM_MB || "1024");
let lastMemGateLogAt = 0;

function freeMemMB() {
  // os.freemem() no Windows reflete a memória física disponível (livre +
  // standby reclaimável), que é a métrica certa para "cabe outro job?".
  return os.freemem() / (1024 * 1024);
}

function hasMemoryHeadroom() {
  return freeMemMB() >= MIN_FREE_MEM_MB;
}

function logMemoryGate() {
  // Throttle: este caminho roda no poll (1.5s) — sem throttle, polui o log.
  const now = Date.now();
  if (now - lastMemGateLogAt < 10000) return;
  lastMemGateLogAt = now;
  console.log(
    `🧯 [MemGate] Adiando novo job: RAM livre ${freeMemMB().toFixed(0)}MB < folga ${MIN_FREE_MEM_MB}MB ` +
      `(${activeJobs.size} job(s) ativo(s)). Aguardando liberar memória.`,
  );
}

// Categorias compatíveis para execução paralela.
// O backend (RemotionWorkerQueue) marca cada job com uma categoria; o worker
// usa esta matriz para decidir se pode iniciar um job novo com algum job já em
// execução. Categorias compatíveis NÃO competem pelo mesmo recurso físico:
//   - BUNDLE   = Node + disco (npx remotion bundle)
//   - GRADE    = FFmpeg + Intel QSV/GPU
//   - OVERLAY  = Remotion render (Chromium GPU + libvpx-vp9 CPU)
//   - RENDER_FINAL = FFmpeg + Intel QSV/GPU
// BUNDLE ∥ GRADE é seguro porque um é Node/disco e o outro é GPU.
// GRADE ∥ OVERLAY (Fase 1∥Fase 2): a grade é FFmpeg (QSV/GPU + CPU); o overlay
// é Chromium (GPU) + encode (CPU). Os overlays NÃO dependem do graded, então
// renderizam durante a grade — reduz o tempo total. Limitado a 1 overlay
// enquanto a grade roda (ver canStartJob) p/ não saturar a iGPU.
// OVERLAYs entre si seguem MAX_PARALLEL_OVERLAYS para não saturar o Chromium.
const COMPATIBLE_CATEGORIES = {
  bundle: new Set(["grade", "overlay"]),
  grade: new Set(["bundle", "overlay"]),
};

function buildNodeOptions() {
  const existing = (process.env.NODE_OPTIONS || "")
    .split(/\s+/)
    .filter(Boolean)
    .filter((option) => !option.startsWith("--max-old-space-size="));

  return ["--max-old-space-size=8192", ...existing].join(" ");
}

function isOverlayJob(jobData) {
  // Categoria explícita vinda do backend (preferida); fallback heurístico
  // mantém compatibilidade com versões antigas que não enviam `category`.
  if (jobData?.category === "overlay") return true;
  const id = jobData?.id || "";
  return (
    (id.startsWith("ov_") || id.startsWith("chunk_")) &&
    Array.isArray(jobData.cmd) &&
    (jobData.cmd.includes("OverlayScene") ||
      jobData.cmd.includes("OverlayTimeline"))
  );
}

function categoryOf(jobData) {
  if (jobData?.category && typeof jobData.category === "string")
    return jobData.category;
  if (isOverlayJob(jobData)) return "overlay";
  return "default";
}

function canStartJob(jobData) {
  // O único job ativo sempre pode rodar (bloquear travaria tudo). O gate de
  // RAM só vale para jobs CONCORRENTES — não empilha um segundo job pesado
  // quando a memória disponível já está abaixo da folga (D-065).
  if (activeJobs.size === 0) return true;

  if (!hasMemoryHeadroom()) {
    logMemoryGate();
    return false;
  }

  const active = Array.from(activeJobs.values());
  const newCat = categoryOf(jobData);

  // OVERLAY coexiste com outros overlays, com a grade (Fase 1∥Fase 2) e com o
  // bundle — mas NUNCA com render_final/default (exclusivos).
  if (newCat === "overlay") {
    const incompativel = active.some(
      (job) => !["overlay", "grade", "bundle"].includes(job.category),
    );
    if (incompativel) return false;
    const overlaysAtivos = active.filter(
      (job) => job.category === "overlay",
    ).length;
    const temGrade = active.some((job) => job.category === "grade");
    // Durante a grade limita a 1 overlay (Chromium + QSV dividem a iGPU);
    // sem grade, até MAX_PARALLEL_OVERLAYS.
    return overlaysAtivos < (temGrade ? 1 : MAX_PARALLEL_OVERLAYS);
  }

  // Demais categorias só coexistem se a matriz COMPATIBLE_CATEGORIES permitir
  // todos os jobs ativos. Job único (DEFAULT, RENDER_FINAL) fica exclusivo.
  const compatibles = COMPATIBLE_CATEGORIES[newCat];
  if (!compatibles) return false;
  if (!active.every((job) => compatibles.has(job.category))) return false;
  // Simetria com o limite de overlay durante a grade: a grade só inicia se
  // houver no máximo 1 overlay ativo (não saturar a iGPU mesmo se a ordem de
  // submissão mudar — hoje a grade é submetida antes dos overlays).
  if (newCat === "grade") {
    return active.filter((job) => job.category === "overlay").length <= 1;
  }
  return true;
}

/**
 * Envelope de execução: anuncia o início (`ack_`), amarra o id do job ao
 * contexto assíncrono (para `registrarFilho` saber de quem é cada processo)
 * e converte um kill por cancelamento no desfecho `cancelado` — sem isso o
 * job morto sairia como "Exit code: 1", indistinguível de uma falha real.
 */
async function processJob(jobData, jobFile) {
  const { id } = jobData;
  const resPath = path.join(filaDir, `res_${id}.json`);

  try {
    fs.writeFileSync(
      ackPath(id),
      JSON.stringify({ id, started_at: Date.now() }),
    );
  } catch (e) {
    console.warn(`⚠️ Falha ao anunciar início de ${id}: ${e.message}`);
  }

  try {
    await jobContext.run({ id }, () => executarJob(jobData, jobFile));
    if (cancelados.has(id)) {
      fs.writeFileSync(
        resPath,
        JSON.stringify({
          status: "cancelado",
          erro: "Cancelado pelo operador",
        }),
      );
    }
  } finally {
    cancelados.delete(id);
    filhosPorJob.delete(id);
    removerSeExistir(ackPath(id));
    removerSeExistir(cancelPath(id));
  }
}

async function executarJob(jobData, jobFile) {
  configureLogLevel(jobData.log_level || jobData.logLevel);
  const { id, cmd, cwd } = jobData;
  const resPath = path.join(filaDir, `res_${id}.json`);
  const reqPath = path.join(filaDir, jobFile);
  const jobStartedAt = Date.now();
  // D-440: o res_*.json é apagado pelo backend após a leitura; o
  // worker_debug.log do corte é o único registro durável da duração do job.
  let debugCwd = null;
  const registrarDesfecho = (status) => {
    if (!debugCwd) return;
    try {
      fs.appendFileSync(
        path.join(debugCwd, "worker_debug.log"),
        `[${new Date().toISOString()}] Fim: ${id} status=${status} duration_ms=${Date.now() - jobStartedAt}\n`,
      );
    } catch (e) {}
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

    const isFFmpeg =
      translatedCmd[0] &&
      (translatedCmd[0].toLowerCase().includes("ffmpeg") ||
        translatedCmd[0].toLowerCase().includes("ffprobe"));
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

    console.log(`🔍 [Debug] isFFmpeg: ${isFFmpeg}, isRemotion: ${isRemotion}`);
    console.log(
      `🔍 [Debug] Comando[0-3]: ${translatedCmd.slice(0, 4).join(" ")}`,
    );

    // Log para arquivo no diretório de trabalho
    debugCwd = finalCwd;
    try {
      const logPath = path.join(finalCwd, "worker_debug.log");
      fs.appendFileSync(
        logPath,
        `\n[${new Date().toISOString()}] Job: ${id}\nCMD: ${translatedCmd.join(" ")}\nCWD: ${finalCwd}\n`,
      );
    } catch (e) {}

    // 2. FFmpeg: o backend já cuida de deletar o output antes de enfileirar.
    // NÃO pular execução com base em tamanho — arquivo residual pode estar
    // corrompido/desatualizado e o worker retornaria "sucesso" indevido.

    // 4. Execução Padrão (se não for Remotion ou se for renderização completa)
    // Se for Remotion mas caiu aqui (ex: vídeo curto ou muitas cenas), adiciona concorrência
    let finalCmd = [...translatedCmd];
    if (isRemotion && !finalCmd.includes("--concurrency")) {
      finalCmd.splice(finalCmd.length - 1, 0, "--concurrency", "12");
    }

    console.log(`⚛️ [Exec] ${finalCmd.join(" ")} (shell: ${useShell})`);
    const code = await runCommand(
      finalCmd[0],
      finalCmd.slice(1),
      finalCwd,
      useShell,
    );

    const duracaoJob = formatDuration(Date.now() - jobStartedAt);
    if (code === 0) {
      console.log(
        `[${clockNow()}] ✅ [Sucesso] Tarefa ${id} concluída em ${duracaoJob}.`,
      );
      registrarDesfecho("sucesso");
      fs.writeFileSync(
        resPath,
        JSON.stringify({
          status: "sucesso",
          duration_ms: Date.now() - jobStartedAt,
        }),
      );
    } else {
      console.error(
        `[${clockNow()}] ❌ [Erro] Falha na tarefa ${id} após ${duracaoJob}. Código: ${code}`,
      );
      registrarDesfecho("erro");
      fs.writeFileSync(
        resPath,
        JSON.stringify({
          status: "erro",
          erro: `Exit code: ${code}`,
          duration_ms: Date.now() - jobStartedAt,
        }),
      );
    }

    if (fs.existsSync(reqPath)) fs.unlinkSync(reqPath);
  } catch (err) {
    console.error(
      `[${clockNow()}] ❌ [Fatal] Erro na tarefa ${id} após ${formatDuration(Date.now() - jobStartedAt)}:`,
      err,
    );
    registrarDesfecho("fatal");
    fs.writeFileSync(
      resPath,
      JSON.stringify({
        status: "erro",
        erro: err.message,
        duration_ms: Date.now() - jobStartedAt,
      }),
    );
    if (fs.existsSync(reqPath)) fs.unlinkSync(reqPath);
  }
}

/**
 * Helper para rodar comandos e logar a saída
 */
function runCommand(command, args, cwd, shell) {
  return new Promise((resolve) => {
    // shell=false para FFmpeg: evita que cmd.exe mangle single-quotes
    // nos filtros (ex: curves=r='0/0.05 ...'). shell=true apenas para npx.
    let useShell = typeof shell === "boolean" ? shell : true;
    let executable = command;
    let finalArgs = args;
    const commandName = path.basename(String(command)).toLowerCase();
    const isFfmpegCommand =
      commandName === "ffmpeg" || commandName === "ffmpeg.exe";

    if (command === "npx" && args?.[0] === "remotion") {
      const remotionCli = path.join(
        __dirname,
        "node_modules",
        "@remotion",
        "cli",
        "remotion-cli.js",
      );
      executable = process.execPath;
      finalArgs = ["--max-old-space-size=8192", remotionCli, ...args.slice(1)];
      useShell = false;
      console.log("🧠 [Node] Remotion via Node direto com heap 8192 MB");
    }

    if (isFfmpegCommand && !finalArgs.includes("-progress")) {
      finalArgs = ["-stats_period", "5", "-progress", "pipe:1", ...finalArgs];
    }

    const outputPath = isFfmpegCommand ? findLikelyOutputPath(finalArgs) : null;
    const startedAt = Date.now();
    let lastProgress = {};
    // D-440: watchdog de job preso. Em 26/07 jobs sem progresso ficaram 9-17h
    // pendurados a noite inteira; sem nenhuma saída do processo por
    // RENDER_WATCHDOG_MIN minutos (default 15), o watchdog mata a árvore e o
    // job vira "erro" retentável em vez de bloquear a fila indefinidamente.
    const watchdogMs =
      Math.max(1, parseInt(process.env.RENDER_WATCHDOG_MIN || "15", 10)) *
      60000;
    let lastActivityAt = Date.now();
    let watchdogDisparado = false;

    const heartbeat = setInterval(() => {
      const elapsed = formatDuration(Date.now() - startedAt);
      const frame = lastProgress.frame ? ` frame=${lastProgress.frame}` : "";
      const time = lastProgress.out_time
        ? ` tempo=${lastProgress.out_time}`
        : "";
      const speed = lastProgress.speed ? ` speed=${lastProgress.speed}` : "";
      console.log(
        `[${clockNow()}] [Exec] Processando há ${elapsed}${frame}${time}${speed}${describeOutputFile(outputPath)}`,
      );
      if (Date.now() - lastActivityAt > watchdogMs && !watchdogDisparado) {
        watchdogDisparado = true;
        console.error(
          `[${clockNow()}] 🛑 [Watchdog] Sem atividade há ${formatDuration(Date.now() - lastActivityAt)} — encerrando processo ${child.pid}.`,
        );
        try {
          if (process.platform === "win32" && child.pid) {
            spawn("taskkill", ["/PID", String(child.pid), "/T", "/F"], {
              stdio: "ignore",
            });
          } else {
            child.kill("SIGKILL");
          }
        } catch (e) {
          console.warn(`⚠️ [Watchdog] Falha ao encerrar: ${e.message}`);
        }
      }
    }, 15000);

    const child = spawn(executable, finalArgs, {
      cwd: cwd || __dirname,
      shell: useShell,
      env: {
        ...process.env,
        FORCE_COLOR: "1",
        NODE_OPTIONS: buildNodeOptions(),
      },
    });
    registrarFilho(child);

    child.stdout.on("data", (data) => {
      lastActivityAt = Date.now();
      const text = data.toString();
      if (isFfmpegCommand) {
        const progress = parseFfmpegProgress(text);
        if (Object.keys(progress).length > 0) {
          // Atualiza o estado para o heartbeat (a cada 15s) — NAO imprime por
          // chunk. Antes saía uma linha [FFmpeg] a cada poucos frames, poluindo
          // o terminal; agora só o heartbeat com horário ([Exec] Processando há)
          // aparece, carregando frame/tempo/speed/output.
          lastProgress = { ...lastProgress, ...progress };
          return;
        }
      }

      if (currentLogLevel === "debug") process.stdout.write(text);
    });
    child.stderr.on("data", (data) => {
      lastActivityAt = Date.now();
      const text = data.toString();
      if (
        currentLogLevel === "debug" ||
        /erro|error|fatal|failed|falha/i.test(text)
      ) {
        process.stdout.write(text.replace(/\r/g, "\n"));
      }
    });

    child.on("error", (err) => {
      clearInterval(heartbeat);
      console.error("Spawn error:", err);
      resolve(-1);
    });

    child.on("close", (code) => {
      clearInterval(heartbeat);
      resolve(code);
    });
  });
}

function parseFfmpegProgress(text) {
  const progress = {};
  for (const line of text.split(/\r?\n/)) {
    const [key, value] = line.split("=");
    if (!key || value === undefined) continue;
    if (["frame", "out_time", "speed", "progress"].includes(key)) {
      progress[key] = value.trim();
    }
  }
  return progress;
}

function findLikelyOutputPath(args) {
  for (let i = args.length - 1; i >= 0; i--) {
    const arg = args[i];
    if (typeof arg !== "string" || arg.startsWith("-")) continue;
    return arg;
  }
  return null;
}

function describeOutputFile(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return " output=ainda nao criado";
  const sizeMb = fs.statSync(filePath).size / (1024 * 1024);
  return ` output=${sizeMb.toFixed(1)}MB`;
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
      fs.writeFileSync(
        path.join(filaDir, `res_${id}.json`),
        JSON.stringify({
          status: "cancelado",
          erro: "Cancelado pelo operador antes de iniciar",
        }),
      );
      console.log(`[${clockNow()}] 🛑 [Cancelamento] ${id}: removido da fila.`);
    }
    removerSeExistir(path.join(filaDir, nome));
  }
  return removidos;
}

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
        if (!overlay && !COMPATIBLE_CATEGORIES[category]) break;
      } catch (err) {
        console.error(`âŒ Erro ao ler a tarefa ${jobFile}:`, err);
        const id = jobFile.replace("req_", "").replace(".json", "");
        const resPath = path.join(filaDir, `res_${id}.json`);
        fs.writeFileSync(
          resPath,
          JSON.stringify({ status: "erro", erro: err.message }),
        );
        if (fs.existsSync(jobPath)) fs.unlinkSync(jobPath);
      }
    }
  } catch (err) {
    console.error("Erro ao ler a fila:", err);
  }
}

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
