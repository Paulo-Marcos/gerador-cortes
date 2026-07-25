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
export function resolverBadgeTrecho(desvio: Desvio): BadgeTrecho {
  const categoria = desvio.categoria;
  if (categoria && categoria !== 'outro' && BADGE_POR_CATEGORIA[categoria]) {
    return BADGE_POR_CATEGORIA[categoria];
  }
  return BADGE_POR_ORIGEM[desvio.origem ?? 'manual'] ?? BADGE_POR_ORIGEM.manual;
}
