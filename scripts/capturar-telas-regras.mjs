// ─────────────────────────────────────────────────────────────
// capturar-telas-regras.mjs — as regras que fazem o capturar-telas.mjs
// falhar alto (D-1069).
//
// Na v0.7.0 o script saiu com exit 0 e 28 imagens, 13 delas cópias de
// outras: os modais procuravam botões que a casca nova renomeou, o
// `?.click()` não fazia nada sem o botão, e o tema escuro era gravado
// numa chave que ninguém mais lia. Cada regra daqui transforma um desses
// silêncios num erro com o nome da tela. Ficam num módulo à parte, sem
// Chrome nem rede, para o vitest do frontend poder prová-las.
// ─────────────────────────────────────────────────────────────
import { createHash } from 'node:crypto';

/** Erro de captura: a mensagem sempre começa pela tela que falhou. */
export class ErroDeCaptura extends Error {
  constructor(tela, mensagem) {
    super(`[${tela}] ${mensagem}`);
    this.name = 'ErroDeCaptura';
    this.tela = tela;
  }
}

/**
 * Índice do primeiro candidato cujo texto OU aria-label casa com o alvo,
 * ou -1. Roda também DENTRO do navegador (vai pelo `toString()` em
 * `montarClique`): não pode usar nada de fora do próprio corpo.
 */
export function acharAlvo(candidatos, alvo) {
  const casa = (valor) => {
    if (typeof valor !== 'string' || valor === '') return false;
    if (alvo.nome !== undefined) return valor === alvo.nome;
    if (alvo.nomeComeca !== undefined) return valor.startsWith(alvo.nomeComeca);
    if (alvo.nomeContem !== undefined) return valor.includes(alvo.nomeContem);
    if (alvo.nomeRegex !== undefined) return new RegExp(alvo.nomeRegex).test(valor);
    return false;
  };
  return candidatos.findIndex((c) => casa(c.texto) || casa(c.rotulo));
}

/** O alvo em português, para a mensagem de erro. */
export function descreverAlvo(alvo) {
  if (alvo.nome !== undefined) return `o botão "${alvo.nome}"`;
  if (alvo.nomeComeca !== undefined) return `um botão que começa com "${alvo.nomeComeca}"`;
  if (alvo.nomeContem !== undefined) return `um botão que contém "${alvo.nomeContem}"`;
  if (alvo.nomeRegex !== undefined) return `um botão que casa com /${alvo.nomeRegex}/`;
  return 'um alvo sem nome (a entrada da tela está errada)';
}

/**
 * A expressão que o Chrome avalia para clicar no alvo. Só elementos
 * visíveis contam: um botão escondido não é o que a pessoa vê na tela.
 * Devolve `{ achou, desabilitado }` em vez de clicar às cegas.
 */
export function montarClique(alvo) {
  return `(() => {
    const achar = ${acharAlvo.toString()};
    const els = [...document.querySelectorAll('button, [role="button"], [role="menuitem"]')]
      .filter((e) => e.getClientRects().length > 0);
    const candidatos = els.map((e) => ({
      texto: (e.textContent ?? '').trim(),
      rotulo: e.getAttribute('aria-label') ?? '',
      desabilitado: e.disabled === true || e.getAttribute('aria-disabled') === 'true',
    }));
    const i = achar(candidatos, ${JSON.stringify(alvo)});
    if (i < 0) return { achou: false, desabilitado: false };
    if (candidatos[i].desabilitado) return { achou: true, desabilitado: true };
    els[i].click();
    return { achou: true, desabilitado: false };
  })()`;
}

/** O clique tem de ter achado o alvo, e o alvo tem de estar habilitado. */
export function conferirClique(resultado, tela, alvo, requisito) {
  const dica = requisito ? ` ${requisito}` : '';
  if (!resultado?.achou) {
    throw new ErroDeCaptura(tela, `não achei ${descreverAlvo(alvo)} na tela.${dica}`);
  }
  if (resultado.desabilitado) {
    throw new ErroDeCaptura(tela, `${descreverAlvo(alvo)} está desabilitado.${dica}`);
  }
}

/** Um modal só conta como aberto se apareceu um elemento a mais no seletor. */
export function conferirAbertura(antes, depois, tela, seletor) {
  if (depois <= antes) {
    throw new ErroDeCaptura(tela, `o clique não abriu nada: ${seletor} continuou com ${depois} elemento(s).`);
  }
}

/** A casca tem de estar no tema pedido (`data-theme` do `.ap`). */
export function conferirTema(lido, pedido, tela) {
  if (lido !== pedido) {
    throw new ErroDeCaptura(tela, `pedi o tema "${pedido}", a casca está em "${lido ?? 'nenhum'}".`);
  }
}

/** Guarda o sha256 de cada captura; uma repetida é a tela de fundo de novo. */
export function criarRegistroDeHashes() {
  const vistos = new Map();
  return {
    registrar(tela, arquivo, bytes) {
      const hash = createHash('sha256').update(bytes).digest('hex');
      const anterior = vistos.get(hash);
      if (anterior) {
        throw new ErroDeCaptura(
          tela,
          `${arquivo} saiu idêntica a ${anterior} (sha256 ${hash.slice(0, 12)}…): a ação ou o tema não mudou a tela.`,
        );
      }
      vistos.set(hash, arquivo);
      return hash;
    },
  };
}

/**
 * Os projetos-cobaia, escolhidos no banco pela API (D-1069 tirou os IDs
 * fixos, que davam 404 assim que a base mudava).
 *
 * - com vídeo: o vídeo ainda no disco (não limpo) e cortes para o editor;
 * - vários cortes: o de mais cortes prontos para publicar (o modal de
 *   publicar em massa só abre com um), e, no empate, o de mais cortes.
 *
 * `prontosPorProjeto` mapeia id → cortes prontos ainda não publicados.
 */
export function escolherProjetosPadrao(projetos, prontosPorProjeto = {}) {
  const porCortes = (a, b) => b.total_cortes - a.total_cortes;
  const comVideo = projetos
    .filter((p) => p.arquivo_video_path && !p.arquivos_limpos && p.total_cortes > 0)
    .sort(porCortes)[0];
  const prontos = (p) => prontosPorProjeto[p.id] ?? 0;
  const multiCortes = projetos
    .filter((p) => p.total_cortes >= 2)
    .sort((a, b) => prontos(b) - prontos(a) || porCortes(a, b))[0];
  if (!comVideo) {
    throw new ErroDeCaptura('projetos', 'nenhum projeto com vídeo no disco e cortes; defina CAPTURA_PROJETO_VIDEO.');
  }
  if (!multiCortes) {
    throw new ErroDeCaptura('projetos', 'nenhum projeto com dois ou mais cortes; defina CAPTURA_PROJETO_CORTES.');
  }
  return { comVideo: comVideo.id, multiCortes: multiCortes.id };
}

/** O que conta como modal aberto (Modal e UpgradeModal usam role="dialog"). */
export const DIALOGO = '[role="dialog"]';

const MAIS = { clicar: { nome: 'Mais' } };

/**
 * Telas e modais, montados com os projetos-cobaia (`video`, `cortes`).
 * Mora aqui, e não no script, para o teste fixar a lista: é ela que
 * garante que nada destrutivo é clicado e que todo modal confere a abertura.
 * `passos` roda no browser DEPOIS do load, em ordem: `clicar` acha um
 * botão pelo texto ou aria-label, `tecla` aperta um atalho. Só abre
 * modais e painéis — nada destrutivo. `abre` exige um elemento novo.
 */
export function montarTelas({ video, cortes }) {
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
