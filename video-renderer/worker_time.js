// Formatação de tempo para os logs do native_worker.
// Espelha app/domain/time_convert.py (epoch_to_hora_local / seg_to_duracao_humana)
// para que backend e worker mostrem o mesmo formato no terminal.
// Funções puras — testáveis isoladamente (worker_time.test.cjs).

function clockNow(date = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${p(date.getHours())}:${p(date.getMinutes())}:${p(date.getSeconds())}`;
}

function formatDuration(ms) {
  const total = Math.max(0, Math.floor(Number(ms) / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const p = (n) => String(n).padStart(2, '0');
  if (h > 0) return `${h}h ${p(m)}m ${p(s)}s`;
  if (m > 0) return `${m}m ${p(s)}s`;
  return `${s}s`;
}

module.exports = { clockNow, formatDuration };
