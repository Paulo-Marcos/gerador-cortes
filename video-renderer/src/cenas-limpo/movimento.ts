/**
 * D-918: o movimento das cenas no estilo limpo (canvas "Movimento"), em funções
 * puras de quadro → valor, para dar para testar quadro a quadro.
 *
 * A curva é uma só: o traço cresce primeiro (6 quadros), depois o texto entra
 * linha a linha, cada linha subindo 10 px em 6 quadros, com 4 quadros entre uma
 * e a próxima; no fim tudo sai em 6. Nada desliza de lado, nada pisca. Sem
 * Remotion aqui de propósito: o frontend importa estes números.
 */
export const QUADROS = {
  traco: 6,
  linha: 6,
  intervalo: 4,
  saida: 6,
  sublinhado: 8,
  contagem: 20,
} as const;

/** Quanto a linha sobe ao entrar, em px. */
export const SUBIDA = 10;

/** A barra inferior (nome de quem fala) nunca fica mais que isto em tela. */
export const LIMITE_DA_BARRA_INFERIOR_SEG = 4;

/** Abaixo deste intervalo, duas cenas da mesma família viram uma só: o traço fica. */
export const INTERVALO_DO_MORPH_SEG = 0.25;

const limitar = (valor: number) => Math.min(1, Math.max(0, valor));

/** Desaceleração (ease-out cúbica): começa rápido e assenta. */
export const assentar = (t: number) => 1 - (1 - limitar(t)) ** 3;

/** 0 → 1 do traço crescendo; já cheio quando a cena continua a anterior. */
export function progressoDoTraco(quadro: number, continuaDaAnterior = false): number {
  if (continuaDaAnterior) return 1;
  return assentar(quadro / QUADROS.traco);
}

/** A linha `indice` (0 = kicker): começa depois do traço e das anteriores. */
export function estadoDaLinha(quadro: number, indice: number): { opacidade: number; subida: number } {
  const inicio = QUADROS.traco + indice * QUADROS.intervalo;
  const t = assentar((quadro - inicio) / QUADROS.linha);
  return { opacidade: t, subida: (1 - t) * SUBIDA };
}

/** 1 → 0 nos últimos 6 quadros da cena; fica em 1 quando a próxima continua esta. */
export function opacidadeDeSaida(quadro: number, fimEmQuadros: number, continuaNaProxima = false): number {
  if (continuaNaProxima) return 1;
  return limitar((fimEmQuadros - quadro) / QUADROS.saida);
}

/** 0 → 1 do sublinhado da ênfase, desenhado da esquerda para a direita. */
export function progressoDoSublinhado(quadro: number): number {
  return assentar((quadro - QUADROS.traco) / QUADROS.sublinhado);
}

/** O valor da contagem do número em destaque, do zero ao valor final. */
export function valorDaContagem(quadro: number, valorFinal: number): number {
  return valorFinal * assentar((quadro - QUADROS.traco) / QUADROS.contagem);
}

/** Quantos quadros a cena fica em tela; a barra inferior para em 4 s. */
export function duracaoEmQuadros(tipo: string, inicioSeg: number, fimSeg: number, fps: number): number {
  const segundos = Math.max(0, fimSeg - inicioSeg);
  const limite = tipo === "barra_inferior" ? Math.min(segundos, LIMITE_DA_BARRA_INFERIOR_SEG) : segundos;
  return Math.max(1, Math.round(limite * fps));
}

// As famílias do morph: cenas que são o mesmo Bloco de coluna trocam só o
// texto; as de forma própria (lista, linha do tempo, quadro inteiro...) nunca.
const FAMILIA_DA_COLUNA = new Set([
  "card_informacao",
  "definicao_termo",
  "pergunta_transicao",
  "ficha_biografica",
  "marco_historico",
  "citacao_autor",
  "destaque_numerico",
  "pergunta_chat",
]);

export function familiaDaCena(tipo: string): string {
  return FAMILIA_DA_COLUNA.has(tipo) ? "coluna" : tipo;
}

interface Intervalo {
  tipo: string;
  inicio: number;
  fim: number;
}

/** A próxima cena continua esta (morph): mesma família e menos de 0,25 s entre as duas. */
export function continuaNaProxima(atual: Intervalo, proxima: Intervalo | undefined): boolean {
  if (!proxima) return false;
  const intervalo = proxima.inicio - atual.fim;
  return (
    intervalo >= 0 &&
    intervalo < INTERVALO_DO_MORPH_SEG &&
    familiaDaCena(atual.tipo) === familiaDaCena(proxima.tipo)
  );
}
