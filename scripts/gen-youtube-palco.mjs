// Rasteriza o "palco" (fundo + chrome + molduras + placa) em PNG 1920x1080 via
// Remotion still, com as janelas de vídeo TRANSPARENTES (Variante A da F-020).
// O FFmpeg empilha esse PNG POR CIMA dos vídeos no render final.
//
//   node scripts/gen-youtube-palco.mjs [outPath] [propsJsonPath]
//
// Sem args: gera um PNG de teste com os defaults em .tmp/palco-test.png p/
// inspecionar a transparência antes de plugar no pipeline.
import { execSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, "..");
const renderer = resolve(repo, "video-renderer");
const entry = resolve(renderer, "src/youtube-bg/palco-entry.tsx");

const out = resolve(repo, process.argv[2] ?? ".tmp/palco-test.png");
const propsPath = process.argv[3] ? resolve(repo, process.argv[3]) : null;
mkdirSync(dirname(out), { recursive: true });

const propsArg = propsPath ? ` --props="${propsPath}"` : "";
console.log(`-> ${out}`);
execSync(
  `npx remotion still "${entry}" YoutubePalco "${out}"${propsArg} --image-format=png --log=error`,
  { cwd: renderer, stdio: "inherit" },
);
console.log("Palco PNG gerado.");
