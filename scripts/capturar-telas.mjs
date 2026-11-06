#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────
// capturar-telas.mjs — bateria de screenshots REAIS do app de DEV
// para enviar ao projeto do claude.ai/design (D-395).
//
// Uso:
//   node scripts/capturar-telas.mjs --versao v1
//   node scripts/capturar-telas.mjs --versao v2 --base http://localhost:4304 --api http://localhost:8003/api
//
// Projetos-cobaia: CAPTURA_PROJETO_VIDEO e CAPTURA_PROJETO_CORTES; sem
// elas, o script escolhe pela API (ver escolherProjetosPadrao).
//
// Saída: capturas/<versao>/*.jpg + indice.md (índice das telas).
//
// Como funciona: sobe o Chrome instalado em modo headless com o
// DevTools Protocol e dirige a navegação por WebSocket nativo do Node
// (sem puppeteer/playwright — nenhuma dependência nova no projeto).
//
// Falha alto (D-1069): botão ausente ou desabilitado, modal que não abre,
// tema que não pegou e captura idêntica a outra param o script com o nome
// da tela. As regras moram em capturar-telas-regras.mjs, com teste.
//
// SEGURANÇA: só clica em botões que ABREM modais/telas. Nunca aprova,
// rejeita, renderiza, publica ou deleta — a lista `MODAIS` é explícita.
// ─────────────────────────────────────────────────────────────
import { spawn } from 'node:child_process';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import {
  conferirAbertura,
  conferirClique,
  conferirTema,
  criarRegistroDeHashes,
  ErroDeCaptura,
  escolherProjetosPadrao,
  montarClique,
} from './capturar-telas-regras.mjs';

const args = process.argv.slice(2);
const arg = (nome, padrao) => {
  const i = args.indexOf(`--${nome}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : padrao;
};

// Padrões do DEV (dev.ports.local.ps1): frontend 4301, backend 8001.
const BASE = arg('base', 'http://localhost:4301');
const API = arg('api', 'http://localhost:8001/api');
const VERSAO = arg('versao', 'v1');
const LARGURA = Number(arg('largura', '1600'));
const ALTURA = Number(arg('altura', '900'));
const PORTA_CDP = Number(arg('porta-cdp', '9333'));
const SAIDA = path.resolve(process.cwd(), 'capturas', VERSAO);

const CHROME_CANDIDATOS = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
];

/** O que conta como modal aberto (Modal e UpgradeModal usam role="dialog"). */
const DIALOGO = '[role="dialog"]';

const MAIS = { clicar: { nome: 'Mais' } };

/**
 * Telas e modais, montados com os projetos-cobaia (`video`, `cortes`).
 * `passos` roda no browser DEPOIS do load, em ordem: `clicar` acha um
 * botão pelo texto ou aria-label, `tecla` aperta um atalho. Só abre
 * modais e painéis — nada destrutivo. `abre` exige um elemento novo.
 */
function montarTelas({ video, cortes }) {
  const telas = [
    { id: '01-biblioteca', titulo: 'Biblioteca (lista de projetos)', rota: '/projetos' },
    { id: '02-workspace', titulo: 'Workspace do projeto (cards de corte)', rota: `/projetos/${cortes}` },
    {
      id: '03-bruto',
      titulo: 'Editor Bruto (player + timeline + trechos)',
      rota: `/projetos/${video}/cortes`,
      espera: 4000,
    },
    {
      id: '04-pos',
      titulo: 'Pós-produção (cenas + preview + layout YouTube)',
      rota: `/projetos/${cortes}/post-production`,
      espera: 4000,
    },
    {
      id: '05-revisao-final',
      titulo: 'Revisão final (vídeo final + checklist + capa)',
      rota: `/projetos/${cortes}/final-review`,
      espera: 3500,
    },
    {
      id: '06-metadados',
      titulo: 'Metadados & thumbnails',
      rota: `/projetos/${cortes}/metadados`,
      espera: 3000,
    },
    { id: '07-ranking', titulo: 'Ranking de lives', rota: '/ranking-lives' },
    { id: '08-buscar-lives', titulo: 'Buscar novas lives', rota: '/buscar-lives' },
    { id: '09-padroes-thumbnail', titulo: 'Padrões de thumbnail', rota: '/padroes-thumbnail' },
    { id: '10-analises', titulo: 'Análises (stat-cards + abas)', rota: '/analises' },
    { id: '11-atalhos', titulo: 'Atalhos (editáveis)', rota: '/atalhos' },
    { id: '12-config-canal', titulo: 'Configurações · Canal ativo', rota: '/canais' },
    {
      id: '13-config-aplicacao',
      titulo: 'Configurações · Aplicação (aparência + globais)',
      rota: '/canais',
      passos: [{ clicar: { nome: 'Aplicação' } }],
    },
    {
      id: '14-config-skills',
      titulo: 'Configurações · Skills editoriais (bloco-portal aberto)',
      rota: '/canais',
      passos: [{ clicar: { nomeContem: 'Skills editoriais' } }],
      espera: 2500,
    },
  ];

  const modais = [
    // "Novo projeto" virou "Nova live", e abre o formulário dentro da
    // Biblioteca (NovoProjetoForm), não um modal.
    {
      id: '20-form-nova-live',
      titulo: 'Biblioteca · Nova live (formulário do novo projeto)',
      rota: '/projetos',
      passos: [{ clicar: { nome: 'Nova live' } }],
      abre: '#np-url',
    },
    // D-867 levou Reanalisar e Auditar para o "Mais" do cabeçalho.
    {
      id: '21-modal-analise-ia',
      titulo: 'Modal · Análise IA (Mais › Reanalisar)',
      rota: `/projetos/${cortes}`,
      passos: [MAIS, { clicar: { nome: 'Reanalisar' } }],
    },
    {
      id: '22-modal-auditoria',
      titulo: 'Modal · Auditar análise (Mais › Auditar análise)',
      rota: `/projetos/${cortes}`,
      passos: [MAIS, { clicar: { nome: 'Auditar análise' } }],
      espera: 2500,
    },
    // O botão diz quantos cortes vai publicar ("Publicar 3 cortes", seguido
    // do glifo ↵ do atalho) e fica desabilitado sem nenhum pronto.
    {
      id: '23-modal-publicar-massa',
      titulo: 'Modal · Publicar em massa',
      rota: `/projetos/${cortes}/metadados`,
      passos: [
        {
          clicar: { nomeRegex: '^Publicar \\d+ cortes?\\b' },
          requisito:
            'O modal pede um corte pronto para publicar (vídeo final, título e capa) e ainda fora do ar: aponte CAPTURA_PROJETO_CORTES para um projeto assim.',
        },
      ],
      espera: 3000,
    },
    // "Novo corte" no cabeçalho do Workspace abre o mesmo modal que o
    // editor tinha; o editor não tem mais o botão.
    {
      id: '24-modal-adicionar-corte',
      titulo: 'Modal · Adicionar corte manualmente (Workspace › Novo corte)',
      rota: `/projetos/${video}`,
      passos: [{ clicar: { nome: 'Novo corte' } }],
    },
    // Sem botão: o editor abre a ajuda pelo atalho Shift+? (bruto.mostrarAtalhos).
    {
      id: '25-modal-atalhos-editor',
      titulo: 'Modal · Atalhos do editor (Shift+?)',
      rota: `/projetos/${video}/cortes`,
      passos: [{ tecla: { key: '?', code: 'Slash', tecla: 191, shift: true } }],
      espera: 4000,
    },
    // A barra de abas ("Nova aba de trabalho") saiu com a casca antiga
    // (D-728). Achar outro projeto ou tela é a paleta de busca (⌘K).
    {
      id: '26-paleta-busca',
      titulo: 'Paleta · Buscar live, tela ou ação (⌘K)',
      rota: '/projetos',
      passos: [{ clicar: { nomeContem: 'Buscar live, tela ou ação' } }],
    },
    // A lista de cortes do editor abre o metadado de qualquer corte (D-746).
    {
      id: '27-modal-metadados',
      titulo: 'Modal · Metadados (a partir da lista de cortes do editor)',
      rota: `/projetos/${video}/cortes`,
      passos: [{ clicar: { nomeComeca: 'Metadados do corte #' } }],
      espera: 4000,
    },
  ].map((m) => ({ abre: DIALOGO, ...m }));

  return { telas, modais };
}

/** Telas que também são capturadas no tema escuro. */
const TAMBEM_NO_ESCURO = new Set([
  '01-biblioteca',
  '02-workspace',
  '03-bruto',
  '04-pos',
  '05-revisao-final',
  '12-config-canal',
]);

// ── CDP mínimo por WebSocket nativo ──────────────────────────
class CDP {
  #ws;
  #id = 0;
  #pendentes = new Map();

  static async conectar(wsUrl) {
    const cdp = new CDP();
    cdp.#ws = new WebSocket(wsUrl);
    await new Promise((ok, erro) => {
      cdp.#ws.addEventListener('open', ok, { once: true });
      cdp.#ws.addEventListener('error', erro, { once: true });
    });
    cdp.#ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data);
      const p = cdp.#pendentes.get(msg.id);
      if (!p) return;
      cdp.#pendentes.delete(msg.id);
      msg.error ? p.erro(new Error(msg.error.message)) : p.ok(msg.result);
    });
    return cdp;
  }

  enviar(method, params = {}) {
    const id = ++this.#id;
    this.#ws.send(JSON.stringify({ id, method, params }));
    return new Promise((ok, erro) => this.#pendentes.set(id, { ok, erro }));
  }

  fechar() {
    this.#ws.close();
  }
}

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

async function acharChrome() {
  const bin = CHROME_CANDIDATOS.find((p) => existsSync(p));
  if (!bin) throw new Error('Chrome/Edge não encontrado nos caminhos padrão do Windows.');
  return bin;
}

async function lerJson(url) {
  let resposta;
  try {
    resposta = await fetch(url);
  } catch (erro) {
    throw new ErroDeCaptura('projetos', `o backend não respondeu em ${url} (${erro.message}); confira --api.`);
  }
  if (!resposta.ok) throw new ErroDeCaptura('projetos', `${url} respondeu ${resposta.status}.`);
  return resposta.json();
}

/** Cortes prontos para publicar e ainda fora do ar (a regra do botão da tela de Metadados). */
async function contarProntos(projetoId) {
  const { cortes = [] } = await lerJson(`${API}/export/projeto/${projetoId}/status`);
  return cortes.filter((c) => c.pronto_publicar && !c.youtube_url_publicado).length;
}

/** Os projetos-cobaia: as variáveis de ambiente valem; sem elas, o banco escolhe. */
async function resolverProjetos() {
  let video = process.env.CAPTURA_PROJETO_VIDEO;
  let cortes = process.env.CAPTURA_PROJETO_CORTES;
  if (!video || !cortes) {
    const projetos = await lerJson(`${API}/projetos`);
    const prontos = {};
    for (const p of projetos.filter((x) => x.total_cortes >= 2)) prontos[p.id] = await contarProntos(p.id);
    const padrao = escolherProjetosPadrao(projetos, prontos);
    video ??= padrao.comVideo;
    cortes ??= padrao.multiCortes;
  }
  // Um ID que não existe dava 404 na tela e a captura saía com a página de erro.
  for (const id of new Set([video, cortes])) await lerJson(`${API}/projetos/${id}`);
  return { video, cortes };
}

async function main() {
  const projetos = await resolverProjetos();
  const { telas, modais } = montarTelas(projetos);
  const bin = await acharChrome();
  const perfil = path.join(process.env.TEMP ?? '/tmp', `capturas-chrome-${Date.now()}`);
  const chrome = spawn(
    bin,
    [
      '--headless=new',
      '--disable-gpu',
      '--hide-scrollbars',
      '--mute-audio',
      '--no-first-run',
      '--no-default-browser-check',
      `--user-data-dir=${perfil}`,
      `--remote-debugging-port=${PORTA_CDP}`,
      `--window-size=${LARGURA},${ALTURA}`,
      'about:blank',
    ],
    { stdio: 'ignore' },
  );

  try {
    // Espera o CDP subir.
    let versao = null;
    for (let i = 0; i < 40 && !versao; i += 1) {
      await esperar(250);
      try {
        versao = await (await fetch(`http://127.0.0.1:${PORTA_CDP}/json/version`)).json();
      } catch {
        /* ainda subindo */
      }
    }
    if (!versao) throw new Error('CDP não respondeu — Chrome não subiu.');

    const alvo = await (
      await fetch(`http://127.0.0.1:${PORTA_CDP}/json/new?about:blank`, { method: 'PUT' })
    ).json();
    const cdp = await CDP.conectar(alvo.webSocketDebuggerUrl);

    await cdp.enviar('Page.enable');
    await cdp.enviar('Runtime.enable');
    await cdp.enviar('Emulation.setDeviceMetricsOverride', {
      width: LARGURA,
      height: ALTURA,
      deviceScaleFactor: 1,
      mobile: false,
    });

    await mkdir(SAIDA, { recursive: true });
    const capturadas = [];

    const hashes = criarRegistroDeHashes();
    let scriptDoTema = null;

    const avaliar = async (expression) => {
      const { result } = await cdp.enviar('Runtime.evaluate', { expression, returnByValue: true });
      return result.value;
    };
    const contar = (seletor) => avaliar(`document.querySelectorAll(${JSON.stringify(seletor)}).length`);

    const executarPasso = async (passo, id) => {
      if (passo.clicar) {
        conferirClique(await avaliar(montarClique(passo.clicar)), id, passo.clicar, passo.requisito);
      } else {
        const { key, code, tecla, shift } = passo.tecla;
        const evento = { key, code, windowsVirtualKeyCode: tecla, modifiers: shift ? 8 : 0 };
        await cdp.enviar('Input.dispatchKeyEvent', { type: 'keyDown', text: key, ...evento });
        await cdp.enviar('Input.dispatchKeyEvent', { type: 'keyUp', ...evento });
      }
      await esperar(700);
    };

    const capturar = async ({ id, titulo, rota, passos = [], abre, espera = 2200 }, tema) => {
      const sufixo = tema === 'dark' ? '-escuro' : '';
      const arquivo = `${id}${sufixo}.jpg`;

      // O tema da casca (useUpgradeTheme lê `upgrade-theme` ao carregar),
      // gravado antes de qualquer script da página. Um script por captura:
      // o anterior sai, senão eles se acumulam a cada navegação.
      if (scriptDoTema) {
        await cdp.enviar('Page.removeScriptToEvaluateOnNewDocument', { identifier: scriptDoTema });
      }
      ({ identifier: scriptDoTema } = await cdp.enviar('Page.addScriptToEvaluateOnNewDocument', {
        source: `try { localStorage.setItem('upgrade-theme', ${JSON.stringify(tema)}); } catch (e) {}`,
      }));

      await cdp.enviar('Page.navigate', { url: `${BASE}${rota}` });
      await esperar(espera);
      conferirTema(await avaliar(`document.querySelector('.ap')?.getAttribute('data-theme') ?? null`), tema, id);

      const antes = abre ? await contar(abre) : 0;
      for (const passo of passos) await executarPasso(passo, id);
      if (abre) conferirAbertura(antes, await contar(abre), id, abre);
      if (passos.length) await esperar(500);

      const { data } = await cdp.enviar('Page.captureScreenshot', { format: 'jpeg', quality: 90 });
      const bytes = Buffer.from(data, 'base64');
      await writeFile(path.join(SAIDA, arquivo), bytes);
      hashes.registrar(id, arquivo, bytes);
      capturadas.push({ arquivo, titulo, rota, tema });
      process.stdout.write(`  ✓ ${arquivo}\n`);
    };

    console.log(`\nCapturando ${VERSAO} de ${BASE} (${LARGURA}×${ALTURA})`);
    console.log(`Projetos: com vídeo ${projetos.video} · vários cortes ${projetos.cortes}\n`);
    console.log('Telas:');
    for (const tela of telas) await capturar(tela, 'light');
    console.log('Modais:');
    for (const modal of modais) await capturar(modal, 'light');
    console.log('Tema escuro:');
    for (const tela of telas.filter((t) => TAMBEM_NO_ESCURO.has(t.id))) {
      await capturar(tela, 'dark');
    }

    const indice = [
      `# Capturas da implementação — ${VERSAO}`,
      '',
      `Gerado em ${new Date().toISOString()} · base \`${BASE}\` · viewport ${LARGURA}×${ALTURA}.`,
      '',
      'Screenshots REAIS do app rodando (dados de DEV). Compare com o protótipo',
      '`Workbench 1c.dc.html` e registre as divergências numa nova auditoria.',
      '',
      '| Arquivo | Tela | Rota | Tema |',
      '|---|---|---|---|',
      ...capturadas.map((c) => `| \`${c.arquivo}\` | ${c.titulo} | \`${c.rota}\` | ${c.tema} |`),
      '',
    ].join('\n');
    await writeFile(path.join(SAIDA, 'indice.md'), indice, 'utf8');

    console.log(`\n${capturadas.length} imagens em ${SAIDA}\n`);
    cdp.fechar();
  } finally {
    chrome.kill();
    await rm(perfil, { recursive: true, force: true }).catch(() => {});
  }
}

main().catch((erro) => {
  console.error(`\nFalhou: ${erro.message}\n`);
  process.exit(1);
});
