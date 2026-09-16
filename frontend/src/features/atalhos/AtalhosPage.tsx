// Etapa 7 + D-394 (validação 1): página de Atalhos estilo VS Code,
// renderizada do shortcutsRegistry e agora EDITÁVEL — cada linha aceita
// reatribuição de tecla (overlay `wb-keybindings-v1` em localStorage),
// com validação de conflito via assertNoShortcutConflicts. A nova
// combinação vale para todas as telas ao recarregar a página.
import { useEffect, useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { isWorkbenchEnabled } from '@/components/workbench/workbenchFlag';
import type { ShortcutBinding } from '@/features/editor/shortcuts';
import {
  assertNoShortcutConflicts,
  clearKeybindingsOverlay,
  effectiveShortcutSpecs,
  loadKeybindingsOverlay,
  saveKeybindingOverride,
  shortcutCombo,
  type KeybindingsOverlay,
  type KeyOverride,
  type ShortcutId,
  type ShortcutScreen,
} from '@/features/editor/shortcutsRegistry';
import { useDefinirChrome } from '@/upgrade/UpgradeChrome';
import { isUpgradeShellEnabled } from '@/upgrade/upgradeFlag';

const TELAS: Array<{ id: ShortcutScreen | 'todas'; rotulo: string }> = [
  { id: 'todas', rotulo: 'Todas' },
  { id: 'global', rotulo: 'Global / Shell' },
  { id: 'bruto', rotulo: 'Editor Bruto' },
  { id: 'shorts', rotulo: 'Shorts' },
  { id: 'pos', rotulo: 'Pós-produção' },
  { id: 'pos-timeline', rotulo: 'Timeline da Pós' },
];

const TELA_LABEL: Record<ShortcutScreen, string> = {
  global: 'Global',
  bruto: 'Bruto',
  shorts: 'Shorts',
  pos: 'Pós',
  'pos-timeline': 'Timeline · Pós',
  'pos-layout': 'Layout YT',
  'pos-cenas': 'Cenas',
};

function Kbd({ combo }: { combo: string }) {
  return (
    <span className="inline-flex gap-1">
      {combo.split('+').map((parte, i) => (
        <kbd
          key={i}
          className="rounded-[5px] border border-[var(--wb-border)] bg-[var(--wb-bg-inset)] px-1.5 py-0.5 font-code text-[10px] font-bold text-[var(--wb-text)]"
        >
          {parte}
        </kbd>
      ))}
    </span>
  );
}

/** Converte o KeyboardEvent capturado num override do registro. */
function overrideDoEvento(event: KeyboardEvent): KeyOverride | null {
  if (['Control', 'Shift', 'Alt', 'Meta'].includes(event.key)) return null;
  const ctrl = event.ctrlKey || event.metaKey;
  let mod: ShortcutBinding['mod'];
  if (ctrl && event.altKey) mod = 'ctrl+alt';
  else if (ctrl) mod = 'ctrl';
  else if (event.altKey) mod = 'alt';
  else if (event.shiftKey && event.key.length > 1) mod = 'shift';
  return { key: event.key, mod };
}

const CASCA_NOVA = isUpgradeShellEnabled();

export function AtalhosPage() {
  const [busca, setBusca] = useState('');
  const [tela, setTela] = useState<ShortcutScreen | 'todas'>('todas');
  const [overlay, setOverlay] = useState<KeybindingsOverlay>(() => loadKeybindingsOverlay());
  const [capturando, setCapturando] = useState<ShortcutId | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [pendenteAplicar, setPendenteAplicar] = useState(false);
  const workbench = isWorkbenchEnabled();

  const specs = useMemo(() => effectiveShortcutSpecs(overlay), [overlay]);

  // Captura da próxima tecla enquanto uma linha está em modo de edição.
  useEffect(() => {
    if (!capturando) return;
    const onKeyDown = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();
      if (event.key === 'Escape') {
        setCapturando(null);
        return;
      }
      const override = overrideDoEvento(event);
      if (!override) return; // só modificador — segue capturando
      const candidato: KeybindingsOverlay = { ...overlay, [capturando]: override };
      try {
        assertNoShortcutConflicts(effectiveShortcutSpecs(candidato));
      } catch (conflito) {
        setErro(
          conflito instanceof Error
            ? conflito.message.split('\n')[1]?.trim() || conflito.message
            : 'Conflito de atalhos.',
        );
        setCapturando(null);
        return;
      }
      saveKeybindingOverride(capturando, override);
      setOverlay(candidato);
      setErro(null);
      setPendenteAplicar(true);
      setCapturando(null);
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [capturando, overlay]);

  const linhas = useMemo(() => {
    const query = busca.trim().toLowerCase();
    return specs.filter((spec) => {
      if (tela !== 'todas' && spec.screen !== tela) return false;
      if (!query) return true;
      return `${spec.description} ${spec.id} ${shortcutCombo(spec)}`.toLowerCase().includes(query);
    });
  }, [busca, tela, specs]);

  const restaurarLinha = (id: ShortcutId) => {
    saveKeybindingOverride(id, null);
    setOverlay(loadKeybindingsOverlay());
    setErro(null);
    setPendenteAplicar(true);
  };

  const restaurarTudo = () => {
    clearKeybindingsOverlay();
    setOverlay({});
    setErro(null);
    setPendenteAplicar(true);
  };

  const totalCustom = Object.keys(overlay).length;

  useDefinirChrome(
    { sub: `${specs.length} atalhos · ${totalCustom} personalizados` },
    [specs.length, totalCustom],
  );

  return (
    <div
      className={cn(
        'flex min-h-0 flex-col gap-3 overflow-hidden text-[var(--wb-text)]',
        CASCA_NOVA ? 'h-full' : 'bg-[var(--wb-bg)] p-4',
        CASCA_NOVA || workbench ? 'h-full' : 'min-h-screen',
      )}
    >
      <header className="flex flex-none flex-wrap items-center gap-2">
        {CASCA_NOVA ? null : (
          <>
            <span className="text-[16px]" aria-hidden>
              ⌨
            </span>
            <h1 className="text-[15px] font-extrabold">Atalhos</h1>
            <span className="text-xs text-[var(--wb-text-mute)]">
              clique em ✎ e pressione a nova combinação (Esc cancela)
            </span>
          </>
        )}
        <div className="flex-1" />
        <div className="flex gap-1.5">
          {TELAS.map(({ id, rotulo }) => (
            <button
              key={id}
              type="button"
              onClick={() => setTela(id)}
              className={cn(
                'rounded-md px-2.5 py-1 text-[10px] font-semibold',
                tela === id
                  ? 'bg-[var(--wb-accent)] font-bold text-[var(--wb-accent-fg)]'
                  : 'bg-[var(--wb-bg-inset)] text-[var(--wb-text-mute)] hover:text-[var(--wb-text)]',
              )}
            >
              {rotulo}
            </button>
          ))}
        </div>
        <label className="flex h-8 min-w-[190px] items-center gap-2 rounded-lg border border-[var(--wb-border)] bg-[var(--wb-bg-panel)] px-2.5 text-xs text-[var(--wb-text-mute)]">
          <Search size={13} aria-hidden />
          <input
            value={busca}
            onChange={(event) => setBusca(event.target.value)}
            placeholder="buscar comando ou tecla…"
            className="min-w-0 flex-1 bg-transparent text-[var(--wb-text)] outline-none placeholder:text-[var(--wb-text-dim)]"
          />
        </label>
      </header>

      {(erro || pendenteAplicar || totalCustom > 0) && (
        <div className="flex flex-none flex-wrap items-center gap-2 text-xs">
          {erro && (
            <span className="rounded-md bg-[var(--wb-err-soft)] px-2.5 py-1 font-semibold text-[var(--wb-err)]">
              Conflito: {erro}
            </span>
          )}
          {totalCustom > 0 && (
            <span className="rounded-md bg-[var(--wb-accent-soft)] px-2.5 py-1 font-semibold text-[var(--wb-accent)]">
              {totalCustom} atalho{totalCustom > 1 ? 's' : ''} customizado
              {totalCustom > 1 ? 's' : ''}
            </span>
          )}
          {pendenteAplicar && (
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="rounded-md bg-[var(--wb-warn-soft)] px-2.5 py-1 font-bold text-[var(--wb-warn)]"
            >
              ↻ Aplicar mudanças (recarrega a página)
            </button>
          )}
          {totalCustom > 0 && (
            <button
              type="button"
              onClick={restaurarTudo}
              className="rounded-md bg-[var(--wb-bg-inset)] px-2.5 py-1 font-semibold text-[var(--wb-text-mute)] hover:text-[var(--wb-text)]"
            >
              ↺ Restaurar todos os padrões
            </button>
          )}
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto rounded-[var(--radius)] border border-[var(--wb-border-soft)] bg-[var(--wb-bg-panel)]">
        <table className="w-full border-collapse text-left">
          <thead className="sticky top-0 bg-[var(--wb-bg-inset)]">
            <tr>
              {['Comando', 'Atalho', 'Tela', ''].map((coluna, i) => (
                <th
                  key={i}
                  className="border-b border-[var(--wb-border-soft)] px-3 py-2 font-code text-[9px] font-extrabold uppercase tracking-[0.14em] text-[var(--wb-text-dim)]"
                >
                  {coluna}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {linhas.map((spec) => {
              const custom = Boolean(overlay[spec.id]);
              const emCaptura = capturando === spec.id;
              return (
                <tr key={spec.id} className="border-b border-[var(--wb-border-soft)]">
                  <td className="px-3 py-2 text-[12px] font-medium">
                    {spec.description}
                    {custom && (
                      <span className="ml-2 rounded-full bg-[var(--wb-accent-soft)] px-1.5 py-0.5 font-code text-[8px] font-bold text-[var(--wb-accent)]">
                        custom
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {emCaptura ? (
                      <span className="rounded-md bg-[var(--wb-warn-soft)] px-2 py-1 font-code text-[10px] font-bold text-[var(--wb-warn)]">
                        pressione a combinação…
                      </span>
                    ) : (
                      <Kbd combo={shortcutCombo(spec)} />
                    )}
                  </td>
                  <td className="px-3 py-2 text-[11px] text-[var(--wb-text-mute)]">
                    {TELA_LABEL[spec.screen]}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button
                      type="button"
                      onClick={() => {
                        setErro(null);
                        setCapturando(emCaptura ? null : spec.id);
                      }}
                      aria-label={`Editar atalho de ${spec.description}`}
                      className="rounded-md px-1.5 py-0.5 text-[12px] text-[var(--wb-text-dim)] hover:bg-[var(--wb-bg-inset)] hover:text-[var(--wb-text)]"
                    >
                      ✎
                    </button>
                    {custom && (
                      <button
                        type="button"
                        onClick={() => restaurarLinha(spec.id)}
                        aria-label={`Restaurar padrão de ${spec.description}`}
                        title="Restaurar padrão"
                        className="ml-1 rounded-md px-1.5 py-0.5 text-[12px] text-[var(--wb-text-dim)] hover:bg-[var(--wb-bg-inset)] hover:text-[var(--wb-text)]"
                      >
                        ↺
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
            {linhas.length === 0 && (
              <tr>
                <td colSpan={4} className="px-3 py-8 text-center text-sm text-[var(--wb-text-dim)]">
                  Nenhum atalho encontrado para o filtro atual.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
