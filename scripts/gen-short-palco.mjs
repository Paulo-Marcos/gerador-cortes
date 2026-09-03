// Rasteriza o palco do SHORT (fundo + chrome + molduras) em PNG 1080x1920 via
// Remotion still, com as janelas de vídeo TRANSPARENTES. O FFmpeg empilha esse
// PNG POR CIMA do vídeo composto (E-038, D-508).
//
//   node scripts/gen-short-palco.mjs [outPath] [propsJsonPath]
//
// Sem args: gera um PNG de teste com os defaults em .tmp/palco-short-test.png,
// para inspecionar a transparência antes de plugar no pipeline.
//
// Espelha `gen-youtube-palco.mjs` de propósito: o backend é dono da chave de
// cache e do caminho de saída, e o gerador só recebe onde escrever — mesma
// divisão que evita hash divergente entre Python e JS.
import { execSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, "..");
const renderer = resolve(repo, "video-renderer");
const entry = resolve(renderer, "src/youtube-bg/palco-short-entry.tsx");

const out = resolve(repo, process.argv[2] ?? ".tmp/palco-short-test.png");
const propsPath = process.argv[3] ? resolve(repo, process.argv[3]) : null;
mkdirSync(dirname(out), { recursive: true });

const propsArg = propsPath ? ` --props="${propsPath}"` : "";
console.log(`-> ${out}`);
execSync(
  `npx remotion still "${entry}" ShortPalco "${out}"${propsArg} --image-format=png --log=error`,
  { cwd: renderer, stdio: "inherit" },
);
console.log("Palco do short gerado.");
