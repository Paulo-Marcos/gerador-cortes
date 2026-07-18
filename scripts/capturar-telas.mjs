#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────
// capturar-telas.mjs — bateria de screenshots REAIS do app de DEV
// para enviar ao projeto do claude.ai/design (D-395).
//
// Uso:
//   node scripts/capturar-telas.mjs --versao v1
//   node scripts/capturar-telas.mjs --versao v2 --base http://localhost:4302
//
// Saída: capturas/<versao>/*.jpg + indice.md (índice das telas).
//
// Como funciona: sobe o Chrome instalado em modo headless com o
// DevTools Protocol e dirige a navegação por WebSocket nativo do Node
// (sem puppeteer/playwright — nenhuma dependência nova no projeto).
//
// SEGURANÇA: só clica em botões que ABREM modais/telas. Nunca aprova,
// rejeita, renderiza, publica ou deleta — a lista `ACOES` é explícita.
// ─────────────────────────────────────────────────────────────
import { spawn } from 'node:child_process';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const arg = (nome, padrao) => {
  const i = args.indexOf(`--${nome}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : padrao;
};

const BASE = arg('base', 'http://localhost:4302');
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

/** Projetos-cobaia do banco DEV (ajuste se trocar a base de teste). */
const PROJ_COM_VIDEO = process.env.CAPTURA_PROJETO_VIDEO ?? 'd8e0b585-da97-4739-98da-e93f34795ad5';
const PROJ_MULTI_CORTES = process.env.CAPTURA_PROJETO_CORTES ?? 'e3d5cadf-2370-495e-8211-ec6087042687';

/**
 * Telas capturadas. `acao` roda no browser DEPOIS do load — use apenas
 * para abrir modais/paineis (nada destrutivo).
 */
const TELAS = [
  { id: '01-biblioteca', titulo: 'Biblioteca (lista de projetos)', rota: '/projetos' },
  {
    id: '02-workspace',
    titulo: 'Workspace do projeto (cards de corte)',
    rota: `/projetos/${PROJ_MULTI_CORTES}`,
  },
  {
    id: '03-bruto',
    titulo: 'Editor Bruto (player + timeline + trechos)',
    rota: `/projetos/${PROJ_COM_VIDEO}/cortes`,
    espera: 4000,
  },
  {
    id: '04-pos',
    titulo: 'Pós-produção (cenas + preview + layout YouTube)',
    rota: `/projetos/${PROJ_MULTI_CORTES}/post-production`,
    espera: 4000,
  },
  {
    id: '05-revisao-final',
    titulo: 'Revisão final (vídeo final + checklist + capa)',
    rota: `/projetos/${PROJ_MULTI_CORTES}/final-review`,
    espera: 3500,
  },
  {
    id: '06-metadados',
    titulo: 'Metadados & thumbnails',
    rota: `/projetos/${PROJ_MULTI_CORTES}/metadados`,
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
    acao: `[...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Aplicação')?.click()`,
  },
  {
    id: '14-config-skills',
    titulo: 'Configurações · Skills editoriais (bloco-portal aberto)',
    rota: '/canais',
    acao: `[...document.querySelectorAll('button')].find(b => b.textContent.includes('Skills editoriais'))?.click()`,
    espera: 2500,
  },
];

/** Modais — abertos por clique seguro (nada destrutivo). */
const MODAIS = [
  {
    id: '20-modal-novo-projeto',
    titulo: 'Modal · Novo projeto',
    rota: '/projetos',
    acao: `[...document.querySelectorAll('button')].find(b => b.textContent.includes('Novo projeto'))?.click()`,
  },
  {
    id: '21-modal-analise-ia',
    titulo: 'Modal · Análise IA',
    rota: `/projetos/${PROJ_MULTI_CORTES}`,
    acao: `[...document.querySelectorAll('button')].find(b => b.textContent.includes('Análise IA'))?.click()`,
  },
  {
    id: '22-modal-auditoria',
    titulo: 'Modal · Auditar análise',
    rota: `/projetos/${PROJ_MULTI_CORTES}`,
    acao: `[...document.querySelectorAll('button')].find(b => b.textContent.includes('Auditar análise'))?.click()`,
    espera: 2500,
  },
  {
    id: '23-modal-publicar-massa',
    titulo: 'Modal · Publicar em massa',
    rota: `/projetos/${PROJ_MULTI_CORTES}`,
    acao: `[...document.querySelectorAll('button')].find(b => b.textContent.includes('Publicar em massa'))?.click()`,
  },
  {
    id: '24-modal-adicionar-corte',
    titulo: 'Modal · Adicionar corte manualmente',
    rota: `/projetos/${PROJ_COM_VIDEO}/cortes`,
    acao: `document.querySelector('[aria-label="Adicionar corte manualmente"]')?.click()`,
    espera: 4000,
  },
  {
    id: '25-modal-atalhos-editor',
    titulo: 'Modal · Atalhos do editor (?)',
    rota: `/projetos/${PROJ_COM_VIDEO}/cortes`,
    acao: `document.querySelector('[aria-label="Atalhos"]')?.click()`,
    espera: 4000,
  },
  {
    id: '26-dropdown-nova-aba',
    titulo: 'Dropdown · Nova aba (seletor de projeto)',
    rota: '/projetos',
    acao: `document.querySelector('[aria-label="Nova aba de trabalho"]')?.click()`,
  },
  {
    id: '27-modal-metadados',
    titulo: 'Modal · Metadados (a partir do painel de cortes)',
    rota: `/projetos/${PROJ_COM_VIDEO}/cortes`,
    acao: `[...document.querySelectorAll('[aria-label^="Abrir metadados"]')][0]?.click()`,
    espera: 4000,
  },
];

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

async function main() {
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

    const capturar = async ({ id, titulo, rota, acao, espera = 2200 }, tema) => {
      const sufixo = tema === 'dark' ? '-escuro' : '';
      const arquivo = `${id}${sufixo}.jpg`;

      // Tema + flag do shell aplicados antes de qualquer script da página.
      await cdp.enviar('Page.addScriptToEvaluateOnNewDocument', {
        source: `try {
          localStorage.setItem('wb-theme', ${JSON.stringify(tema)});
          localStorage.setItem('workbench-shell', '1');
        } catch (e) {}`,
      });

      await cdp.enviar('Page.navigate', { url: `${BASE}${rota}` });
      await esperar(espera);
      if (acao) {
        await cdp.enviar('Runtime.evaluate', { expression: acao, awaitPromise: false });
        await esperar(1200);
      }

      const { data } = await cdp.enviar('Page.captureScreenshot', { format: 'jpeg', quality: 90 });
      await writeFile(path.join(SAIDA, arquivo), Buffer.from(data, 'base64'));
      capturadas.push({ arquivo, titulo, rota, tema });
      process.stdout.write(`  ✓ ${arquivo}\n`);
    };

    console.log(`\nCapturando ${VERSAO} de ${BASE} (${LARGURA}×${ALTURA})\n`);
    console.log('Telas:');
    for (const tela of TELAS) await capturar(tela, 'light');
    console.log('Modais:');
    for (const modal of MODAIS) await capturar(modal, 'light');
    console.log('Tema escuro:');
    for (const tela of TELAS.filter((t) => TAMBEM_NO_ESCURO.has(t.id))) {
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
