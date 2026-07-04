import { useCallback, useEffect, useState } from 'react';

// ─────────────────────────────────────────────────────────────
// usePalette — escolha de paleta de acento (F-024, decisao Paulo).
// 5 paletas (terracota default + 4 alternativas), salvas em
// localStorage. Aplica classe `wb-palette-<id>` no <html> que
// sobrescreve `--wb-accent` + tom de fundo via overrides em
// `frontend/src/index.css`.
// ─────────────────────────────────────────────────────────────

export type PaletteId = 'terracota' | 'indigo' | 'forest' | 'plum' | 'ink';

export interface PaletteOption {
  id: PaletteId;
  nome: string;
  descricao: string;
  /** Cor de acento usada como swatch (preview no seletor). */
  swatch: string;
}

export const PALETTES: readonly PaletteOption[] = [
  {
    id: 'terracota',
    nome: 'Terracota',
    descricao: 'Atual · quente, editorial',
    swatch: 'oklch(0.56 0.17 28)',
  },
  {
    id: 'indigo',
    nome: 'Indigo aço',
    descricao: 'Frio · técnico, profissional',
    swatch: 'oklch(0.5 0.16 255)',
  },
  {
    id: 'forest',
    nome: 'Floresta',
    descricao: 'Natural · calmo, denso',
    swatch: 'oklch(0.5 0.13 155)',
  },
  {
    id: 'plum',
    nome: 'Ameixa',
    descricao: 'Sofisticado · editorial dramático',
    swatch: 'oklch(0.46 0.16 340)',
  },
  {
    id: 'ink',
    nome: 'Tinta',
    descricao: 'Neutro absoluto · acento single',
    swatch: 'oklch(0.32 0.02 70)',
  },
];

const DEFAULT_PALETTE: PaletteId = 'terracota';
const STORAGE_KEY = 'wb-palette';
const PALETTE_CLASS_PREFIX = 'wb-palette-';
const PALETTE_IDS: PaletteId[] = ['terracota', 'indigo', 'forest', 'plum', 'ink'];

/** Type guard para PaletteId. Exportada para testes unitarios. */
export function isValidPaletteId(value: unknown): value is PaletteId {
  return typeof value === 'string' && (PALETTE_IDS as string[]).includes(value);
}

function readStoredPalette(): PaletteId {
  if (typeof window === 'undefined') return DEFAULT_PALETTE;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (isValidPaletteId(raw)) return raw;
  } catch {
    // localStorage indisponivel (private mode etc) — usa default
  }
  return DEFAULT_PALETTE;
}

function applyPaletteClass(palette: PaletteId) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  for (const id of PALETTE_IDS) {
    root.classList.toggle(`${PALETTE_CLASS_PREFIX}${id}`, id === palette && id !== DEFAULT_PALETTE);
  }
  // Default (terracota) nao precisa de classe — usa os tokens base.
}

export function usePalette(): {
  palette: PaletteId;
  setPalette: (next: PaletteId) => void;
} {
  const [palette, setPaletteState] = useState<PaletteId>(() => readStoredPalette());

  // Aplica no mount + qualquer mudanca de estado.
  useEffect(() => {
    applyPaletteClass(palette);
  }, [palette]);

  const setPalette = useCallback((next: PaletteId) => {
    if (!isValidPaletteId(next)) return;
    setPaletteState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // ignora — proximo reload vai voltar pro default
    }
  }, []);

  return { palette, setPalette };
}

// Helper para aplicar a paleta o mais cedo possivel no boot (antes
// do React hidratar), evitando flash de cor no carregamento.
// Chamado uma vez em `main.tsx`.
export function bootstrapPalette(): void {
  applyPaletteClass(readStoredPalette());
}
