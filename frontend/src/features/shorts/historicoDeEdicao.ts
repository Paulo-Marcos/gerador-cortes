// D-581: desfazer e refazer na curadoria de shorts.
//
// ## Por que NÃO é o `useEditHistory` do editor de bruto
//
// Porque o modelo de gravação é outro, e copiar o do bruto aqui seria reescrever
// a tela inteira para ganhar um Ctrl+Z.
//
// No bruto, a edição fica LOCAL num `dirty: Partial<Corte>` e só o Ctrl+S grava.
// O histórico de lá é sobre esse rascunho: `past/present/future` de um valor só.
//
// Nos shorts, toda mudança é um PATCH imediato — e isso não é acidente. A prévia
// do palco, a régua e o `plano_desenhavel` leem o estado GRAVADO: é o backend
// que resolve a herança (D-570) e devolve o desenho. Um rascunho local obrigaria
// cada um desses a saber desenhar por cima de algo que o banco não tem, que é a
// segunda implementação que o épico do palco inteiro existe para evitar.
//
// Então o histórico aqui guarda outra coisa: o par (o que estava, o que ficou)
// de cada gravação. Desfazer é mandar de volta o "o que estava" — um PATCH como
// qualquer outro. O banco continua sendo a única verdade, e nada fica pendente
// quando a aba fecha.
//
// ## Por que o "antes" é capturado por quem chama
//
// Porque só ele sabe o valor anterior no instante certo: depois que a mutation
// sai, a lista já foi invalidada e o valor velho não existe em lugar nenhum.
import type { AtualizarShortBody } from './shortsApi';

/** Os campos que uma gravação pode mexer, sem o id — ele viaja fora. */
export type MudancaDoShort = Omit<AtualizarShortBody, never>;

export interface PassoDaEdicao {
  shortId: string;
  /** O rótulo que a tela mostra: "bordas", "gancho", "palco"… */
  rotulo: string;
  /** Os mesmos campos, com os valores de ANTES da gravação. */
  antes: MudancaDoShort;
  /** O que foi gravado. */
  depois: MudancaDoShort;
}

export interface HistoricoDeEdicao {
  passados: PassoDaEdicao[];
  futuros: PassoDaEdicao[];
}

/** Teto de passos guardados — sessão longa não pode crescer sem fim. */
export const LIMITE = 60;

export const HISTORICO_VAZIO: HistoricoDeEdicao = { passados: [], futuros: [] };

/**
 * Registra uma gravação nova.
 *
 * Limpa o futuro, como todo histórico linear: editar depois de desfazer
 * invalida o caminho de refazer, e mantê-lo produziria um "refazer" que aplica
 * uma mudança que não faz mais sentido sobre o estado atual.
 */
export function empilhar(
  historico: HistoricoDeEdicao,
  passo: PassoDaEdicao,
  limite = LIMITE,
): HistoricoDeEdicao {
  const passados = [...historico.passados, passo];
  if (passados.length > limite) passados.shift();
  return { passados, futuros: [] };
}

/** O passo a desfazer e o histórico resultante, ou `null` se não há o que desfazer. */
export function desfazer(
  historico: HistoricoDeEdicao,
): { passo: PassoDaEdicao; historico: HistoricoDeEdicao } | null {
  const passo = historico.passados.at(-1);
  if (!passo) return null;
  return {
    passo,
    historico: {
      passados: historico.passados.slice(0, -1),
      futuros: [passo, ...historico.futuros],
    },
  };
}

/** O passo a refazer e o histórico resultante, ou `null` se não há futuro. */
export function refazer(
  historico: HistoricoDeEdicao,
): { passo: PassoDaEdicao; historico: HistoricoDeEdicao } | null {
  const [passo, ...resto] = historico.futuros;
  if (!passo) return null;
  return {
    passo,
    historico: { passados: [...historico.passados, passo], futuros: resto },
  };
}

/**
 * O "antes" de uma mudança, lido do short que está na tela.
 *
 * Só as chaves que a mudança toca — gravar o short inteiro faria o desfazer
 * reescrever campos que ninguém mexeu, e um deles poderia ter sido alterado
 * por outra via no meio do caminho.
 *
 * Chave ausente no short vira `undefined` e é DESCARTADA: mandá-la ao backend
 * como `null` seria pedir para apagar um campo que só estava indefinido porque
 * o backend ainda não o conhece.
 */
export function valoresAnteriores(
  short: Record<string, unknown> | undefined,
  mudanca: MudancaDoShort,
): MudancaDoShort {
  if (!short) return {};
  const antes: Record<string, unknown> = {};
  for (const chave of Object.keys(mudanca)) {
    const valor = short[chave];
    if (valor !== undefined) antes[chave] = valor;
  }
  return antes as MudancaDoShort;
}

/**
 * Um passo é reversível?
 *
 * Nem toda gravação sabe voltar: se o short não tinha o campo (backend antigo,
 * ou campo que nasce só agora), o "antes" sai vazio e desfazer não mandaria
 * nada. Empilhar um passo assim daria um Ctrl+Z que pisca e não faz — pior que
 * um Ctrl+Z desabilitado, porque o operador conta com ele.
 */
export function ehReversivel(passo: PassoDaEdicao): boolean {
  return Object.keys(passo.antes).length > 0;
}

/**
 * Como a tela nomeia o que acabou de mudar.
 *
 * Uma palavra por grupo de campos, e não o nome técnico: "Desfazer bordas" diz
 * o que volta; "Desfazer inicio_seg" faz o operador traduzir.
 */
export function rotuloDaMudanca(mudanca: MudancaDoShort): string {
  const chaves = new Set(Object.keys(mudanca));
  if (chaves.has('status')) return 'a decisão';
  if (chaves.has('inicio_seg') || chaves.has('fim_seg')) return 'as bordas';
  if (chaves.has('gancho_tela') || chaves.has('gancho_cor') || chaves.has('gancho_realce')) {
    return 'o gancho';
  }
  if (chaves.has('legenda_cor') || chaves.has('legenda_fonte')) return 'a legenda';
  if (chaves.has('foco_x')) return 'o enquadramento';
  return 'o palco';
}
