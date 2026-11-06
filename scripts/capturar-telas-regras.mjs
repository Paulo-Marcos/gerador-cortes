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
