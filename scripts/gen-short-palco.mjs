// Rasteriza o palco do SHORT (fundo + chrome + molduras) em PNG 1080x1920 via
// Remotion still, com as janelas de vídeo TRANSPARENTES. O FFmpeg empilha esse
// PNG POR CIMA do vídeo composto (E-038, D-508).
//
//   node scripts/gen-short-palco.mjs [outPath] [propsJsonPath] [pacoteDir]
//
// Sem args: gera um PNG de teste com os defaults em .tmp/palco-short-test.png,
// para inspecionar a transparência antes de plugar no pipeline.
//
// Espelha `gen-youtube-palco.mjs` de propósito: o backend é dono da chave de
// cache e do caminho de saída, e o gerador só recebe onde escrever — mesma
// divisão que evita hash divergente entre Python e JS.
//
// D-964: com `pacoteDir`, o still sai do pacote do webpack já montado; se ele
// falta, monta antes (uma vez por versão do renderer). Sem isso, cada PNG
// reempacotava o palco: 60 s de webpack para menos de 1 s de captura (D-963).
import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, renameSync, rmSync, statSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, "..");
const renderer = resolve(repo, "video-renderer");
const entry = resolve(renderer, "src/youtube-bg/palco-short-entry.tsx");

const out = resolve(repo, process.argv[2] ?? ".tmp/palco-short-test.png");
const propsPath = process.argv[3] ? resolve(repo, process.argv[3]) : null;
const pacote = process.argv[4] ? resolve(repo, process.argv[4]) : null;
mkdirSync(dirname(out), { recursive: true });

// Monta numa pasta temporária e só então troca: um node morto no meio do
// webpack não deixa pacote pela metade com cara de pronto. O backend garante
// que só um node monta por vez; os pacotes de versões antigas saem aqui.
function montarPacote(destino) {
  const temporario = `${destino}.tmp-${process.pid}`;
  rmSync(temporario, { recursive: true, force: true });
  mkdirSync(dirname(destino), { recursive: true });
  execSync(`npx remotion bundle "${entry}" --out-dir="${temporario}" --log=error`, {
    cwd: renderer,
    stdio: "inherit",
  });
  rmSync(destino, { recursive: true, force: true });
  renameSync(temporario, destino);
  apagarPacotesAntigos(destino);
}

// Guarda o pacote anterior: o fingerprint muda com o canal, e um still de outro
// render pode estar lendo dele agora. Limpeza é faxina: arquivo preso no Windows
// não pode derrubar o PNG que acabou de ganhar pacote.
const PACOTES_ANTERIORES_GUARDADOS = 1;

function apagarPacotesAntigos(destino) {
  const raiz = dirname(destino);
  const antigos = readdirSync(raiz)
    .filter((nome) => nome !== basename(destino))
    .map((nome) => ({ caminho: join(raiz, nome), temporario: nome.includes(".tmp-") }))
    .map((item) => ({ ...item, idade: statSync(item.caminho).mtimeMs }))
    .sort((a, b) => b.idade - a.idade);
  const guardados = antigos.filter((item) => !item.temporario).slice(0, PACOTES_ANTERIORES_GUARDADOS);
  for (const item of antigos) {
    if (guardados.includes(item)) continue;
    try {
      rmSync(item.caminho, { recursive: true, force: true, maxRetries: 3 });
    } catch (erro) {
      console.warn(`pacote antigo nao apagado (${item.caminho}): ${erro.message}`);
    }
  }
}

let fonte = entry;
if (pacote) {
  if (!existsSync(join(pacote, "index.html"))) {
    montarPacote(pacote);
  }
  fonte = pacote;
}

const propsArg = propsPath ? ` --props="${propsPath}"` : "";
console.log(`-> ${out}`);
execSync(
  `npx remotion still "${fonte}" ShortPalco "${out}"${propsArg} --image-format=png --log=error`,
  { cwd: renderer, stdio: "inherit" },
);
console.log("Palco do short gerado.");
