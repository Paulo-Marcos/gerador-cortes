const READING_PREFIX_RE = /^\s*Leitura\s*(?:\|\s*[^-]+-\s*|-\s*.+?\s*-\s*PT\.\d+\s*\|\s*)/i;
const LEADING_THUMB_EMOJIS_RE = /^(?:\s*(?:🔥|📖)\s*)+/;

export function readingTitlePrefix(author: string, part?: number) {
  const cleanAuthor = author.trim();
  if (!cleanAuthor) return '';
  const safePart = Number.isFinite(part) && part && part > 0 ? Math.floor(part) : 1;
  return `Leitura - ${cleanAuthor} - PT.${safePart} | `;
}

export function removeReadingTitlePrefix(title: string) {
  return title.replace(READING_PREFIX_RE, '').trim();
}

export function applyReadingTitlePrefix(title: string, author: string, part?: number) {
  const prefix = readingTitlePrefix(author, part);
  const cleanTitle = removeReadingTitlePrefix(title);
  return prefix ? `${prefix}${cleanTitle}` : cleanTitle;
}

export function removeCoverEmojis(text: string) {
  return text.replace(LEADING_THUMB_EMOJIS_RE, '').trim();
}

export function applyCoverEmojis(text: string, isFire: boolean, isReading: boolean) {
  const cleanText = removeCoverEmojis(text);
  const emojis = [isFire ? '🔥' : '', isReading ? '📖' : ''].filter(Boolean).join(' ');
  return emojis ? `${emojis} ${cleanText}`.trim() : cleanText;
}

export function normalizeReadingPart(value: string | number | undefined) {
  const parsed = typeof value === 'number' ? value : Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 1;
}

export interface ReadingPatch {
  autor_leitura: string;
  parte_leitura: number;
}

export function buildReadingPatch(author: string, part: string | number): ReadingPatch {
  return {
    autor_leitura: author.trim(),
    parte_leitura: normalizeReadingPart(part),
  };
}

export type ReadingClickIntent = 'toggle-on-and-open' | 'open-editor' | 'wait-for-second-click';

// Clique inteligente no toggle Leitura: 1o clique liga e abre o editor de
// autor/parte; com a leitura ja ligada, espera-se um 2o clique (janela curta)
// para abrir o editor — clique unico desliga.
export function getReadingClickIntent(
  isLeitura: boolean,
  hasPendingClick: boolean,
): ReadingClickIntent {
  if (!isLeitura) return 'toggle-on-and-open';
  if (hasPendingClick) return 'open-editor';
  return 'wait-for-second-click';
}
