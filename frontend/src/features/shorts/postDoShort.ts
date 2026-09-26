// D-565 (onda 3): as regras do texto de publicação, do lado da tela.
//
// O título do post NÃO é o gancho e NÃO é o título de curadoria. São três
// textos com três leitores:
//
//   gancho     → quem está rolando, dentro do vídeo, em 3s
//   título     → quem já parou, abaixo do vídeo, ~40 caracteres visíveis
//   descrição  → quem quer mais, e é onde o link do corte longo faz o funil
//
// Os números abaixo espelham `backend/app/domain/publicacao/publicacao.py` (limites da
// plataforma) e `domain/metadados_short.py` (tetos de gravação). Como os
// projetos não compartilham módulo, `postDoShort.test.ts` LÊ os dois arquivos e
// compara — se uma ponta mudar sozinha, o teste cai em vez de a tela prometer
// um espaço que a plataforma não dá.

/** Espelha `titulo_visivel` de YOUTUBE_SHORTS em `backend/app/domain/publicacao/publicacao.py`. */
export const TITULO_VISIVEL = 40;

/** Espelha `titulo_max` de YOUTUBE_SHORTS em `backend/app/domain/publicacao/publicacao.py`. */
export const TITULO_MAX = 100;

/** Espelha `MAX_HASHTAGS` em `backend/app/domain/short/metadados_short.py`. */
export const MAX_HASHTAGS = 10;

/** Hashtags que cada plataforma mostra — o que passa disso é escrito à toa. */
export const HASHTAGS_POR_PLATAFORMA = {
  'YouTube Shorts': 3,
  TikTok: 5,
  'Instagram Reels': 10,
} as const;

export type TomDoTitulo = 'vazio' | 'cabe' | 'corta';

/**
 * Como a tela julga o título.
 *
 * O corte em 40 caracteres não é erro — é informação. Título mais longo é
 * legítimo (a plataforma aceita 100), mas o operador precisa saber que o que
 * passa dali só aparece depois do "mais", e portanto não pode carregar o peso.
 */
export function tomDoTitulo(titulo: string): TomDoTitulo {
  const limpo = titulo.trim();
  if (!limpo) return 'vazio';
  return limpo.length <= TITULO_VISIVEL ? 'cabe' : 'corta';
}

/** O pedaço do título que aparece antes do "mais", na plataforma mais apertada. */
export function parteVisivel(titulo: string): string {
  return titulo.slice(0, TITULO_VISIVEL);
}

/** O pedaço que só aparece depois do "mais". Vazio quando tudo cabe. */
export function parteEscondida(titulo: string): string {
  return titulo.slice(TITULO_VISIVEL);
}

/** O recado de uma linha que acompanha o contador do título. */
export function recadoDoTitulo(tom: TomDoTitulo): string {
  switch (tom) {
    case 'vazio':
      return 'Sem título escrito: a publicação usa o título da curadoria.';
    case 'cabe':
      return 'Cabe inteiro no feed, antes do "mais".';
    case 'corta':
      return `Depois de ${TITULO_VISIVEL} caracteres o texto some atrás do "mais" — o peso tem de vir antes.`;
  }
}

/**
 * Onde cada plataforma corta as hashtags escritas.
 *
 * Serve para a tela dizer "as duas últimas só aparecem no Reels" em vez de
 * deixar o operador escrever dez achando que todas valem em todo lugar.
 */
export function cortePorPlataforma(quantas: number): { plataforma: string; usa: number }[] {
  return Object.entries(HASHTAGS_POR_PLATAFORMA).map(([plataforma, teto]) => ({
    plataforma,
    usa: Math.min(quantas, teto),
  }));
}

/** O texto do campo vira a lista de termos, com a mesma limpeza do backend. */
export function hashtagsDoTexto(texto: string): string[] {
  const vistas = new Set<string>();
  const limpas: string[] = [];
  for (const bruta of texto.split(/[\s,]+/)) {
    const tag = bruta.replace(/[^0-9A-Za-zÀ-ÿ]+/g, '');
    if (!tag || vistas.has(tag.toLowerCase())) continue;
    vistas.add(tag.toLowerCase());
    limpas.push(tag);
    if (limpas.length === MAX_HASHTAGS) break;
  }
  return limpas;
}

/** A lista de volta no campo, como o operador a edita. */
export function textoDasHashtags(hashtags: string[]): string {
  return hashtags.join(' ');
}

/**
 * O Finalizar escreve o post sozinho — mas só quando ainda não há um.
 *
 * Um texto já gerado pode ter sido revisado à mão; reescrevê-lo num Finalizar
 * seria apagar a revisão sem aviso. Se nem dá para saber se existe, não
 * escreve: o botão "Escrever com a IA" continua no painel.
 */
export async function escreverPostSeFaltar(
  buscarPost: () => Promise<{ gerado: boolean }>,
  escrever: () => void,
): Promise<void> {
  try {
    const post = await buscarPost();
    if (!post.gerado) escrever();
  } catch {
    // Sem saber, não escreve — ver acima.
  }
}
