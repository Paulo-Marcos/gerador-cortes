// Quem pode rodar junto com quem (D-732: saiu do native_worker.js).
const os = require("os");

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

/** Categoria exclusiva (default, render_final): a varredura para depois dela. */
function ehExclusiva(category) {
  return category !== "overlay" && !COMPATIBLE_CATEGORIES[category];
}

/**
 * A agenda de um worker: decide, olhando os jobs ativos, se um novo começa.
 * `activeJobs` é o Map vivo do worker (jobFile -> { overlay, category }).
 */
function criarAgenda(activeJobs) {
  const MAX_PARALLEL_OVERLAYS = Number(process.env.REMOTION_OVERLAY_PARALLEL || "2");

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

  return { canStartJob };
}

module.exports = { COMPATIBLE_CATEGORIES, isOverlayJob, categoryOf, ehExclusiva, criarAgenda };
