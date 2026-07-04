/**
 * Note: When using the Node.JS APIs, the config file
 * doesn't apply. Instead, pass options directly to the APIs.
 *
 * All configuration options: https://remotion.dev/docs/config
 */

import { Config } from "@remotion/cli/config";
import { enableTailwind } from '@remotion/tailwind-v4';
import fs from 'node:fs';
import path from 'node:path';

// D-197: MascotSpotlight gateia o mascote em
// `import.meta.env.VITE_CANAL_MASCOTE_HABILITADO === 'true'`, mas o bundler do
// Remotion (webpack/rspack) NÃO popula `import.meta.env` — isso é sintaxe do
// Vite, válida só no preview do frontend. No render o token virava `undefined`,
// o gate resolvia `false` e o mascote sumia das cenas que usam SÓ MascotSpotlight
// (ex.: CenaPergunta). Aqui, no bundle, definimos o valor real por canal: o canal
// tem mascote quando as poses estão materializadas em `public/mascote`
// (channel_assets_sync). Assim o gate volta a refletir a verdade do canal ativo
// sem tocar no componente travado (remotion-v2-card-contracts).
// O Remotion compila este config para um temp antes de carregar, então
// `__dirname` NÃO aponta para `video-renderer/`. O bundle roda com o cwd na raiz
// do renderer (`video-renderer/`), então resolvemos a pose por `process.cwd()`,
// com fallback em `__dirname` para o caso de execução direta.
// E-011: pasta canônica `mascote/`; o nome legado `sapo/` é aceito como fallback
// para não regredir caches materializados antes da genericização.
const _pastasMascote = ["mascote", "sapo"];
const _candidatosPose = _pastasMascote.flatMap((pasta) => [
  path.join(process.cwd(), "public", pasta, "sapo_pensativo.png"),
  path.join(__dirname, "public", pasta, "sapo_pensativo.png"),
]);
const mascoteHabilitado = _candidatosPose.some((p) => fs.existsSync(p));

Config.setVideoImageFormat("png");
Config.setOverwriteOutput(true);
Config.overrideWebpackConfig((config) => {
  const comTailwind = enableTailwind(config);
  const plugins = comTailwind.plugins ?? [];

  // Reaproveita a MESMA classe DefinePlugin que o Remotion já injetou (define
  // `process.env.*` do Studio) — assim funciona igual em webpack e rspack, sem
  // adivinhar o backend nem importar a classe errada.
  const definePluginExistente = plugins.find(
    (p) => p?.constructor?.name === "DefinePlugin",
  ) as { constructor: new (defs: Record<string, string>) => unknown } | undefined;

  const definicoes = {
    "import.meta.env.VITE_CANAL_MASCOTE_HABILITADO": JSON.stringify(
      mascoteHabilitado ? "true" : "false",
    ),
  };

  const DefinePluginClass = definePluginExistente
    ? definePluginExistente.constructor
    : // Fallback improvável: nenhum DefinePlugin na config → usa o do webpack.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      (require("webpack") as typeof import("webpack")).DefinePlugin;

  return {
    ...comTailwind,
    plugins: [...plugins, new DefinePluginClass(definicoes)],
  };
});
