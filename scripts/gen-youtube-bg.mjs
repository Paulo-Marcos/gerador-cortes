// Gera os 6 PNGs de fundo editorial (1920x1080) via Remotion still.
// Saída: backend/assets/youtube_bg/<fundo>.png — usados pelo FFmpeg no
// render final do layout compartilhado. Re-rode após mudar os backgrounds.
//
//   node scripts/gen-youtube-bg.mjs
import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, "..");
const renderer = resolve(repo, "video-renderer");
const entry = resolve(renderer, "src/youtube-bg/still-entry.tsx");
const outDir = resolve(repo, "backend/assets/youtube_bg");
mkdirSync(outDir, { recursive: true });

const fundos = [
  "hud-forte",
  "topo-estrutural",
  "hud-topo",
  "architectural-hud",
  "topographic",
  "cosmograph",
];

const propsFile = resolve(outDir, "_props.json");
try {
  for (const fundo of fundos) {
    const out = resolve(outDir, `${fundo}.png`);
    writeFileSync(propsFile, JSON.stringify({ fundo }));
    console.log(`-> ${fundo}`);
    execSync(
      `npx remotion still "${entry}" YoutubeBg "${out}" --props="${propsFile}" --image-format=png --log=error`,
      { cwd: renderer, stdio: "inherit" },
    );
  }
} finally {
  rmSync(propsFile, { force: true });
}
console.log("PNGs gerados em backend/assets/youtube_bg/");
