/**
 * Auto-fit do número da cena `destaque_numerico`.
 *
 * O número é renderizado num corpo fixo (antes: 360px cravado), o que estourava
 * a referência visual do anel reticle quando o valor era grande ("1.000.000",
 * "45 anos"). Aqui derivamos o `fontSize` a partir do comprimento do texto FINAL
 * — o mesmo espírito determinístico do `sizeFor`/`fontSizeFor` dos outros cards
 * (CenaEnfase, CenaComparativo, CenaCitacao), porém contínuo em vez de degraus.
 *
 * É puro de propósito (sem React/Remotion): roda em qualquer ambiente e é
 * testável isoladamente.
 */

export interface NumeroFitOptions {
  /** Corpo máximo, usado quando o texto é curto. Default 360. */
  baseSize?: number;
  /** Piso de corpo para textos muito longos. Default 96. */
  minSize?: number;
  /**
   * Largura útil (px) na qual o número deve caber. Default 660 — mantém o
   * número dentro do anel reticle de fundo (780px) com respiro.
   */
  maxWidth?: number;
  /**
   * Avanço médio de glifo dividido pelo fontSize, para a fonte display pesada.
   * Estima a largura sem medir o DOM. Default 0.6 (conservador).
   */
  glyphRatio?: number;
}

/**
 * Retorna o `fontSize` (px) para o número caber em `maxWidth`, partindo de
 * `baseSize` e reduzindo proporcionalmente conforme o texto cresce.
 *
 * @param texto Texto FINAL a exibir (valor formatado + sufixo). Usar o valor
 *   final — e não o número animado da contagem — mantém o corpo estável durante
 *   o count-up, evitando "jitter" de escala.
 */
export function numeroFontSize(texto: string, options: NumeroFitOptions = {}): number {
  const { baseSize = 360, minSize = 96, maxWidth = 660, glyphRatio = 0.6 } = options;

  // Conta por codepoint para não contar pares substitutos como 2 caracteres.
  const len = [...String(texto ?? "")].length;
  if (len <= 0) return baseSize;

  const larguraNoBase = len * glyphRatio * baseSize;
  if (larguraNoBase <= maxWidth) return baseSize;

  const corpoCalculado = maxWidth / (len * glyphRatio);
  return Math.max(minSize, Math.round(corpoCalculado));
}

/**
 * D-429 — leitura do valor da cena `destaque_numerico`.
 *
 * O campo `numero` chega da IA como número JSON ("1914") OU como token de
 * exibição já pronto em pt-BR ("1,5 milhão", "R$ 100", "600.000+", "6x1",
 * "15/09/1850"). A leitura antiga reduzia tudo a `Number(raw.replace(/[^\d.-]/g,""))`
 * só para animar a contagem, e nisso corrompia o valor: a vírgula decimal sumia
 * ("1,5 milhão" → "15 milhão"), o separador de milhar era comido ("40.000" → "40"),
 * o prefixo virava sufixo ("R$ 100" → "100R$ ") e datas viravam ruído
 * ("15/09/1850" → "15.091.850//").
 *
 * Aqui o token é lido UMA vez e decomposto em prefixo + núcleo + sufixo. Quando
 * há exatamente um núcleo numérico, ele alimenta a contagem — preservando as
 * casas decimais e o estilo de separador que o autor escreveu. Quando há zero ou
 * mais de um (datas, placares, "Top 10"), não há o que contar: o texto é exibido
 * literalmente, que é a única leitura fiel possível.
 */
export interface NumeroDestaque {
  /** Texto integral a exibir ao fim da animação. */
  textoFinal: string;
  /** Trecho antes do núcleo ("R$ "). Vazio quando não há núcleo. */
  prefixo: string;
  /** Trecho depois do núcleo ("%", " milhões"). Vazio quando não há núcleo. */
  sufixo: string;
  /** Valor do núcleo, ou `null` quando o token não tem núcleo animável. */
  valor: number | null;
  /** Casas decimais escritas no núcleo — o count-up não pode perdê-las. */
  casasDecimais: number;
  /** O núcleo original usava separador de milhar? Anos ("1888") não usam. */
  usaSeparadorMilhar: boolean;
}

/** Um número com separadores, opcionalmente negativo: "-1.234,56", "64.5", "12". */
const NUCLEO_NUMERICO = /-?\d+(?:[.,]\d+)*/g;

/**
 * Inteiros nesta faixa são lidos como ANO e saem sem separador de milhar —
 * "1914", não "1.914". É a leitura certa na esmagadora maioria das cenas do
 * canal (datas históricas); uma quantidade nessa faixa perde só o ponto.
 */
const FAIXA_ANO = { min: 1000, max: 2999 } as const;

const contarDecimais = (valor: number): number => {
  const fracao = String(valor).split(".")[1];
  return fracao ? fracao.length : 0;
};

/** O que se extrai do núcleo: valor e o estilo em que ele foi escrito. */
interface NucleoLido {
  valor: number;
  casasDecimais: number;
  usaSeparadorMilhar: boolean;
}

/** Token sem núcleo animável: só há o que exibir, nada a contar. */
const semNucleo = (texto: string): NumeroDestaque => ({
  textoFinal: texto,
  prefixo: "",
  sufixo: "",
  valor: null,
  casasDecimais: 0,
  usaSeparadorMilhar: false,
});

/** Interpreta o núcleo escrito, decidindo se `.`/`,` é milhar ou decimal. */
function lerNucleo(nucleo: string): NucleoLido | null {
  const negativo = nucleo.startsWith("-");
  const digitos = negativo ? nucleo.slice(1) : nucleo;
  const ultimoSeparador = Math.max(digitos.lastIndexOf("."), digitos.lastIndexOf(","));

  if (ultimoSeparador < 0) {
    const valor = Number(digitos);
    if (!Number.isFinite(valor)) return null;
    return { valor: negativo ? -valor : valor, casasDecimais: 0, usaSeparadorMilhar: false };
  }

  // Grupo de 3 dígitos no fim é milhar ("1.888", "600.000"); qualquer outro
  // tamanho é a parte decimal ("64.5", "1,5", "45,75").
  const digitosDepois = digitos.length - ultimoSeparador - 1;
  const ehDecimal = digitosDepois !== 3;

  const parteInteira = ehDecimal ? digitos.slice(0, ultimoSeparador) : digitos;
  const parteDecimal = ehDecimal ? digitos.slice(ultimoSeparador + 1) : "";
  const inteiroLimpo = parteInteira.replace(/[.,]/g, "");
  const valor = Number(parteDecimal ? `${inteiroLimpo}.${parteDecimal}` : inteiroLimpo);
  if (!Number.isFinite(valor)) return null;

  return {
    valor: negativo ? -valor : valor,
    casasDecimais: parteDecimal.length,
    usaSeparadorMilhar: /[.,]/.test(parteInteira),
  };
}

/** Formata o núcleo no mesmo estilo em que foi escrito (pt-BR). */
export function formatarNucleoDestaque(
  valor: number,
  estilo: Pick<NumeroDestaque, "casasDecimais" | "usaSeparadorMilhar">,
): string {
  return valor.toLocaleString("pt-BR", {
    minimumFractionDigits: estilo.casasDecimais,
    maximumFractionDigits: estilo.casasDecimais,
    useGrouping: estilo.usaSeparadorMilhar,
  });
}

/** Número JSON: o estilo é inferido, já que não há token escrito. */
function lerNumeroJson(bruto: number): NumeroDestaque {
  const ehAno = Number.isInteger(bruto) && bruto >= FAIXA_ANO.min && bruto <= FAIXA_ANO.max;
  const estilo = { casasDecimais: contarDecimais(bruto), usaSeparadorMilhar: !ehAno };
  return {
    textoFinal: formatarNucleoDestaque(bruto, estilo),
    prefixo: "",
    sufixo: "",
    valor: bruto,
    ...estilo,
  };
}

/** Token escrito pela IA: exibido como está, com o núcleo isolado para a contagem. */
function lerToken(texto: string): NumeroDestaque {
  const nucleos = texto.match(NUCLEO_NUMERICO);
  // Zero núcleos ("Plano Real") ou vários ("15/09/1850", "6x1", "250 vs 100"):
  // não existe contagem coerente — o token vale como está escrito.
  if (!nucleos || nucleos.length !== 1) return semNucleo(texto);

  const nucleo = nucleos[0];
  const lido = lerNucleo(nucleo);
  if (!lido) return semNucleo(texto);

  const inicio = texto.indexOf(nucleo);
  return {
    textoFinal: texto,
    prefixo: texto.slice(0, inicio),
    sufixo: texto.slice(inicio + nucleo.length),
    ...lido,
  };
}

/** Decompõe o valor bruto da cena em prefixo + núcleo animável + sufixo. */
export function analisarNumeroDestaque(bruto: unknown): NumeroDestaque {
  if (typeof bruto === "number" && Number.isFinite(bruto)) return lerNumeroJson(bruto);

  const texto = String(bruto ?? "").trim();
  return texto ? lerToken(texto) : semNucleo("");
}
