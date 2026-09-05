// Rasteriza a CAPA VERTICAL do TikTok em PNG 1080x1920 via Remotion still
// (D-519).
//
//   node scripts/gen-capa-tiktok.mjs [outPath] [propsJsonPath]
//
// Sem args: gera uma capa de teste com os defaults em .tmp/capa-tiktok-test.png,
// para conferir tipografia e o quadrado seguro antes de plugar no backend.
//
// Espelha `gen-short-palco.mjs` de propósito: o backend é dono do caminho de
// saída e da geometria, e o gerador só recebe onde escrever.
import { execSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, "..");
const renderer = resolve(repo, "video-renderer");
const entry = resolve(renderer, "src/youtube-bg/capa-tiktok-entry.tsx");

const out = resolve(repo, process.argv[2] ?? ".tmp/capa-tiktok-test.png");
const propsPath = process.argv[3] ? resolve(repo, process.argv[3]) : null;
mkdirSync(dirname(out), { recursive: true });

const propsArg = propsPath ? ` --props="${propsPath}"` : "";
console.log(`-> ${out}`);

// D-529: `stdio: "inherit"` engolia o motivo da falha.
//
// Com inherit, o erro que o execSync levanta traz `stdout`/`stderr` nulos — e a
// unica coisa que chegava ao log do backend era o stack trace do Node dizendo
// "Command failed", sem uma palavra do Remotion. Numa falha intermitente isso
// e o pior dos mundos: o operador ve "falhou, veja o log" e o log tambem nao
// sabe. Capturando, o motivo real viaja junto.
try {
  execSync(
    `npx remotion still "${entry}" CapaTikTok "${out}"${propsArg} --image-format=png --log=error`,
    { cwd: renderer, stdio: ["ignore", "pipe", "pipe"] },
  );
} catch (erro) {
  const saida = [erro.stdout?.toString(), erro.stderr?.toString()]
    .filter(Boolean)
    .join("\n")
    .trim();
  console.error(saida || "O Remotion falhou sem escrever nada na saida.");
  process.exit(erro.status ?? 1);
}
console.log("Capa do TikTok gerada.");
