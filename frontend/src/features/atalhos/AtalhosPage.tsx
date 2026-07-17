// Etapa 7 do Workbench (DE-PARA §11): página de Atalhos estilo VS Code,
// renderizada EXCLUSIVAMENTE do shortcutsRegistry (I-029) — nunca hardcodar
// a lista. Os atalhos ad-hoc do Bruto (EditorPage) seguem visíveis pelo
// ShortcutsHelpModal ("?" no editor) até serem formalizados no registro.
import { useMemo, useState } from 'react';
import { Keyboard, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { isWorkbenchEnabled } from '@/components/workbench/workbenchFlag';
import {
  SHORTCUTS_REGISTRY,
  shortcutCombo,
  type ShortcutScreen,
} from '@/features/editor/shortcutsRegistry';

const TELAS: Array<{ id: ShortcutScreen | 'todas'; rotulo: string }> = [
  { id: 'todas', rotulo: 'Todas' },
  { id: 'global', rotulo: 'Global / Shell' },
  { id: 'pos', rotulo: 'Pós-produção' },
  { id: 'pos-timeline', rotulo: 'Timeline da Pós' },
];

const TELA_LABEL: Record<ShortcutScreen, string> = {
  global: 'Global',
  bruto: 'Bruto',
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

export function AtalhosPage() {
  const [busca, setBusca] = useState('');
  const [tela, setTela] = useState<ShortcutScreen | 'todas'>('todas');
  const workbench = isWorkbenchEnabled();

  const linhas = useMemo(() => {
    const query = busca.trim().toLowerCase();
    return SHORTCUTS_REGISTRY.filter((spec) => {
      if (tela !== 'todas' && spec.screen !== tela) return false;
      if (!query) return true;
      return `${spec.description} ${spec.id} ${shortcutCombo(spec)}`.toLowerCase().includes(query);
    });
  }, [busca, tela]);

  return (
    <div
      className={cn(
        'flex min-h-0 flex-col gap-3 overflow-hidden bg-[var(--wb-bg)] p-4 text-[var(--wb-text)]',
        workbench ? 'h-full' : 'min-h-screen',
      )}
    >
      <header className="flex flex-none flex-wrap items-center gap-2">
        <Keyboard size={18} className="text-[var(--wb-accent)]" aria-hidden />
        <h1 className="text-[15px] font-extrabold">Atalhos</h1>
        <span className="text-xs text-[var(--wb-text-mute)]">
          fonte única: shortcutsRegistry — os atalhos do Bruto aparecem no “?” do editor
        </span>
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

      <div className="min-h-0 flex-1 overflow-y-auto rounded-[var(--radius)] border border-[var(--wb-border-soft)] bg-[var(--wb-bg-panel)]">
        <table className="w-full border-collapse text-left">
          <thead className="sticky top-0 bg-[var(--wb-bg-inset)]">
            <tr>
              {['Comando', 'Atalho', 'Tela'].map((coluna) => (
                <th
                  key={coluna}
                  className="border-b border-[var(--wb-border-soft)] px-3 py-2 font-code text-[9px] font-extrabold uppercase tracking-[0.14em] text-[var(--wb-text-dim)]"
                >
                  {coluna}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {linhas.map((spec) => (
              <tr key={spec.id} className="border-b border-[var(--wb-border-soft)]">
                <td className="px-3 py-2 text-[12px] font-medium">{spec.description}</td>
                <td className="px-3 py-2">
                  <Kbd combo={shortcutCombo(spec)} />
                </td>
                <td className="px-3 py-2 text-[11px] text-[var(--wb-text-mute)]">
                  {TELA_LABEL[spec.screen]}
                </td>
              </tr>
            ))}
            {linhas.length === 0 && (
              <tr>
                <td colSpan={3} className="px-3 py-8 text-center text-sm text-[var(--wb-text-dim)]">
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
