import { useLayoutEffect, useRef, useState } from 'react';
import { Check, ChevronDown, Circle, Loader2, RefreshCw, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip } from '@/components/ui/tooltip';
import { useBrutoProgress } from '@/hooks/useEditor';
import { FabricaShortsSection } from './FabricaShortsSection';
import { posicionarDropdown, type PosicaoDropdown } from './posicaoDropdownBruto';
import {
  OPCOES_REGERAR_VAZIAS,
  type RegerarBrutoOpcoes,
} from './regerarBrutoPlan';

// ─────────────────────────────────────────────────────────────
// BrutoStepsDropdown (F-038) — chevron ao lado do botão gerar/regerar bruto.
// Expande e mostra os passos do pipeline (silêncios → render → transcrição →
// cenas + metadados) com o status de cada um. Resolve o "não sei se ainda tem
// processo rodando": o botão libera quando o VÍDEO fica pronto, e este dropdown
// mostra que cenas/metadados (Claude) ainda estão rodando depois.
// ─────────────────────────────────────────────────────────────

/** Espelha o `w-64` do painel — a conta de posicao precisa do numero. */
const LARGURA_PAINEL = 256;

type StepStatus = 'pendente' | 'rodando' | 'concluido' | 'erro';

interface Passo {
  chave: string;
  label: string;
  status: StepStatus;
}

// Espelha PASSOS_BRUTO do backend — garante a lista visível mesmo antes da 1ª geração.
const PASSOS_DEFAULT: { chave: string; label: string }[] = [
  { chave: 'silencios', label: 'Detectar silêncios' },
  { chave: 'render', label: 'Renderizar vídeo bruto' },
  { chave: 'transcricao', label: 'Sincronizar transcrição' },
  { chave: 'cenas', label: 'Gerar cenas por IA' },
];

function StatusIcon({ status }: { status: StepStatus }) {
  if (status === 'rodando')
    return <Loader2 size={13} className="animate-spin text-[var(--wb-info)]" />;
  if (status === 'concluido') return <Check size={13} className="text-[var(--wb-ok)]" />;
  if (status === 'erro') return <X size={13} className="text-[var(--wb-err)]" />;
  return <Circle size={10} className="text-[var(--wb-text-dim)]" />;
}

const OPCOES_LABELS: { chave: keyof RegerarBrutoOpcoes; label: string }[] = [
  { chave: 'transcricao', label: 'Transcrição' },
  { chave: 'cenas', label: 'Cenas' },
  { chave: 'metadados', label: 'Metadados' },
  { chave: 'desvios', label: 'Desvios (trechos a remover)' },
];

export function BrutoStepsDropdown({
  corteId,
  ativo,
  metadadosStatus,
  variant = 'outline',
  brutoPronto = false,
  onRegerar,
  open: openProp,
  onOpenChange,
  hideTrigger = false,
}: {
  corteId: string;
  ativo: boolean;
  metadadosStatus: StepStatus;
  variant?: 'default' | 'outline';
  /** D-160 — regeração (bruto já existe): habilita os opt-ins "também refazer". */
  brutoPronto?: boolean;
  /** D-160 — regera o bruto com os opt-ins marcados. Ausente oculta a seção. */
  onRegerar?: (opts: RegerarBrutoOpcoes) => void;
  /** AUDITORIA-v2 §2 (CP2) — quando informado, o painel vira controlado (o
   *  ícone ⟳ da toolbar do Workbench abre/fecha por fora). Sem isso, mantém
   *  o estado interno de sempre (uso legado, com o próprio chevron). */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Oculta o botão-gatilho (chevron "grudado") quando outro elemento (o
   *  ícone ⟳ da toolbar) já controla `open` por fora. */
  hideTrigger?: boolean;
}) {
  const [openState, setOpenState] = useState(false);
  const open = openProp ?? openState;
  const setOpen = onOpenChange ?? setOpenState;
  const [opts, setOpts] = useState<RegerarBrutoOpcoes>(OPCOES_REGERAR_VAZIAS);
  const ancora = useRef<HTMLDivElement>(null);
  const [posicao, setPosicao] = useState<PosicaoDropdown | null>(null);

  // Mede no layout, antes da pintura: assim o painel nunca aparece no lugar
  // errado por um frame antes de saltar para o certo.
  useLayoutEffect(() => {
    if (!open) {
      setPosicao(null);
      return;
    }
    const alvo = ancora.current;
    if (!alvo) return;
    const rect = alvo.getBoundingClientRect();
    setPosicao(
      posicionarDropdown(
        { left: rect.left, right: rect.right, bottom: rect.bottom },
        { largura: window.innerWidth, altura: window.innerHeight },
        LARGURA_PAINEL,
      ),
    );
  }, [open]);
  const { data } = useBrutoProgress(corteId, ativo || open);

  const mostrarOptIns = brutoPronto && !!onRegerar;

  function regerarComOpts() {
    setOpen(false);
    onRegerar?.(opts);
  }

  const backend = (data?.passos ?? []) as Passo[];
  const statusDe = (chave: string): StepStatus =>
    (backend.find((p) => p.chave === chave)?.status as StepStatus) ?? 'pendente';

  const linhas: Passo[] = [
    ...PASSOS_DEFAULT.map((p) => ({ ...p, status: statusDe(p.chave) })),
    { chave: 'metadados', label: 'Gerar metadados por IA', status: metadadosStatus },
  ];

  // "Grudado" no botão principal (split-button): rounded-l-none + -ml-px funde a
  // borda. Sem spinner no gatilho — só o botão gerar/regerar mostra loading.
  // Quando `hideTrigger` (CP2 — ícone ⟳ da toolbar controla por fora), não
  // funde borda nenhuma: o wrapper só serve de âncora para o painel absoluto.
  return (
    <div ref={ancora} className={hideTrigger ? 'relative' : 'relative -ml-px'}>
      {!hideTrigger && (
        <Tooltip label="Passos do bruto" side="bottom">
          <Button
            type="button"
            variant={variant}
            size="icon-sm"
            aria-label="Ver passos do bruto"
            className="rounded-l-none"
            onClick={() => setOpen(!open)}
          >
            <ChevronDown />
          </Button>
        </Tooltip>
      )}

      {open && (
        <>
          {/* backdrop p/ fechar ao clicar fora */}
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} aria-hidden />
          {/* D-474: posicao calculada contra a VIEWPORT. Com `absolute right-0`
              o painel se estendia para fora da tela quando o gatilho ficava na
              esquerda — era o caso do icone de regerar, na barra do Bruto. */}
          <div
            className="fixed z-50 w-64 overflow-y-auto rounded-[var(--radius-sm)] border border-[var(--wb-border-soft)] bg-[var(--wb-bg-card)] p-2 shadow-lg"
            style={posicao ?? { visibility: 'hidden' }}
            role="menu"
          >
            {mostrarOptIns && (
              <div className="mb-1.5 border-b border-[var(--wb-border-soft)] pb-1.5">
                <p className="px-1 pb-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--wb-text-mute)]">
                  Também refazer
                </p>
                <p className="px-1 pb-1 text-[11px] leading-tight text-[var(--wb-text-dim)]">
                  Regerar sem marcar nada roda só o bruto.
                </p>
                <ul className="flex flex-col gap-0.5">
                  {OPCOES_LABELS.map(({ chave, label }) => (
                    <li key={chave}>
                      <label className="flex cursor-pointer items-center gap-2 rounded-[var(--radius-xs)] px-1.5 py-1 text-[12px] text-[var(--wb-text)] transition hover:bg-[var(--wb-bg-card-elev)]">
                        <input
                          type="checkbox"
                          checked={opts[chave]}
                          onChange={(e) =>
                            setOpts((prev) => ({ ...prev, [chave]: e.target.checked }))
                          }
                          className="accent-[var(--wb-info)]"
                        />
                        <span>{label}</span>
                      </label>
                    </li>
                  ))}
                </ul>
                <Button
                  type="button"
                  variant="default"
                  size="sm"
                  className="mt-1.5 w-full"
                  onClick={regerarComOpts}
                >
                  <RefreshCw size={13} />
                  Regerar bruto
                </Button>
              </div>
            )}
            <p className="px-1 pb-1.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--wb-text-mute)]">
              Passos do bruto
            </p>
            <ul className="flex flex-col gap-0.5">
              {linhas.map((p) => (
                <li
                  key={p.chave}
                  className="flex items-center gap-2 rounded-[var(--radius-xs)] px-1.5 py-1 text-[12px]"
                >
                  <StatusIcon status={p.status} />
                  <span
                    className={
                      p.status === 'pendente'
                        ? 'text-[var(--wb-text-dim)]'
                        : 'text-[var(--wb-text)]'
                    }
                  >
                    {p.label}
                  </span>
                </li>
              ))}
            </ul>

            {/* D-472: so aparece em corte Fire — a secao se esconde sozinha. */}
            <FabricaShortsSection corteId={corteId} ocupado={ativo} />
          </div>
        </>
      )}
    </div>
  );
}
