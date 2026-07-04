const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");
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

async function getVideoInfo(filePath) {
  console.log(`🔍 [ffprobe] Contando frames reais de: ${filePath}`);
  if (!filePath || !fs.existsSync(filePath)) {
    throw new Error(`Arquivo não encontrado para ffprobe: ${filePath}`);
  }
  return new Promise((resolve, reject) => {
    // -count_frames força ffprobe a varrer o stream e contar frames DECODIFICÁVEIS reais.
    // nb_read_frames é a verdade — nb_frames do header mente em alguns MP4s.
    const child = spawn(
      "ffprobe",
      [
        "-v",
        "error",
        "-count_frames",
        "-select_streams",
        "v:0",
        "-show_entries",
        "stream=duration,nb_read_frames,r_frame_rate",
        "-of",
        "json",
        filePath,
      ],
      { shell: true },
    );

    let output = "";
    let errorOutput = "";

    child.stdout.on("data", (data) => (output += data.toString()));
    child.stderr.on("data", (data) => (errorOutput += data.toString()));

    child.on("close", (code) => {
      if (code !== 0) {
        console.error(`❌ [ffprobe] Erro (code ${code}): ${errorOutput}`);
        return reject(
          new Error(`ffprobe falhou (code ${code}): ${errorOutput}`),
        );
      }
      try {
        const data = JSON.parse(output);
        const stream = (data.streams && data.streams[0]) || {};
        const duration = parseFloat(stream.duration);
        const realFrames = parseInt(stream.nb_read_frames, 10);
        let fps = 30;
        if (stream.r_frame_rate) {
          const [num, den] = stream.r_frame_rate.split("/").map(Number);
          if (num && den) fps = num / den;
        }
        console.log(
          `⏱️ [ffprobe] Duração: ${duration}s | Frames decodificáveis: ${realFrames} | FPS: ${fps.toFixed(2)}`,
        );
        resolve({ duration, realFrames, fps });
      } catch (e) {
        reject(new Error(`Falha ao parsear saída do ffprobe: ${e.message}`));
      }
    });
  });
}

// Mantém getVideoDuration para compatibilidade
async function getVideoDuration(filePath) {
  const info = await getVideoInfo(filePath);
  return info.duration;
}

function mergeIntervals(intervals) {
  if (intervals.length === 0) return [];
  intervals.sort((a, b) => a[0] - b[0]);
  const merged = [intervals[0]];
  for (let i = 1; i < intervals.length; i++) {
    const last = merged[merged.length - 1];
    const curr = intervals[i];
    // Se houver sobreposição ou gap muito pequeno (< 1s), une para evitar overhead de processos
    if (curr[0] <= last[1] + 1.0) {
      last[1] = Math.max(last[1], curr[1]);
    } else {
      merged.push(curr);
    }
  }
  return merged;
}

async function checkFila() {
  if (isProcessing) return;

  try {
    const files = fs.readdirSync(filaDir);
    // Procura arquivos de requisição (req_*.json)
    const reqFiles = files.filter(
      (f) => f.startsWith("req_") && f.endsWith(".json"),
    );

    if (reqFiles.length > 0) {
      isProcessing = true;
      const jobFile = reqFiles[0];
      const jobPath = path.join(filaDir, jobFile);

      console.log(`\n📦 Encontrada nova tarefa: ${jobFile}`);

      try {
        const jobData = JSON.parse(fs.readFileSync(jobPath, "utf8"));
        await processJob(jobData, jobFile);
      } catch (err) {
        console.error(`❌ Erro ao ler a tarefa ${jobFile}:`, err);
        // Em caso de erro de parse, cria resposta de erro para não travar o backend
        const id = jobFile.replace("req_", "").replace(".json", "");
        const resPath = path.join(filaDir, `res_${id}.json`);
        fs.writeFileSync(
          resPath,
          JSON.stringify({ status: "erro", erro: err.message }),
        );
        fs.unlinkSync(jobPath); // Deleta a requisição original com problema
      } finally {
        isProcessing = false;
      }
    }
  } catch (err) {
    console.error("Erro ao ler a fila:", err);
  }
}

async function processJob(jobData, jobFile) {
  configureLogLevel(jobData.log_level || jobData.logLevel);
  const { id, cmd, cwd } = jobData;
  const resPath = path.join(filaDir, `res_${id}.json`);
  const reqPath = path.join(filaDir, jobFile);
  const jobStartedAt = Date.now();

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

    // 3. Inteligência para Remotion (Smart Segmented Render + Auto MKV)
    const isMainRender = translatedCmd[4] === "CenaYouTube";
    console.log(
      `🎬 [Remotion] Tipo de render: ${isMainRender ? "PRINCIPAL (CenaYouTube)" : "OVERLAY/OUTRO (" + translatedCmd[4] + ")"}`,
    );

    if (isRemotion && isMainRender) {
      const propsIndex = translatedCmd.indexOf("--props");
      const outputFile = translatedCmd[5];
      const propsPath = translatedCmd[propsIndex + 1];

      if (propsPath && fs.existsSync(propsPath)) {
        const props = JSON.parse(fs.readFileSync(propsPath, "utf8"));

        if (!props.cenas || !Array.isArray(props.cenas)) {
          console.log(
            `⚠️ [Debug] props.cenas não é um array ou está ausente. Puxando padrão []`,
          );
          props.cenas = [];
        }
        console.log(
          `🔍 [Debug] Total de cenas encontradas: ${props.cenas.length}`,
        );

        // --- 3a. Auto-Detecção de Fonte (Priorizar clip_filtered) ---
        // outputFile: .../corte_id/upload_ready/video.mp4
        const corteDir = path.dirname(path.dirname(outputFile));
        console.log(`📂 [Debug] Procurando fontes em: ${corteDir}`);

        if (fs.existsSync(corteDir)) {
          const files = fs.readdirSync(corteDir);
          console.log(`   📄 Arquivos na pasta: ${files.join(", ")}`);
        }

        const possibleFiltered = [
          path.join(corteDir, "clip_filtered.mp4"),
          path.join(corteDir, "clip_filtered.mkv"),
          path.join(corteDir, "clip_raw.mp4"),
          path.join(corteDir, "clip_raw.mkv"),
        ];

        let absoluteSource = "";
        for (const p of possibleFiltered) {
          console.log(`   🔍 Checando: ${path.basename(p)} ...`);
          if (fs.existsSync(p)) {
            absoluteSource = p;
            console.log(`   ✅ ENCONTRADO: ${path.basename(p)}`);
            break;
          }
        }

        // Se não achou na pasta do corte, tenta pelo videoUrl das props (fallback)
        if (
          !absoluteSource &&
          props.videoUrl &&
          props.videoUrl.includes("/videos/")
        ) {
          const inputPath = props.videoUrl
            .split("/videos/")[1]
            .split("/")
            .join(path.sep);
          absoluteSource = path.join(projetosDir, inputPath);
          console.log(`   ℹ️ Usando fallback via videoUrl: ${absoluteSource}`);
        }

        if (absoluteSource) {
          // Detecção Real de Formato (MKV vs MP4)
          const formatData = await runCommandOutput(
            "ffprobe",
            [
              "-v",
              "error",
              "-show_entries",
              "format=format_name",
              "-of",
              "default=noprint_wrappers=1:nokey=1",
              absoluteSource,
            ],
            finalCwd,
            shellPath,
          );
          const isActuallyMkv = formatData.includes("matroska");

          if (isActuallyMkv || absoluteSource.toLowerCase().endsWith(".mkv")) {
            console.log(
              `⚠️ [Auto-Fix] Container MKV detectado. Convertendo para MP4...`,
            );
            const absoluteMp4 = absoluteSource.replace(/\.[^.]+$/, ".mp4");
            if (!fs.existsSync(absoluteMp4)) {
              await runCommand(
                "ffmpeg",
                ["-i", absoluteSource, "-c", "copy", "-y", absoluteMp4],
                finalCwd,
                shellPath,
              );
              console.log(
                `   ✅ Conversão concluída: ${path.basename(absoluteMp4)}`,
              );
            }
            absoluteSource = absoluteMp4;
          }

          // Remotion OffthreadVideo só aceita http:// ou https://, nunca file://.
          // Reconstrói a URL HTTP a partir do caminho absoluto detectado.
          const relativePath = absoluteSource
            .replace(projetosDir + path.sep, "")
            .replace(/\\/g, "/");
          props.videoUrl = `http://localhost:8000/videos/${relativePath}`;

          console.log(
            `🚀 [SmartRender] Remotion usará (HTTP): ${props.videoUrl}`,
          );
          fs.writeFileSync(propsPath, JSON.stringify(props, null, 2));
        }

        // --- 3b. Smart Segmented Rendering ---
        const videoInfo = await getVideoInfo(absoluteSource);
        const totalDuration = videoInfo.duration;
        const fps = 30;
        // Verdade absoluta: realFrames é o que ffprobe conseguiu DECODIFICAR.
        // Margem de -2 frames protege contra ainda haver drift no compositor por seek de tempo.
        const framesFromDuration = Math.floor(totalDuration * fps);
        const reportedFrames =
          Number.isFinite(videoInfo.realFrames) && videoInfo.realFrames > 0
            ? videoInfo.realFrames
            : framesFromDuration;
        const totalFrames = Math.max(1, reportedFrames - 2);
        console.log(
          `📐 [SmartRender] Frames seguros para render: ${totalFrames} (decodificáveis=${reportedFrames}, dur*fps=${framesFromDuration})`,
        );
        const getSceneStart = (c) => {
          const value = Number(c?.inicio_seg ?? c?.inicio ?? 0);
          return Number.isFinite(value) ? value : 0;
        };
        const getSceneEnd = (c) => {
          const start = getSceneStart(c);
          const value = Number(c?.fim_seg ?? c?.fim ?? start + 5);
          return Number.isFinite(value) && value > start ? value : start + 5;
        };
        const activeIntervals = mergeIntervals(
          (props.cenas || []).map((c) => {
            const bufferEnd =
              c.tipo && (c.tipo.includes("zoom") || c.tipo.includes("rosto"))
                ? 3.0
                : 0;
            return [
              Math.max(0, getSceneStart(c) - 0.5),
              getSceneEnd(c) + bufferEnd + 0.5,
            ];
          }),
        );

        const dynamicDuration = activeIntervals.reduce(
          (acc, interval) => acc + (interval[1] - interval[0]),
          0,
        );
        const percentDynamic = (dynamicDuration / totalDuration) * 100;

        console.log(
          `📊 [SmartRender] Duração total: ${totalDuration.toFixed(1)}s | Dinâmica: ${dynamicDuration.toFixed(1)}s (${percentDynamic.toFixed(1)}%)`,
        );

        // Ativamos a renderização inteligente sempre que houver trechos sem edição (gaps)
        if (percentDynamic < 100 && activeIntervals.length > 0) {
          console.log(
            `🚀 [SmartRender] Ativando renderização segmentada (audio-continuous + uniform encode)`,
          );

          const tempDir = path.join(
            path.dirname(outputFile),
            `temp_render_${id}`,
          );
          if (!fs.existsSync(tempDir))
            fs.mkdirSync(tempDir, { recursive: true });

          // Params de encode IDÊNTICOS para STATIC e DYNAMIC (mesmos de clip_filtered.mp4):
          // mesmo SPS/PPS, mesma estrutura de GOP e zero B-frames → concat sem
          // troca de parameter set no boundary, sem stutter visual.
          const VIDEO_ENCODE_ARGS = [
            "-c:v",
            "libx264",
            "-preset",
            "veryfast",
            "-tune",
            "film",
            "-crf",
            "20",
            "-pix_fmt",
            "yuv420p",
            "-fps_mode",
            "cfr",
            "-r",
            "30",
            "-g",
            "30",
            "-keyint_min",
            "30",
            "-sc_threshold",
            "0",
            "-bf",
            "0",
          ];

          // 1. Áudio contínuo: extraído UMA vez do source. Evita o priming de
          // ~21ms que cada AAC encode insere — origem do clique audível em
          // cada junção quando o áudio é segmentado.
          const audioFullPath = path.join(tempDir, "audio_full.m4a");
          console.log(`🎵 [SmartRender] Extraindo áudio contínuo do source...`);
          const codeAudioExtract = await runCommand(
            "ffmpeg",
            [
              "-y",
              "-i",
              absoluteSource,
              "-vn",
              "-c:a",
              "aac",
              "-b:a",
              "192k",
              "-ar",
              "48000",
              "-movflags",
              "+faststart",
              audioFullPath,
            ],
            finalCwd,
            shellPath,
          );
          if (codeAudioExtract !== 0)
            throw new Error(
              `Falha ao extrair áudio contínuo (code ${codeAudioExtract})`,
            );

          const segments = [];
          let lastTime = 0;

          for (const interval of activeIntervals) {
            const start = Math.max(0, Math.min(totalDuration, interval[0]));
            const end = Math.max(start, Math.min(totalDuration, interval[1]));

            if (start > lastTime) {
              segments.push({ type: "STATIC", start: lastTime, end: start });
            }
            if (end > start) {
              segments.push({ type: "DYNAMIC", start: start, end: end });
            }
            lastTime = end;
          }
          if (lastTime < totalDuration) {
            segments.push({
              type: "STATIC",
              start: lastTime,
              end: totalDuration,
            });
          }

          const parts = [];

          for (let i = 0; i < segments.length; i++) {
            const seg = segments[i];
            const partName = `part_${i.toString().padStart(3, "0")}`;
            const partTs = path.join(tempDir, `${partName}.ts`);
            const dur = seg.end - seg.start;

            if (seg.type === "STATIC") {
              console.log(
                `⚡ [SmartRender] Segmento ${i + 1}/${segments.length}: STATIC re-encode (${seg.start.toFixed(1)}s -> ${seg.end.toFixed(1)}s)`,
              );
              // -ss APÓS -i = output seek frame-accurate (decoda do keyframe
              // anterior e descarta até o tempo exato). -c:v copy seria mais
              // rápido, mas snap pra keyframe → drift de até 0.5s no boundary.
              // -an: áudio é muxado uma única vez ao final, jamais segmentado.
              const codeStatic = await runCommand(
                "ffmpeg",
                [
                  "-y",
                  "-i",
                  absoluteSource,
                  "-ss",
                  seg.start.toString(),
                  "-t",
                  dur.toString(),
                  "-an",
                  ...VIDEO_ENCODE_ARGS,
                  "-f",
                  "mpegts",
                  partTs,
                ],
                finalCwd,
                shellPath,
              );
              if (codeStatic !== 0)
                throw new Error(
                  `Falha STATIC re-encode segmento ${i} (code ${codeStatic})`,
                );
            } else {
              const partMp4 = path.join(tempDir, `${partName}.mp4`);
              const startFrame = Math.floor(seg.start * fps);
              const endFrame = Math.min(Math.floor(seg.end * fps), totalFrames);

              const segmentPropsPath = path.join(
                tempDir,
                `props_${partName}.json`,
              );
              const segmentProps = {
                ...props,
                renderStartFrame: startFrame,
                renderEndFrame: endFrame,
              };
              fs.writeFileSync(segmentPropsPath, JSON.stringify(segmentProps));

              const remotionBin = path.join(
                __dirname,
                "node_modules",
                ".bin",
                "remotion.cmd",
              );
              const useBin = fs.existsSync(remotionBin) ? remotionBin : "npx";
              const baseArgs =
                useBin === "npx" ? ["remotion", "render"] : ["render"];

              const remotionArgs = [
                ...baseArgs,
                "src/index.ts",
                "CenaYouTube",
                partMp4,
                "--props",
                segmentPropsPath,
                "--concurrency",
                "12",
                "--codec=h264",
                // Áudio é muxado de audio_full.m4a no fim do pipeline.
                // Pular renderização do áudio aqui economiza tempo e evita
                // o duplo AAC-encode que originalmente causava o clique.
                "--muted",
                "--overwrite",
                "--log=info",
                ...translatedCmd
                  .slice(propsIndex + 2)
                  .filter(
                    (a) =>
                      !a.includes("--start-frame") &&
                      !a.includes("--end-frame") &&
                      !a.includes("--codec") &&
                      !a.includes("--concurrency") &&
                      !a.includes("--overwrite") &&
                      !a.includes("--log") &&
                      !a.includes("--props") &&
                      !a.includes("--muted"),
                  ),
              ];

              console.log(
                `🎨 [SmartRender] Segmento ${i + 1}/${segments.length}: DYNAMIC Remotion (${seg.start.toFixed(1)}s -> ${seg.end.toFixed(1)}s | frames ${startFrame}-${endFrame})`,
              );
              console.log(
                `🔍 [SmartRender] Injetando ${segmentProps.cenas.length} cenas no segmento ${i}`,
              );
              const code = await runCommand(
                useBin,
                remotionArgs,
                finalCwd,
                shellPath,
              );
              if (code !== 0)
                throw new Error(
                  `Falha no Remotion para o segmento ${i} (code ${code})`,
                );

              // Re-encoda DYNAMIC com OS MESMOS params do STATIC para que o
              // concat seja transparente — sem mudança de SPS/PPS no boundary.
              const codeTs = await runCommand(
                "ffmpeg",
                [
                  "-y",
                  "-i",
                  partMp4,
                  "-an",
                  ...VIDEO_ENCODE_ARGS,
                  "-f",
                  "mpegts",
                  partTs,
                ],
                finalCwd,
                shellPath,
              );

              if (codeTs !== 0)
                throw new Error(`Falha na conversão para TS do segmento ${i}`);

              if (fs.existsSync(partMp4)) fs.unlinkSync(partMp4);
              if (fs.existsSync(segmentPropsPath))
                fs.unlinkSync(segmentPropsPath);
            }
            parts.push(partTs);
          }

          // 2. Concatena somente os segmentos de vídeo. Como todos têm SPS/PPS
          // idênticos, -c copy é seguro e instantâneo.
          console.log(
            `🔗 [SmartRender] Concatenando ${parts.length} segmentos de vídeo...`,
          );
          const concatList = parts
            .map((f) => `file '${path.resolve(f).replace(/\\/g, "/")}'`)
            .join("\n");
          const listFile = path.join(tempDir, "list.txt");
          fs.writeFileSync(listFile, concatList);

          const videoOnlyTs = path.join(tempDir, "video_only.ts");
          const codeConcatVideo = await runCommand(
            "ffmpeg",
            [
              "-y",
              "-fflags",
              "+genpts",
              "-f",
              "concat",
              "-safe",
              "0",
              "-i",
              listFile,
              "-c",
              "copy",
              videoOnlyTs,
            ],
            finalCwd,
            shellPath,
          );
          if (codeConcatVideo !== 0)
            throw new Error(`Falha na concat de vídeo`);

          // 3. Mux do vídeo concatenado com o áudio contínuo. Áudio nunca foi
          // recortado por segmento → zero clicks na junção.
          console.log(
            `🎚️ [SmartRender] Muxando vídeo + áudio contínuo no output final...`,
          );
          const codeMux = await runCommand(
            "ffmpeg",
            [
              "-y",
              "-i",
              videoOnlyTs,
              "-i",
              audioFullPath,
              "-map",
              "0:v:0",
              "-map",
              "1:a:0",
              "-c",
              "copy",
              "-shortest",
              "-movflags",
              "+faststart",
              outputFile,
            ],
            finalCwd,
            shellPath,
          );
          if (codeMux !== 0)
            throw new Error(
              `Falha no mux final de vídeo + áudio (code ${codeMux})`,
            );

          try {
            parts.forEach((f) => {
              if (fs.existsSync(f)) fs.unlinkSync(f);
            });
            if (fs.existsSync(listFile)) fs.unlinkSync(listFile);
            if (fs.existsSync(videoOnlyTs)) fs.unlinkSync(videoOnlyTs);
            if (fs.existsSync(audioFullPath)) fs.unlinkSync(audioFullPath);
            if (fs.existsSync(tempDir))
              fs.rmSync(tempDir, { recursive: true, force: true });
          } catch (e) {
            console.warn(`⚠️ Erro na limpeza: ${e.message}`);
          }

          console.log(
            `[${clockNow()}] ✅ [SmartRender] Tarefa ${id} concluída em ${formatDuration(Date.now() - jobStartedAt)} (sem stutter, audio-continuous).`,
          );
          fs.writeFileSync(resPath, JSON.stringify({ status: "sucesso" }));
          if (fs.existsSync(reqPath)) fs.unlinkSync(reqPath);
          return;
        }
      }
    }

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
      fs.writeFileSync(resPath, JSON.stringify({ status: "sucesso" }));
    } else {
      console.error(
        `[${clockNow()}] ❌ [Erro] Falha na tarefa ${id} após ${duracaoJob}. Código: ${code}`,
      );
      fs.writeFileSync(
        resPath,
        JSON.stringify({ status: "erro", erro: `Exit code: ${code}` }),
      );
    }

    if (fs.existsSync(reqPath)) fs.unlinkSync(reqPath);
  } catch (err) {
    console.error(
      `[${clockNow()}] ❌ [Fatal] Erro na tarefa ${id} após ${formatDuration(Date.now() - jobStartedAt)}:`,
      err,
    );
    fs.writeFileSync(
      resPath,
      JSON.stringify({ status: "erro", erro: err.message }),
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

    child.stdout.on("data", (data) => {
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
 * Helper para rodar comandos e capturar o output (sem logar no terminal)
 */
function runCommandOutput(command, args, cwd, shell) {
  return new Promise((resolve) => {
    const useShell = typeof shell === "boolean" ? shell : true;
    const child = spawn(command, args, {
      cwd: cwd || __dirname,
      shell: useShell,
    });

    let output = "";
    child.stdout.on("data", (data) => (output += data.toString()));
    child.on("close", () => resolve(output.trim()));
  });
}

async function checkFilaParallel() {
  try {
    const files = fs.readdirSync(filaDir);
    const reqFiles = files.filter(
      (f) => f.startsWith("req_") && f.endsWith(".json"),
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
