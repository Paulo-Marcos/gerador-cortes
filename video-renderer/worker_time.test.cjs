// Teste das funções puras de formatação de tempo do worker.
// Roda com: node worker_time.test.cjs
const assert = require('node:assert');
const { clockNow, formatDuration } = require('./worker_time.js');

// clockNow: HH:MM:SS zero-padded a partir de um Date fixo.
assert.strictEqual(clockNow(new Date(2024, 5, 15, 14, 32, 1)), '14:32:01');
assert.strictEqual(clockNow(new Date(2024, 0, 1, 9, 5, 7)), '09:05:07');
assert.match(clockNow(), /^\d{2}:\d{2}:\d{2}$/);

// formatDuration: ms -> forma legível, só unidades relevantes.
assert.strictEqual(formatDuration(0), '0s');
assert.strictEqual(formatDuration(-500), '0s');
assert.strictEqual(formatDuration(1000), '1s');
assert.strictEqual(formatDuration(45000), '45s');
assert.strictEqual(formatDuration(60000), '1m 00s');
assert.strictEqual(formatDuration(979000), '16m 19s');
assert.strictEqual(formatDuration(3723000), '1h 02m 03s');
assert.strictEqual(formatDuration(119999), '1m 59s'); // trunca, não arredonda

console.log('worker_time.test.cjs: OK (todas as asserções passaram)');
