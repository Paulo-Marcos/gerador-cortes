// Regrava os contratos gerados a partir do schema zod do renderer (D-725).
// Uso (em video-renderer/): node --no-warnings protocol/gerar-contratos.mjs
import { writeFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { fileURLToPath } from "node:url";

// O src/ importa sem extensão (resolução de bundler); o Node exige a extensão.
registerHooks({
  resolve(especificador, contexto, proximo) {
    if (especificador.startsWith(".") && !/\.[cm]?[jt]sx?$/.test(especificador)) {
      try {
        return proximo(`${especificador}.ts`, contexto);
      } catch {
        // não era um .ts — segue a resolução normal
      }
    }
    return proximo(especificador, contexto);
  },
});

const { cenaEmJsonSchema } = await import("../src/contrato-cena.ts");

const destino = fileURLToPath(new URL("./cena.schema.json", import.meta.url));
writeFileSync(destino, JSON.stringify(cenaEmJsonSchema(), null, 2) + "\n");
console.log("gravado", destino);
