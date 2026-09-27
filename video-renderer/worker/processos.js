// Os processos filhos dos jobs: rodar, acompanhar e encerrar
// (D-732: saiu do native_worker.js).
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const { AsyncLocalStorage } = require("node:async_hooks");
const { clockNow, formatDuration } = require("../worker_time.js");
const { buildNodeOptions } = require("./ambiente.js");
const { nivelDeLog } = require("./log.js");

const RENDERER_DIR = path.resolve(__dirname, "..");
const LINHAS_DE_ERRO_NA_RESPOSTA = 40;

// O id do job viaja por AsyncLocalStorage em vez de parâmetro: `runCommand`
// tem 8 pontos de chamada e jobs rodam em paralelo, então uma variável de
// módulo apontaria para o job errado.
const jobContext = new AsyncLocalStorage();
const filhosPorJob = new Map();

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

/** Roda `fn` com o id do job amarrado ao contexto assíncrono. */
function comJob(id, fn) {
  return jobContext.run({ id }, fn);
}

function esquecerFilhos(id) {
  filhosPorJob.delete(id);
}

function jobsComFilhos() {
  return [...filhosPorJob.keys()];
}

/**
 * D-641: resolve `{ code, stderrTail }` em vez de só o código.
 *
 * O `res_` levava apenas "Exit code: 1" e o motivo real (a linha do ffmpeg ou
 * do Remotion dizendo O QUE quebrou) ficava no console do worker. Quem via o
 * erro na tela não via a causa; quem via a causa era quem tinha o terminal
 * aberto na hora. As últimas linhas do stderr viajam junto com a resposta.
 */
function runCommand(command, args, cwd, shell) {
  return new Promise((resolve) => {
    const ultimasLinhasDeErro = [];
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
        RENDERER_DIR,
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
      cwd: cwd || RENDERER_DIR,
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

      if (nivelDeLog() === "debug") process.stdout.write(text);
    });
    child.stderr.on("data", (data) => {
      lastActivityAt = Date.now();
      const text = data.toString();
      // Guarda as últimas linhas para a resposta (D-641). O ffmpeg é tagarela:
      // o que interessa está sempre no FIM, não no começo.
      for (const linha of text.split(/\r?\n/)) {
        const limpa = linha.trim();
        if (!limpa) continue;
        ultimasLinhasDeErro.push(limpa);
        if (ultimasLinhasDeErro.length > LINHAS_DE_ERRO_NA_RESPOSTA) {
          ultimasLinhasDeErro.shift();
        }
      }
      if (
        nivelDeLog() === "debug" ||
        /erro|error|fatal|failed|falha/i.test(text)
      ) {
        process.stdout.write(text.replace(/\r/g, "\n"));
      }
    });

    child.on("error", (err) => {
      clearInterval(heartbeat);
      console.error("Spawn error:", err);
      resolve({ code: -1, stderrTail: err.message });
    });

    child.on("close", (code) => {
      clearInterval(heartbeat);
      resolve({ code, stderrTail: ultimasLinhasDeErro.join("\n") });
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

module.exports = {
  comJob,
  matarFilhos,
  esquecerFilhos,
  jobsComFilhos,
  runCommand,
};
