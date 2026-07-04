import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const rendererDir = path.join(repoRoot, "video-renderer");
const outDir = path.join(tmpdir(), "gerador-cortes-remotion-card-contracts");
const npxBin = process.platform === "win32" ? "npx.cmd" : "npx";
const frame = "45";
const minPngBytes = 2500;

const base = {
  inicio: 0,
  fim: 5,
  sombra_nivel: "media",
};

const scenarios = [
  scene("tela_cheia-padrao", {
    ...base,
    tipo: "tela_cheia",
    texto: "Pensar a totalidade",
    subtexto: "A filosofia como visao do todo",
    modelo_cena: "padrao",
  }),
  scene("tela_cheia-default-card", {
    ...base,
    tipo: "tela_cheia",
    texto: "Pensar a totalidade",
    subtexto: "A filosofia como visao do todo",
    layout_card: "vertical",
  }, "vertical"),
  scene("tela_cheia-auto-longo", {
    ...base,
    tipo: "tela_cheia",
    texto: "o especialista e um barbaro moderno",
    subtexto: "CONHECIMENTO ISOLADO PERDE SENTIDO SEM O TODO.",
    layout_card: "vertical",
  }, "vertical"),
  scene("tela_cheia-padrao-longo", {
    ...base,
    tipo: "tela_cheia",
    texto: "o especialista e um barbaro moderno",
    subtexto: "CONHECIMENTO ISOLADO PERDE SENTIDO SEM O TODO.",
    modelo_cena: "padrao",
    layout_card: "vertical",
  }, "vertical"),
  scene("tela_cheia-auto-longo-default-forte", {
    inicio: 0,
    fim: 5,
    tipo: "tela_cheia",
    texto: "o especialista e um barbaro moderno",
    subtexto: "CONHECIMENTO ISOLADO PERDE SENTIDO SEM O TODO.",
    layout_card: "vertical",
  }, "vertical", "forte"),
  scene("tela_cheia-padrao-longo-media", {
    inicio: 0,
    fim: 5,
    tipo: "tela_cheia",
    texto: "o especialista e um barbaro moderno",
    subtexto: "CONHECIMENTO ISOLADO PERDE SENTIDO SEM O TODO.",
    modelo_cena: "padrao",
    layout_card: "vertical",
    sombra_nivel: "media",
  }, "vertical", "media"),
  scene("tela_cheia-card-v", {
    ...base,
    tipo: "tela_cheia",
    texto: "Pensar a totalidade",
    subtexto: "A filosofia como visao do todo",
    modelo_cena: "card",
    layout_card: "vertical",
  }, "vertical"),
  scene("tela_cheia-card-h", {
    ...base,
    tipo: "tela_cheia",
    texto: "Pensar a totalidade",
    subtexto: "A filosofia como visao do todo",
    modelo_cena: "card",
    layout_card: "horizontal",
  }, "horizontal"),
  scene("tela_cheia-card-longo-v", {
    ...base,
    tipo: "tela_cheia",
    texto: "o especialista e um barbaro moderno",
    subtexto: "CONHECIMENTO ISOLADO PERDE SENTIDO SEM O TODO.",
    modelo_cena: "card",
    layout_card: "vertical",
  }, "vertical"),
  scene("tela_cheia-card-longo-forte-v", {
    inicio: 0,
    fim: 5,
    tipo: "tela_cheia",
    texto: "o especialista e um barbaro moderno",
    subtexto: "CONHECIMENTO ISOLADO PERDE SENTIDO SEM O TODO.",
    modelo_cena: "card",
    layout_card: "vertical",
  }, "vertical", "forte"),

  scene("comparativo_contraponto-padrao", {
    ...base,
    tipo: "comparativo_contraponto",
    texto: "HEGELIANISMO",
    subtexto: "DE CABECA PARA BAIXO",
    rotuloA: "HERANCA",
    rotuloB: "INVERSAO",
    contexto: "EIXO FILOSOFICO",
    mascotMood: "serio",
    modelo_cena: "padrao",
  }),
  scene("comparativo_contraponto-card-v", {
    ...base,
    tipo: "comparativo_contraponto",
    texto: "HEGELIANISMO",
    subtexto: "DE CABECA PARA BAIXO",
    rotuloA: "HERANCA",
    rotuloB: "INVERSAO",
    contexto: "EIXO FILOSOFICO",
    mascotMood: "serio",
    modelo_cena: "card",
    layout_card: "vertical",
  }, "vertical"),
  scene("comparativo_contraponto-card-h", {
    ...base,
    tipo: "comparativo_contraponto",
    texto: "HEGELIANISMO",
    subtexto: "DE CABECA PARA BAIXO",
    rotuloA: "HERANCA",
    rotuloB: "INVERSAO",
    contexto: "EIXO FILOSOFICO",
    mascotMood: "serio",
    modelo_cena: "card",
    layout_card: "horizontal",
  }, "horizontal"),
  scene("comparativo_enfase-legado-card-v", {
    ...base,
    tipo: "comparativo_enfase",
    texto: "HEGELIANISMO",
    subtexto: "DE CABECA PARA BAIXO",
    rotuloA: "HERANCA",
    rotuloB: "INVERSAO",
    contexto: "EIXO FILOSOFICO",
    mascotMood: "serio",
    modelo_cena: "card",
    layout_card: "vertical",
  }, "vertical"),
  ...layoutPair("enfase", {
    ...base,
    tipo: "enfase",
    texto: "TOTALIDADE",
    subtexto: "A palavra que organiza o argumento",
    contexto: "IDEIA-CHAVE",
    mascotMood: "enfatico",
    modelo_cena: "card",
  }),

  ...layoutPair("barra_inferior", {
    ...base,
    tipo: "barra_inferior",
    texto: "Sistema filosofico",
    subtexto: "Tese central",
  }),
  ...layoutPair("card_informacao", {
    ...base,
    tipo: "card_informacao",
    texto: "Filosofia seria e sistema",
    subtexto: "Articular o todo, nao so um tema.",
    icone: "*",
    mascotMood: "pensativo",
  }),
  ...layoutPair("pergunta_transicao", {
    ...base,
    tipo: "pergunta_transicao",
    texto: "Filosofia pode ser especialidade?",
    subtexto: "Pergunta central",
    mascotMood: "apresentador",
  }),
  ...layoutPair("ficha_biografica", {
    ...base,
    tipo: "ficha_biografica",
    texto: "Johann Wolfgang von Goethe",
    nome_curto: "Johann W. Goethe",
    subtexto: "1749 - 1832 - Escritor e naturalista alemao",
    contexto: "Referencia: textos sobre as plantas",
    mascotMood: "investigador",
  }),
  ...layoutPair("marco_historico", {
    ...base,
    tipo: "marco_historico",
    texto: "1844",
    subtexto: "Manuscritos economico-filosoficos",
    contexto: "Marco historico",
  }),
  ...layoutPair("linha_tempo", {
    ...base,
    tipo: "linha_tempo",
    texto: "Percurso",
    marcos: [
      { data: "1632", titulo: "Spinoza", detalhe: "Sistema" },
      { data: "1818", titulo: "Marx", detalhe: "Critica" },
      { data: "1885", titulo: "Lukacs", detalhe: "Ontologia" },
    ],
  }),
  ...layoutPair("definicao_termo", {
    ...base,
    tipo: "definicao_termo",
    texto: "Mundo",
    subtexto: "Conceito de totalidade",
    contexto: "A soma de todas as coisas.",
    mascotMood: "investigador",
  }),
  ...layoutPair("fonte_referencia", {
    ...base,
    tipo: "fonte_referencia",
    texto: "Fonte",
    fonte: "Stanford Encyclopedia",
    contexto: "Referencia",
  }),
  ...layoutPair("lista_enumerada", {
    ...base,
    tipo: "lista_enumerada",
    texto: "Tres pontos",
    itens: [
      { titulo: "Sistema", detalhe: "Pensar o todo" },
      { titulo: "Ontologia", detalhe: "Base da etica" },
      { titulo: "Metodo", detalhe: "Contraste real" },
    ],
  }),
  ...layoutPair("chamada_final", {
    ...base,
    tipo: "chamada_final",
    texto: "Salve este corte",
    subtexto: "Volte para comparar as ideias",
    mascotMood: "convidativo",
  }),

  scene("destaque_numerico-padrao", {
    ...base,
    tipo: "destaque_numerico",
    numero: 3,
    subtexto: "camadas",
    contexto: "argumento",
  }),
  scene("citacao_autor-padrao", {
    ...base,
    tipo: "citacao_autor",
    texto: "A verdade e o todo.",
    autor: "Hegel",
    obra: "Fenomenologia do Espirito",
    ano: "1807",
    mascotMood: "pensativo",
  }),
];

const distinctPairs = [
  ["tela_cheia-card-v", "tela_cheia-card-h", "tela_cheia card deve mudar com layout_card"],
  ["comparativo_contraponto-padrao", "comparativo_contraponto-card-v", "comparativo_contraponto deve mudar quando modelo_cena=card"],
  ["comparativo_contraponto-card-v", "comparativo_contraponto-card-h", "comparativo_contraponto card deve mudar com layout_card"],
  ["comparativo_contraponto-padrao", "comparativo_enfase-legado-card-v", "comparativo_enfase legado deve respeitar modelo_cena=card"],
  ...layoutTypes().map((type) => [`${type}-v`, `${type}-h`, `${type} deve mudar com layout_card`]),
];

const identicalPairs = [
  // I-031: tela_cheia sempre renderiza como card, independente do modelo_cena no banco.
  ["tela_cheia-padrao", "tela_cheia-default-card", "tela_cheia com modelo_cena=padrao agora renderiza como card"],
  ["tela_cheia-auto-longo", "tela_cheia-card-longo-v", "tela_cheia longa sem modelo_cena deve renderizar como card"],
  ["tela_cheia-padrao-longo", "tela_cheia-card-longo-v", "tela_cheia longa com modelo_cena=padrao deve renderizar como card"],
  ["tela_cheia-auto-longo-default-forte", "tela_cheia-card-longo-forte-v", "tela_cheia longa automatica renderiza como card respeitando sombra"],
];

function scene(id, cena, layoutCardPadrao = "vertical", sombraNivelPadrao = "media") {
  return { id, props: { cena, durationFrames: 150, sombraNivelPadrao, layoutCardPadrao } };
}

function layoutPair(type, cena) {
  return [
    scene(`${type}-v`, { ...cena, layout_card: "vertical" }, "vertical"),
    scene(`${type}-h`, { ...cena, layout_card: "horizontal" }, "horizontal"),
  ];
}

function layoutTypes() {
  return [
    "barra_inferior",
    "card_informacao",
    "enfase",
    "pergunta_transicao",
    "ficha_biografica",
    "marco_historico",
    "linha_tempo",
    "definicao_termo",
    "fonte_referencia",
    "lista_enumerada",
    "chamada_final",
  ];
}

function hashFile(file) {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

function runStill(scenario) {
  const propsPath = path.join(outDir, `${scenario.id}.json`);
  const outputPath = path.join(outDir, `${scenario.id}.png`);
  writeFileSync(propsPath, JSON.stringify(scenario.props, null, 2), "utf8");

  const result = spawnSync(
    npxBin,
    ["remotion", "still", "OverlaySceneV2", outputPath, `--frame=${frame}`, `--props=${propsPath}`],
    { cwd: rendererDir, encoding: "utf8", shell: process.platform === "win32" },
  );

  if (result.status !== 0) {
    if (result.error) {
      process.stderr.write(`${result.error.message}\n`);
    }
    process.stderr.write(result.stdout ?? "");
    process.stderr.write(result.stderr ?? "");
    throw new Error(`Falha ao renderizar ${scenario.id}`);
  }

  if (!existsSync(outputPath)) {
    throw new Error(`PNG nao criado: ${scenario.id}`);
  }

  const bytes = statSync(outputPath).size;
  if (bytes < minPngBytes) {
    throw new Error(`PNG suspeito/pequeno demais (${bytes} bytes): ${scenario.id}`);
  }

  return { id: scenario.id, outputPath, bytes, hash: hashFile(outputPath) };
}

function main() {
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });

  const results = new Map();
  for (const scenario of scenarios) {
    const result = runStill(scenario);
    results.set(result.id, result);
    console.log(`ok ${result.id} (${result.bytes} bytes)`);
  }

  for (const [leftId, rightId, reason] of distinctPairs) {
    const left = results.get(leftId);
    const right = results.get(rightId);
    if (!left || !right) {
      throw new Error(`Par de contrato ausente: ${leftId} x ${rightId}`);
    }
    if (left.hash === right.hash) {
      throw new Error(`Contrato visual falhou: ${reason}`);
    }
  }

  for (const [leftId, rightId, reason] of identicalPairs) {
    const left = results.get(leftId);
    const right = results.get(rightId);
    if (!left || !right) {
      throw new Error(`Par de contrato ausente: ${leftId} x ${rightId}`);
    }
    if (left.hash !== right.hash) {
      throw new Error(`Contrato visual falhou: ${reason}`);
    }
  }

  console.log(`\nCard contracts OK: ${scenarios.length} stills em ${outDir}`);
}

main();
