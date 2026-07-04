import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Moon, Sun } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Tooltip } from '@/components/ui/tooltip';
import { useTheme } from '@/hooks/useTheme';
import { PALETTES, usePalette } from '@/hooks/usePalette';

// ─────────────────────────────────────────────────────────────
// ThemePicker — toggle light/dark + seletor de paleta de acento.
// F-024 decisao Paulo: pop-up no ThemePicker.
//   - Click no Sun/Moon: alterna light/dark (igual antes).
//   - Click na chevron a direita: abre dropdown com as 5 paletas
//     (terracota default, indigo, forest, plum, ink).
// Persistencia via localStorage (hook usePalette).
// Dropdown renderizado via createPortal para escapar do overflow:hidden
// da Sidebar (mesma tecnica do menu Avancado da TimelinePanel).
// ─────────────────────────────────────────────────────────────

export function ThemePicker() {
  const { theme, toggleTheme } = useTheme();
  const { palette, setPalette } = usePalette();
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const chevronRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const themeLabel = theme === 'light' ? 'Ativar modo escuro' : 'Ativar modo claro';
  const ThemeIcon = theme === 'light' ? Moon : Sun;

  useEffect(() => {
    if (!open) {
      setPos(null);
      return;
    }
    const compute = () => {
      const btn = chevronRef.current;
      if (!btn) return;
      const rect = btn.getBoundingClientRect();
      // Dropdown abre acima do botao (na sidebar o picker fica no
      // rodape; menu cresce para cima).
      setPos({ top: rect.top - 8, left: rect.left });
    };
    compute();
    window.addEventListener('resize', compute);
    window.addEventListener('scroll', compute, true);
    return () => {
      window.removeEventListener('resize', compute);
      window.removeEventListener('scroll', compute, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      const t = e.target as Node;
      if (chevronRef.current?.contains(t)) return;
      if (menuRef.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  return (
    <div className="flex items-center gap-0.5 rounded-[var(--radius-sm)]">
      <Tooltip label={themeLabel} side="top">
        <button
          type="button"
          aria-label={themeLabel}
          title={themeLabel}
          onClick={toggleTheme}
          className={cn(
            'flex h-8 w-8 items-center justify-center rounded-[var(--radius-sm)] text-[var(--wb-text-mute)] transition-colors',
            'hover:bg-[var(--wb-bg-inset)] hover:text-[var(--wb-text)]',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--wb-focus)]',
            theme === 'dark' && 'bg-[var(--wb-bg-inset)] text-[var(--wb-accent)]',
          )}
        >
          <ThemeIcon size={16} aria-hidden />
        </button>
      </Tooltip>
      <Tooltip label="Trocar paleta" side="top">
        <button
          ref={chevronRef}
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-label="Trocar paleta de cores"
          className={cn(
            'flex h-8 w-5 items-center justify-center rounded-[var(--radius-sm)] text-[var(--wb-text-dim)] transition-colors',
            'hover:bg-[var(--wb-bg-inset)] hover:text-[var(--wb-text)]',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--wb-focus)]',
            open && 'bg-[var(--wb-bg-inset)] text-[var(--wb-text)]',
          )}
        >
          <ChevronDown size={11} aria-hidden />
        </button>
      </Tooltip>

      {open &&
        pos &&
        createPortal(
          <div
            ref={menuRef}
            style={{
              position: 'fixed',
              top: pos.top,
              left: pos.left,
              zIndex: 100,
              transform: 'translateY(-100%)',
            }}
            className="w-[220px] rounded-[var(--radius-sm)] border border-[var(--wb-border)] bg-[var(--wb-bg-card)] p-2 shadow-[var(--wb-shadow)]"
          >
            <div className="mb-1 px-2 pt-0.5 font-code text-[9.5px] font-bold uppercase tracking-[0.14em] text-[var(--wb-text-dim)]">
              Paleta
            </div>
            {PALETTES.map((opt) => {
              const isActive = opt.id === palette;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => {
                    setPalette(opt.id);
                    setOpen(false);
                  }}
                  className={cn(
                    'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors',
                    isActive ? 'bg-[var(--wb-accent-soft)]' : 'hover:bg-[var(--wb-bg-inset)]',
                  )}
                  aria-pressed={isActive}
                >
                  <span
                    aria-hidden
                    className="h-4 w-4 flex-shrink-0 rounded-full"
                    style={{
                      background: opt.swatch,
                      boxShadow: isActive
                        ? '0 0 0 2px var(--wb-bg-card), 0 0 0 3px var(--wb-accent)'
                        : undefined,
                    }}
                  />
                  <div className="min-w-0 flex-1">
                    <div
                      className={cn(
                        'text-[12px] font-bold',
                        isActive ? 'text-[var(--wb-accent)]' : 'text-[var(--wb-text)]',
                      )}
                    >
                      {opt.nome}
                    </div>
                    <div className="truncate text-[10px] text-[var(--wb-text-mute)]">
                      {opt.descricao}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>,
          document.body,
        )}
    </div>
  );
}
