// O que o worker escreve, no console e no worker_debug.log de cada job
// (D-732: saiu do native_worker.js).
const fs = require("fs");
const path = require("path");
const { inteiroDoAmbiente } = require("./ambiente.js");

const originalConsole = {
  log: console.log.bind(console),
  info: console.info.bind(console),
  debug: console.debug.bind(console),
  warn: console.warn.bind(console),
  error: console.error.bind(console),
};

// O nível vem do banco de settings do backend (D-699): cada job traz o dele, e o
// da partida chega por ambiente, entregue por quem sobe o worker (dev.ps1). Antes
// era lido do app_settings.json, um espelho que o backend deixou de escrever —
// ler um arquivo que ninguém atualiza devolveria um nível velho.
function readConfiguredLogLevel() {
  return normalizeLogLevel(process.env.WORKER_LOG_LEVEL);
}

function normalizeLogLevel(level) {
  return ["disabled", "info", "debug"].includes(level) ? level : "disabled";
}

let currentLogLevel = readConfiguredLogLevel();

function configureLogLevel(level) {
  currentLogLevel = normalizeLogLevel(level || readConfiguredLogLevel());
}

function nivelDeLog() {
  return currentLogLevel;
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

/** Troca os métodos do console pelos que respeitam o nível do job. */
function instalarConsoleFiltrado() {
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
}

// D-644: o `worker_debug.log` crescia para sempre (o da raiz do renderer passou
// de 2 MB). Ao chegar no teto ele vira `.1` e recomeça — uma geração só, que é
// o suficiente para investigar o último incidente. O teto fica MUITO acima do
// log de um short (poucos KB por passo), que a tela lê inteiro (D-568): lá a
// rotação nunca acontece e nenhuma duração some.
//
// Lido na primeira anotação, e não no require: assim um valor inválido avisa
// pelo console já filtrado, como fazia quando isto morava no native_worker.
let tetoDoLogDoJob = null;
function tetoDoLog() {
  if (tetoDoLogDoJob === null) {
    tetoDoLogDoJob = inteiroDoAmbiente("WORKER_LOG_MAX_BYTES", 5 * 1024 * 1024, 1);
  }
  return tetoDoLogDoJob;
}

function anotarNoLogDoJob(dir, texto) {
  const destino = path.join(dir, "worker_debug.log");
  try {
    if (fs.statSync(destino).size >= tetoDoLog()) {
      fs.renameSync(destino, `${destino}.1`);
    }
  } catch (e) {}
  try {
    fs.appendFileSync(destino, texto);
  } catch (e) {}
}

module.exports = {
  configureLogLevel,
  nivelDeLog,
  instalarConsoleFiltrado,
  anotarNoLogDoJob,
};
