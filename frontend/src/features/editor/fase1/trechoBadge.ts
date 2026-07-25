import type { Desvio, DesvioCategoria } from '@/types/models';

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
}

// Paleta por FAMÍLIA, não por categoria: cor carrega urgência (o que revisar),
// o rótulo carrega a distinção. Oito cores diferentes numa lista de 20 trechos
// viram ruído.
const AVISO = { bg: 'var(--wb-warn-soft)', fg: 'var(--wb-warn-ink)' };
const REDUNDANCIA = { bg: 'var(--wb-violet-soft)', fg: 'var(--wb-violet)' };
const FORA_DO_ASSUNTO = { bg: 'var(--wb-info-soft)', fg: 'var(--wb-info)' };
const PROBLEMA = { bg: 'var(--wb-err-soft)', fg: 'var(--wb-err-ink)' };
const NEUTRO = { bg: 'var(--wb-bg-inset)', fg: 'var(--wb-text-mute)' };
const IA = { bg: 'var(--wb-accent-soft)', fg: 'var(--wb-accent)' };

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
  silencio: { label: 'silencio', titulo: 'Silêncio detectado (técnico)', ...FORA_DO_ASSUNTO },
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

const BADGE_POR_ORIGEM: Record<string, BadgeTrecho> = {
  claude: { label: 'IA', titulo: 'Trecho proposto por IA (Claude)', ...IA },
  gemini: { label: 'IA Gemini', titulo: 'Trecho proposto por IA (Gemini)', ...REDUNDANCIA },
  n8n: { label: 'IA n8n', titulo: 'Trecho proposto por IA (n8n)', ...REDUNDANCIA },
  manual: { label: 'manual', titulo: 'Trecho marcado pelo editor', ...NEUTRO },
  tecnico: BADGE_POR_CATEGORIA.silencio,
};

// Inferência por motivo para desvios LEGADOS (persistidos antes do D-422, sem
// `categoria`). Espelha `_RAIZES_MOTIVO` do backend — a duplicação existe para
// que os cortes já analisados ganhem o badge certo sem migrar o banco. Fonte
// canônica é o backend; ao mexer aqui, mexa lá.
const RAIZES_MOTIVO: readonly (readonly [string, DesvioCategoria])[] = [
  ['silenc', 'silencio'],
  ['impreci', 'imprecisao'],
  ['incorret', 'imprecisao'],
  ['possivelmente errad', 'imprecisao'],
  ['repet', 'repeticao'],
  ['redundan', 'repeticao'],
  ['reitera', 'repeticao'],
  ['hesita', 'disfluencia'],
  ['muleta', 'disfluencia'],
  ['gagueira', 'disfluencia'],
  ['falso comeco', 'disfluencia'],
  ['autocorre', 'disfluencia'],
  ['chat', 'chat'],
  ['audiencia', 'chat'],
  ['digress', 'tangente'],
  ['tangente', 'tangente'],
  ['off-topic', 'tangente'],
  ['desvio', 'tangente'],
  ['enrola', 'enrolacao'],
  ['desabafo', 'tom'],
  ['treta', 'tom'],
];

function semAcento(texto: string): string {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Mn}/gu, '');
}

/** Categoria deduzida do motivo de um desvio legado, ou `null` se nada casar. */
export function inferirCategoriaDoMotivo(motivo: string | undefined): DesvioCategoria | null {
  const texto = semAcento(motivo ?? '');
  if (!texto) return null;
  for (const [raiz, categoria] of RAIZES_MOTIVO) {
    if (texto.includes(raiz)) return categoria;
  }
  return null;
}

/**
 * Badge do trecho: categoria persistida → inferência pelo motivo (legado) →
 * origem. Sempre devolve um badge; nunca lança.
 */
export function resolverBadgeTrecho(desvio: Desvio): BadgeTrecho {
  const categoria = desvio.categoria;
  if (categoria && categoria !== 'outro' && BADGE_POR_CATEGORIA[categoria]) {
    return BADGE_POR_CATEGORIA[categoria];
  }

  const inferida = inferirCategoriaDoMotivo(desvio.motivo);
  if (inferida) return BADGE_POR_CATEGORIA[inferida];

  return BADGE_POR_ORIGEM[desvio.origem ?? 'manual'] ?? BADGE_POR_ORIGEM.manual;
}
