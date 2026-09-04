import type { Desvio, DesvioCategoria, DesvioOrigem } from '@/types/models';

/**
 * D-422: o badge do trecho mostra o MOTIVO da remoção, não quem a propôs.
 *
 * Antes o rótulo vinha de `origem`, então todo trecho da IA aparecia como "IA".
 * Agora `categoria` (vocabulário fechado, normalizado no backend por
 * `domain/desvio_categoria.py`) manda; `origem` só decide o fallback.
 */
export interface BadgeTrecho {
  label: string;
  /** Explicação da categoria, exposta como `title` do badge. */
  titulo: string;
  bg: string;
  fg: string;
  /**
   * D-515: o token da cor forte, para o segmento na timeline.
   *
   * É o MESMO `fg` do badge, num campo próprio: a timeline precisa do token
   * puro para aplicar alpha com `color-mix`, e depender do `fg` por acidente
   * quebraria no dia em que o badge quisesse um tom diferente do da barra.
   */
  token: string;
}

// Paleta por FAMÍLIA, não por categoria: cor carrega urgência (o que revisar),
// o rótulo carrega a distinção. Oito cores diferentes numa lista de 20 trechos
// viram ruído.
//
// D-515: a mesma paleta pinta o segmento na TIMELINE. É o que faz a associação
// funcionar — a barra e o card do mesmo trecho têm a mesma cor, e o olho liga
// as duas metades sem ler. Uma paleta própria para a timeline destruiria
// exatamente o que ela veio resolver.
const AVISO = { bg: 'var(--wb-warn-soft)', fg: 'var(--wb-warn-ink)', token: 'var(--wb-warn)' };
const REDUNDANCIA = {
  bg: 'var(--wb-violet-soft)',
  fg: 'var(--wb-violet)',
  token: 'var(--wb-violet)',
};
const FORA_DO_ASSUNTO = { bg: 'var(--wb-info-soft)', fg: 'var(--wb-info)', token: 'var(--wb-info)' };
const PROBLEMA = { bg: 'var(--wb-err-soft)', fg: 'var(--wb-err-ink)', token: 'var(--wb-err)' };
const NEUTRO = {
  bg: 'var(--wb-bg-inset)',
  fg: 'var(--wb-text-mute)',
  token: 'var(--wb-text-mute)',
};
const IA = { bg: 'var(--wb-accent-soft)', fg: 'var(--wb-accent)', token: 'var(--wb-accent)' };

// D-515: o silêncio SAIU de `FORA_DO_ASSUNTO`.
//
// Ele dividia o azul com tangente e chat, e é a categoria de maior volume —
// numa timeline cheia, quase tudo ficava azul e a cor parava de distinguir
// coisa alguma. Também é a única de origem TÉCNICA: as outras são julgamento
// editorial, esta é o detector. Cor própria, e o card acompanha.
const SILENCIO = { bg: 'var(--wb-bg-inset)', fg: 'var(--wb-ok-ink)', token: 'var(--wb-ok)' };

const BADGE_POR_CATEGORIA: Record<DesvioCategoria, BadgeTrecho> = {
  imprecisao: {
    label: 'impreciso',
    titulo: 'Afirmação possivelmente imprecisa ou errada — confira antes de publicar',
    ...AVISO,
  },
  repeticao: { label: 'repeticao', titulo: 'Reitera ideia já dita, sem avançar', ...REDUNDANCIA },
  tangente: {
    label: 'tangente',
    titulo: 'Digressão ou tangente administrativa fora da história do corte',
    ...FORA_DO_ASSUNTO,
  },
  chat: { label: 'chat', titulo: 'Interação com o chat ao vivo', ...FORA_DO_ASSUNTO },
  silencio: { label: 'silencio', titulo: 'Silêncio detectado (técnico)', ...SILENCIO },
  disfluencia: {
    label: 'muleta',
    titulo: 'Muleta, gagueira, falso começo ou autocorreção',
    ...NEUTRO,
  },
  enrolacao: { label: 'enrolacao', titulo: 'Enrolação sem conteúdo', ...NEUTRO },
  tom: { label: 'fora do tom', titulo: 'Conteúdo fora do tom do canal', ...PROBLEMA },
  // `outro` = a IA não classificou (ou classificou fora do vocabulário): cai no
  // badge por origem, que é o comportamento pré-D-422.
  outro: { label: 'IA', titulo: 'Trecho proposto por IA', ...IA },
};

// Fallback: desvio que chegou sem categoria reconhecida. Tipado por `DesvioOrigem`
// para que uma origem nova não passe sem badge.
const BADGE_POR_ORIGEM: Record<DesvioOrigem, BadgeTrecho> = {
  claude: { label: 'IA', titulo: 'Trecho proposto por IA (Claude)', ...IA },
  gemini: { label: 'IA Gemini', titulo: 'Trecho proposto por IA (Gemini)', ...REDUNDANCIA },
  n8n: { label: 'IA n8n', titulo: 'Trecho proposto por IA (n8n)', ...REDUNDANCIA },
  manual: { label: 'manual', titulo: 'Trecho marcado pelo editor', ...NEUTRO },
  tecnico: BADGE_POR_CATEGORIA.silencio,
};

/**
 * Badge do trecho: `categoria` manda; sem ela, cai no badge por origem.
 *
 * A classificação — inclusive a inferência pelo motivo dos desvios legados — é
 * do backend (`domain/desvio_categoria.py`, aplicada na serialização do corte em
 * `cortes_helpers._corte_to_dict`). Aqui não se deduz categoria: replicar aquela
 * tabela em TS seria a mesma regra de domínio em duas linguagens, divergindo na
 * primeira vez que uma delas mudasse.
 *
 * Sempre devolve um badge; nunca lança.
 */
/**
 * A cor do segmento deste trecho na timeline (D-515).
 *
 * `color-mix` porque o token é uma variável CSS: aplicar alpha por string
 * (`oklch(... / 0.35)`) exigiria conhecer o formato do token, e ele muda com a
 * paleta que o operador escolher no seletor de tema.
 *
 * O alpha é alto o bastante para a cor ler sobre a forma de onda e baixo o
 * bastante para a onda continuar visível por baixo — o segmento marca uma
 * região, não a esconde.
 */
export function corDoSegmento(desvio: Desvio): string {
  return `color-mix(in oklab, ${resolverBadgeTrecho(desvio).token} 42%, transparent)`;
}

export function resolverBadgeTrecho(desvio: Desvio): BadgeTrecho {
  const categoria = desvio.categoria;
  if (categoria && categoria !== 'outro' && BADGE_POR_CATEGORIA[categoria]) {
    return BADGE_POR_CATEGORIA[categoria];
  }
  return BADGE_POR_ORIGEM[desvio.origem ?? 'manual'] ?? BADGE_POR_ORIGEM.manual;
}
