import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { availableParallelism, tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const rendererDir = path.join(repoRoot, "video-renderer");
const outDir = path.join(tmpdir(), "gerador-cortes-remotion-card-contracts");
const bundleDir = path.join(tmpdir(), "gerador-cortes-remotion-card-contracts-bundle");
const npxBin = process.platform === "win32" ? "npx.cmd" : "npx";
const frame = 45;
// D-917: os stills saem do renderer instalado no video-renderer, não do da raiz.
const { openBrowser, renderStill, selectComposition } = createRequire(path.join(rendererDir, "package.json"))(
  "@remotion/renderer",
);
const minPngBytes = 2500;

const base = {
  inicio: 0,
  fim: 5,
  sombra_nivel: "media",
};

const perguntaChat = {
  ...base,
  tipo: "pergunta_chat",
  texto: "pq a UP tá contribuindo com os ataques a via democratica? 🤔",
  autor: "@Fulano_de_Tal",
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

  // D-910: a pergunta do chat, com texto literal (erro, @menção e emoji unicode).
  ...layoutPair("pergunta_chat", perguntaChat),
  scene("pergunta_chat-avatar-quebrado", {
    ...perguntaChat,
    layout_card: "vertical",
    avatar_url: "http://127.0.0.1:9/avatar-que-nao-existe.jpg",
  }, "vertical"),
  scene("pergunta_chat-longa-h", {
    ...perguntaChat,
    layout_card: "horizontal",
    texto: "uma dúvida agora, uma das justificativas mais comuns do nazismo ser de direita é o nacionalismo, mas se tmb existe nacionalismo de esquerda esse argumento não cai ? @Outro o que vc acha 🤔🤔",
  }, "horizontal"),

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

// D-916: as cenas no estilo limpo (o Bloco). Um cenário por tipo, com o
// conteúdo do catálogo; o contrato confere que cada um desenha algo e que sai
// diferente do estilo de sempre.
const LIMPO = { estilo: "limpo", ocultos: [], escala: 1, posicao: { automatica: true, x: 96, y: 112 } };
const ATUAL = { estilo: "atual", ocultos: [], escala: 1, posicao: { automatica: true, x: 96, y: 112 } };
const CENAS_LIMPAS = {
  card_informacao: { contexto: "Contexto", texto: "Franco tinha a Igreja como aliada", subtexto: "A carta dos bispos legitimou o golpe." },
  definicao_termo: { texto: "Clericalismo", contexto: "Doutrina que defende a influencia do clero sobre o Estado.", subtexto: "s.m." },
  pergunta_transicao: { texto: "E se a Igreja nunca tivesse apoiado Franco?" },
  ficha_biografica: { texto: "Aristoteles", ano: "384-322 a.C.", contexto: "Politica" },
  marco_historico: { ano: "1936", texto: "Comeca a Guerra Civil Espanhola", contexto: "Espanha" },
  citacao_autor: { texto: "O homem esta condenado a ser livre.", autor: "Sartre", obra: "O Ser e o Nada", ano: "1943" },
  destaque_numerico: { numero: "45,7%", contexto: "dos eleitores do grupo", fonte: "Datafolha" },
  enfase: { texto: "based", subtexto: "a palavra do dia" },
  comparativo_contraponto: { texto: "Determinismo", subtexto: "Livre-arbitrio" },
  lista_enumerada: { texto: "Tres aliancas", itens: [{ titulo: "Igreja aliada" }, { titulo: "Nacional-catolicismo" }] },
  linha_tempo: { texto: "Espanha", marcos: [{ data: "1931", titulo: "Republica" }, { data: "1936", titulo: "Guerra" }, { data: "1975", titulo: "Morte de Franco" }] },
  fonte_referencia: { fonte: "Stanford Encyclopedia of Philosophy" },
  barra_inferior: { texto: "Rodrigo", subtexto: "Insider" },
  tela_cheia: { contexto: "A tese", texto: "Nao e fe. E poder com batina." },
  chamada_final: { texto: "A live completa esta no canal", subtexto: "@canal" },
  pergunta_chat: { autor: "@Fulano_de_Tal", texto: "o Franco era fascista mesmo?" },
};
for (const [tipo, campos] of Object.entries(CENAS_LIMPAS)) {
  scenarios.push(scene(`${tipo}-limpo`, { ...base, tipo, ...campos }, "vertical", "media", LIMPO));
  scenarios.push(scene(`${tipo}-atual`, { ...base, tipo, ...campos }, "vertical", "media", ATUAL));
}
// Sem `estiloCenas` nenhum: tem de sair igual ao "atual" explícito.
scenarios.push(scene("card_informacao-sem-estilo", { ...base, tipo: "card_informacao", ...CENAS_LIMPAS.card_informacao }));
// Tipo escondido pelo canal: o quadro sai vazio. Dois tipos diferentes,
// escondidos, têm de dar o MESMO quadro (o vazio) — e diferente do visível.
scenarios.push(
  scene("enfase-escondida", { ...base, tipo: "enfase", ...CENAS_LIMPAS.enfase }, "vertical", "media", { ...LIMPO, ocultos: ["enfase"] }),
  scene("card_informacao-escondido", { ...base, tipo: "card_informacao", ...CENAS_LIMPAS.card_informacao }, "vertical", "media", { ...LIMPO, ocultos: ["card_informacao"] }),
);

// D-926: o card limpo dentro da zona dos cards (compartilhada). Alinhar no
// centro tem de mover o card em relação ao topo, e "preencher" tem de mudar o
// tamanho em relação ao natural — senão o modo escolhido não chega ao vídeo.
const NA_ZONA = {
  ...base,
  tipo: "definicao_termo",
  ...CENAS_LIMPAS.definicao_termo,
  layout_card: "vertical",
  layout_youtube_modo: "compartilhada",
  layout_card_zone: { x: 1180, y: 80, w: 680, h: 920 },
};
const modoNaZona = (ajuste, alinhamento_vertical) => ({ ...LIMPO, ajuste, alinhamento_vertical, alinhamento_horizontal: "centro" });
scenarios.push(
  scene("zona-natural-topo", NA_ZONA, "vertical", "media", modoNaZona("natural", "topo")),
  scene("zona-natural-centro", NA_ZONA, "vertical", "media", modoNaZona("natural", "centro")),
  scene("zona-preencher-centro", NA_ZONA, "vertical", "media", modoNaZona("preencher", "centro")),
);

// D-931: o número em destaque também vai para a zona dos cards (nos dois
// estilos); fora dela ele saía por cima da tela pequena.
const NUMERO_NA_ZONA = {
  ...base,
  tipo: "destaque_numerico",
  ...CENAS_LIMPAS.destaque_numerico,
  layout_card: "vertical",
  modelo_cena: "card",
  layout_youtube_modo: "compartilhada",
  layout_card_zone: { x: 1180, y: 80, w: 680, h: 920 },
};
scenarios.push(
  scene("destaque_numerico-zona-limpo", NUMERO_NA_ZONA, "vertical", "media", LIMPO),
  scene("destaque_numerico-zona-atual", NUMERO_NA_ZONA, "vertical", "media", ATUAL),
);

const distinctPairs = [
  ["destaque_numerico-zona-limpo", "destaque_numerico-limpo", "o número em destaque tem de ir para a zona no limpo"],
  ["destaque_numerico-zona-atual", "destaque_numerico-atual", "o número em destaque tem de ir para a zona no estilo de sempre"],
  ["zona-natural-topo", "zona-natural-centro", "o alinhamento vertical tem de mover o card na zona"],
  ["zona-natural-centro", "zona-preencher-centro", "preencher tem de mudar o tamanho do card na zona"],
  ["tela_cheia-card-v", "tela_cheia-card-h", "tela_cheia card deve mudar com layout_card"],
  ["comparativo_contraponto-padrao", "comparativo_contraponto-card-v", "comparativo_contraponto deve mudar quando modelo_cena=card"],
  ["comparativo_contraponto-card-v", "comparativo_contraponto-card-h", "comparativo_contraponto card deve mudar com layout_card"],
  ["comparativo_contraponto-padrao", "comparativo_enfase-legado-card-v", "comparativo_enfase legado deve respeitar modelo_cena=card"],
  ...layoutTypes().map((type) => [`${type}-v`, `${type}-h`, `${type} deve mudar com layout_card`]),
  ...Object.keys(CENAS_LIMPAS).map((tipo) => [`${tipo}-limpo`, `${tipo}-atual`, `${tipo} no estilo limpo deve sair pelo Bloco`]),
  ["enfase-escondida", "enfase-limpo", "tipo escondido pelo canal não pode desenhar a cena"],
];

const identicalPairs = [
  // I-031: tela_cheia sempre renderiza como card, independente do modelo_cena no banco.
  ["tela_cheia-padrao", "tela_cheia-default-card", "tela_cheia com modelo_cena=padrao agora renderiza como card"],
  ["tela_cheia-auto-longo", "tela_cheia-card-longo-v", "tela_cheia longa sem modelo_cena deve renderizar como card"],
  ["tela_cheia-padrao-longo", "tela_cheia-card-longo-v", "tela_cheia longa com modelo_cena=padrao deve renderizar como card"],
  ["tela_cheia-auto-longo-default-forte", "tela_cheia-card-longo-forte-v", "tela_cheia longa automatica renderiza como card respeitando sombra"],
  // D-910: avatar que não carrega não derruba o render, vira a inicial do nome.
  ["pergunta_chat-avatar-quebrado", "pergunta_chat-v", "pergunta_chat com avatar quebrado desenha a inicial"],
  // D-916: o estilo de sempre não muda um byte com o estilo das cenas existindo.
  ["card_informacao-sem-estilo", "card_informacao-atual", "sem estiloCenas a cena sai como no estilo atual"],
  ["enfase-escondida", "card_informacao-escondido", "dois tipos escondidos dão o mesmo quadro vazio"],
];

function scene(id, cena, layoutCardPadrao = "vertical", sombraNivelPadrao = "media", estiloCenas = undefined) {
  const props = { cena, durationFrames: 150, sombraNivelPadrao, layoutCardPadrao };
  return { id, props: estiloCenas ? { ...props, estiloCenas } : props };
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
    "pergunta_chat",
  ];
}

function hashFile(file) {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

// D-917: empacotar uma vez pela CLI (que aplica o remotion.config.ts: Tailwind
// e o gate do mascote) e renderizar todos os stills no mesmo navegador. Antes era
// um `remotion still` por cenário, que reempacotava e abria um Chrome a cada
// still: 5 minutos do CI só nisso.
function bundleOnce() {
  const result = spawnSync(npxBin, ["remotion", "bundle", `--out-dir=${bundleDir}`], {
    cwd: rendererDir,
    encoding: "utf8",
    shell: process.platform === "win32",
    timeout: 300_000,
  });
  if (result.status !== 0) {
    if (result.error) {
      process.stderr.write(`${result.error.message}\n`);
    }
    process.stderr.write(result.stdout ?? "");
    process.stderr.write(result.stderr ?? "");
    throw new Error("Falha ao empacotar o video-renderer");
  }
}

// D-920: corrida do Remotion 4.0.x. O selectComposition dá a aba por pronta
// num requestAnimationFrame, mas as <Composition> se registram num useEffect;
// com 4 abas disputando a CPU (D-917) o rAF às vezes chega antes e a lista sai
// vazia. A lista vazia é a assinatura da corrida e nada mais a produz depois do
// registerRoot (que tem erro próprio): só ela se repete.
const tentativasDeSelecao = 3;
const listaVazia = /^(?:Error: )?Could not find composition with ID \S+\. Available compositions:\s*$/;

async function selecionarComposicao(selecionar, opcoes, avisar = console.warn) {
  for (let tentativa = 1; ; tentativa++) {
    try {
      return await selecionar(opcoes);
    } catch (erro) {
      if (tentativa === tentativasDeSelecao || !listaVazia.test(erro?.message ?? "")) {
        throw erro;
      }
      avisar(`selectComposition voltou sem composições (tentativa ${tentativa}); repetindo`);
    }
  }
}

// D-920: a repetição tem de valer só para a lista VAZIA; composição sumida de
// verdade (lista com outras) ou outro erro falham na primeira.
// D-930: as mensagens são as que o Remotion 4.0.534 entrega de fato, com o
// "Error: " da descrição do navegador na frente (medido com um ID inexistente).
// Sem ele, este teste passava e a repetição nunca disparou no CI.
async function verificarRepeticaoDaSelecao() {
  const corrida = new Error("Error: Could not find composition with ID OverlaySceneV2. Available compositions: ");
  const falhaAntes = (erros) => {
    const fila = [...erros];
    const selecionar = async () => {
      selecionar.chamadas += 1;
      const erro = fila.shift();
      if (erro) throw erro;
      return "composicao";
    };
    selecionar.chamadas = 0;
    return selecionar;
  };
  const semLog = () => {};

  const umaCorrida = falhaAntes([corrida]);
  assert.equal(await selecionarComposicao(umaCorrida, {}, semLog), "composicao");
  assert.equal(umaCorrida.chamadas, 2);

  const sempreCorrida = falhaAntes([corrida, corrida, corrida, corrida]);
  await assert.rejects(selecionarComposicao(sempreCorrida, {}, semLog), corrida);
  assert.equal(sempreCorrida.chamadas, 3);

  const sumiu = falhaAntes([new Error("Error: Could not find composition with ID OverlaySceneV2. Available compositions: Outra")]);
  await assert.rejects(selecionarComposicao(sumiu, {}, semLog), /Available compositions: Outra/);
  assert.equal(sumiu.chamadas, 1);

  const outroErro = falhaAntes([new Error("Target closed")]);
  await assert.rejects(selecionarComposicao(outroErro, {}, semLog), /Target closed/);
  assert.equal(outroErro.chamadas, 1);
}

// D-930: a corrida da D-920 mora no selectComposition, e cada still o chamava
// com 4 abas disputando a CPU — 80 sorteios por execução. A composição é uma só
// e o calculateMetadata do OverlaySceneV2 (src/Root.tsx) só lê durationFrames:
// seleciona-se UMA vez, antes do paralelismo, e cada cenário refaz o que o
// Remotion faria com as props dele (defaultProps + inputProps, mescla rasa).
async function prepararComposicoes(selecionar, opcoes, cenarios, avisar = console.warn) {
  const base = await selecionarComposicao(selecionar, { ...opcoes, inputProps: {} }, avisar);
  return new Map(cenarios.map(({ id, props }) => [id, composicaoDoCenario(base, props)]));
}

function composicaoDoCenario(base, props) {
  return { ...base, durationInFrames: props.durationFrames, props: { ...base.defaultProps, ...props } };
}

// D-930: uma seleção para todos os cenários, mesmo depois de a lista voltar
// vazia; e cada cenário com as próprias props por cima dos padrões.
async function verificarComposicaoUnica() {
  const corrida = new Error("Error: Could not find composition with ID OverlaySceneV2. Available compositions: ");
  const base = { id: "OverlaySceneV2", durationInFrames: 150, defaultProps: { durationFrames: 150, fontPreset: "atual", estiloCenas: "padrao" } };
  const fila = [corrida, corrida];
  const selecionar = async (opcoes) => {
    selecionar.chamadas += 1;
    assert.deepEqual(opcoes.inputProps, {});
    const erro = fila.shift();
    if (erro) throw erro;
    return { ...base, props: base.defaultProps };
  };
  selecionar.chamadas = 0;
  const cenarios = [
    { id: "a", props: { durationFrames: 150, cena: { tipo: "enfase" } } },
    { id: "b", props: { durationFrames: 90, cena: { tipo: "linha_tempo" }, estiloCenas: "limpo" } },
    { id: "c", props: { durationFrames: 150, cena: { tipo: "enfase" } } },
  ];

  const composicoes = await prepararComposicoes(selecionar, {}, cenarios, () => {});

  assert.equal(selecionar.chamadas, 3, "duas listas vazias e uma seleção que vale para todos");
  assert.deepEqual(composicoes.get("a").props, { durationFrames: 150, fontPreset: "atual", estiloCenas: "padrao", cena: { tipo: "enfase" } });
  assert.equal(composicoes.get("b").props.estiloCenas, "limpo");
  assert.equal(composicoes.get("b").durationInFrames, 90);
  assert.equal(composicoes.get("c").id, "OverlaySceneV2");
}

async function runStill(scenario, composition, browser) {
  const outputPath = path.join(outDir, `${scenario.id}.png`);
  writeFileSync(path.join(outDir, `${scenario.id}.json`), JSON.stringify(scenario.props, null, 2), "utf8");

  await renderStill({
    composition,
    serveUrl: bundleDir,
    output: outputPath,
    frame,
    imageFormat: "png",
    inputProps: scenario.props,
    puppeteerInstance: browser,
    overwrite: true,
  });

  if (!existsSync(outputPath)) {
    throw new Error(`PNG nao criado: ${scenario.id}`);
  }

  const bytes = statSync(outputPath).size;
  if (bytes < minPngBytes) {
    throw new Error(`PNG suspeito/pequeno demais (${bytes} bytes): ${scenario.id}`);
  }

  return { id: scenario.id, outputPath, bytes, hash: hashFile(outputPath) };
}

async function main() {
  await verificarRepeticaoDaSelecao();
  await verificarComposicaoUnica();
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });
  bundleOnce();

  const results = new Map();
  const browser = await openBrowser("chrome");
  // Cada still abre a própria aba; algumas em paralelo dividem o navegador.
  const pendentes = [...scenarios];
  let composicoes;
  const renderizarPendentes = async () => {
    for (let scenario = pendentes.shift(); scenario; scenario = pendentes.shift()) {
      const result = await runStill(scenario, composicoes.get(scenario.id), browser);
      results.set(result.id, result);
      console.log(`ok ${result.id} (${result.bytes} bytes)`);
    }
  };
  try {
    composicoes = await prepararComposicoes(
      selectComposition,
      { serveUrl: bundleDir, id: "OverlaySceneV2", puppeteerInstance: browser },
      scenarios,
    );
    await Promise.all(Array.from({ length: Math.min(4, availableParallelism()) }, renderizarPendentes));
  } finally {
    await browser.close({ silent: true });
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

await main();
