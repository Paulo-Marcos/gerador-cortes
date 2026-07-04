import { forwardRef, useCallback, useImperativeHandle, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ExternalLink,
  Film,
  Image as ImageIcon,
  Loader2,
  MoreHorizontal,
  Plus,
  ShieldCheck,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ClaudeAiButton } from '@/components/ui/claude-button';
import { IconButton } from '@/components/ui/icon-button';
import { Tooltip } from '@/components/ui/tooltip';
import { useToast } from '@/components/ui/toaster';
import { cn } from '@/lib/utils';
import {
  useAtualizarCorte,
  useGerarCenasClaude,
  usePreencherRetratosCenas,
  useValidarCenasRemotion,
} from '@/hooks/useEditor';
import type { CenaRemotion, CenasRemotionPayload } from '@/types/models';
import { CenaItem } from './CenaItem';
import { CenasManualModal } from './CenasManualModal';
import { RendererConfigControls } from './RendererConfigControls';
import { TIPOS_CENA } from './sceneTypes';
import { SceneTypeIcon, sceneTypeStyle } from './SceneTypeIcon';
import { validateSceneOverlaps } from './sceneValidation';

// ─────────────────────────────────────────────────────────────
// CenasPanel — replica `design_reference/src/v3_pos.jsx > TabCenas (449-647)`.
// Header reorganizado por frequencia de uso:
//   1. Linha de titulo: Film + serif 17/500 + Chip contagem + Chip "N sem
//      retrato" warn + caption "roteiro visual"
//   2. Acao primaria: "Gerar por IA" (ink) + "Retratos" (outline com N) +
//      moreH (recolhe Manual + Studio)
//   3. Padroes do projeto: caption + Card sempre visivel + botao "avancado"
//      que revela Render + Sombra
//   4. Stats grid 3 (Duracao / Densidade / Cobertura)
// Lista: CenaItem expansivel.
// Footer: "Tipos disponiveis ▾" + spacer + "Marcar validadas" (ok).
//
// Mantem as acoes visiveis de IA, retratos, edicao e validacao de cenas.
// ─────────────────────────────────────────────────────────────

interface Props {
  corteId: string;
  projetoId: string;
  cenas: CenaRemotion[];
  formato?: string;
  paleta?: Record<string, string>;
  cenaAtivaIdx: number;
  cenasValidadas?: boolean;
  onSeek: (seg: number) => void;
  onCenasChange: (cenas: CenaRemotion[]) => void;
}

export interface CenasPanelHandle {
  /** Salva se houver pendencias. Retorna true se disparou a mutation. */
  saveIfDirty: () => boolean;
}

export const CenasPanel = forwardRef<CenasPanelHandle, Props>(function CenasPanel(
  {
    corteId,
    projetoId,
    cenas,
    formato,
    paleta,
    cenaAtivaIdx,
    cenasValidadas = false,
    onSeek,
    onCenasChange,
  }: Props,
  ref,
) {
  const gerarClaude = useGerarCenasClaude(corteId, projetoId);
  const atualizar = useAtualizarCorte(corteId);
  const preencherRetratos = usePreencherRetratosCenas(corteId);
  const validarCenas = useValidarCenasRemotion(corteId, projetoId);
  const { notify } = useToast();
  const [manualOpen, setManualOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [padroesOpen, setPadroesOpen] = useState(false);
  const [showTypes, setShowTypes] = useState(false);
  const [dirty, setDirty] = useState(false);

  const cenasOrdenadas = useMemo(() => [...cenas].sort((a, b) => a.inicio - b.inicio), [cenas]);
  const duracaoCenas = useMemo(
    () => cenasOrdenadas.reduce((total, cena) => total + Math.max(0, cena.fim - cena.inicio), 0),
    [cenasOrdenadas],
  );
  const fimTimeline =
    cenasOrdenadas.length > 0 ? Math.max(...cenasOrdenadas.map((cena) => cena.fim)) : 0;
  const cobertura = fimTimeline > 0 ? (duracaoCenas / fimTimeline) * 100 : 0;
  const validation = useMemo(() => validateSceneOverlaps(cenasOrdenadas), [cenasOrdenadas]);
  const totalFichas = useMemo(
    () => cenasOrdenadas.filter((cena) => cena.tipo === 'ficha_biografica').length,
    [cenasOrdenadas],
  );
  const fichasSemRetrato = useMemo(
    () =>
      cenasOrdenadas.filter((cena) => cena.tipo === 'ficha_biografica' && !cena.retrato_url).length,
    [cenasOrdenadas],
  );
  const retratosDisabled = preencherRetratos.isPending || totalFichas === 0 || dirty;
  const retratosTooltip = dirty
    ? 'Salve as cenas antes de buscar retratos'
    : totalFichas === 0
      ? 'Nenhuma ficha biografica para buscar'
      : 'Buscar retratos das fichas biograficas';

  const handleChange = (idx: number, next: CenaRemotion) => {
    const novas = [...cenas];
    const sortedToOriginal = cenas.indexOf(cenasOrdenadas[idx]);
    if (sortedToOriginal < 0) return;
    novas[sortedToOriginal] = next;
    onCenasChange(novas);
    setDirty(true);
  };

  const handleRemove = (idx: number) => {
    const target = cenasOrdenadas[idx];
    onCenasChange(cenas.filter((cena) => cena !== target));
    setDirty(true);
  };

  const handleAdd = () => {
    const ultima = cenasOrdenadas[cenasOrdenadas.length - 1];
    const inicio = ultima ? ultima.fim : 0;
    const nova: CenaRemotion = {
      tipo: 'barra_inferior',
      inicio,
      fim: inicio + 5,
      texto: 'Nova cena',
      modelo_cena: 'card',
      layout_card: 'auto',
      sombra_nivel: 'auto',
    };
    onCenasChange([...cenas, nova]);
    setDirty(true);
  };

  const handleSalvar = useCallback(() => {
    const payload: CenasRemotionPayload = {
      ...(formato ? { formato } : {}),
      ...(paleta ? { paleta } : {}),
      cenas: cenasOrdenadas,
    };
    atualizar.mutate({ cenas_remotion: payload }, { onSuccess: () => setDirty(false) });
  }, [atualizar, cenasOrdenadas, formato, paleta]);

  // Ctrl+S na tela Pos delega para handleSalvar via ref. Sem dirty,
  // retorna false (parent fica em silencio).
  useImperativeHandle(
    ref,
    () => ({
      saveIfDirty: () => {
        if (!dirty || atualizar.isPending) return false;
        handleSalvar();
        return true;
      },
    }),
    [dirty, atualizar.isPending, handleSalvar],
  );

  const handlePreencherRetratos = () => {
    preencherRetratos.mutate(undefined, {
      onSuccess: (data) => {
        const stats = data.retratos;
        const tone =
          stats.atualizados > 0 ? 'success' : stats.total_fichas > 0 ? 'info' : 'warning';
        notify(`${stats.atualizados} retrato(s) atualizados de ${stats.total_fichas} ficha(s).`, {
          tone,
        });
      },
      onError: (error) => {
        notify(error instanceof Error ? error.message : 'Erro ao buscar retratos.', {
          tone: 'error',
        });
      },
    });
  };

  const validarDisabled = validarCenas.isPending || dirty || cenasOrdenadas.length === 0;
  const validarTooltip = dirty
    ? 'Salve as cenas antes de validar'
    : cenasOrdenadas.length === 0
      ? 'Nenhuma cena para validar'
      : cenasValidadas
        ? 'Desfazer validacao'
        : 'Marcar cenas como validadas';

  const handleValidarCenas = () => {
    validarCenas.mutate(!cenasValidadas, {
      onSuccess: (data) => {
        const validou = Boolean(data.cenas_validadas);
        notify(validou ? 'Cenas marcadas como validadas.' : 'Validacao desfeita.', {
          tone: validou ? 'success' : 'info',
        });
      },
      onError: (error) => {
        notify(error instanceof Error ? error.message : 'Erro ao atualizar validacao das cenas.', {
          tone: 'error',
        });
      },
    });
  };

  return (
    <section className="flex h-full min-w-0 flex-col overflow-hidden rounded-[var(--radius)] border border-[var(--wb-border-soft)] bg-[var(--wb-bg-card)]">
      {/* Header — v3_pos.jsx:454-585 */}
      <header className="border-b border-[var(--wb-border-soft)] bg-[var(--wb-bg)] p-3">
        {/* L1: titulo + chips + caption */}
        <div className="mb-2.5 flex items-center gap-2">
          <Film size={14} className="text-[var(--wb-text-mute)]" aria-hidden />
          <strong className="font-editorial text-[17px] font-medium text-[var(--wb-ink)]">
            Cenas Remotion
          </strong>
          <span className="inline-flex items-center rounded-full bg-[var(--wb-accent-soft)] px-2 py-0.5 font-code text-[10px] font-bold uppercase tracking-[0.04em] text-[var(--wb-accent)]">
            {cenasOrdenadas.length}
          </span>
          {fichasSemRetrato > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-[var(--wb-warn-soft)] px-2 py-0.5 font-code text-[10px] font-bold uppercase tracking-[0.04em] text-[var(--wb-warn)]">
              <AlertTriangle size={10} strokeWidth={2.2} />
              {fichasSemRetrato} sem retrato
            </span>
          )}
          {cenasValidadas && !dirty && (
            <span
              className="inline-flex items-center gap-1 rounded-full bg-[var(--wb-ok-soft)] px-2 py-0.5 font-code text-[10px] font-bold uppercase tracking-[0.04em] text-[var(--wb-ok)]"
              data-testid="cenas-validadas-badge"
            >
              <CheckCircle2 size={10} /> validadas
            </span>
          )}
          <div className="flex-1" />
          <span className="font-code text-[9.5px] font-bold uppercase tracking-[0.08em] text-[var(--wb-text-dim)]">
            roteiro visual
          </span>
        </div>

        {/* L2: acao primaria (Gerar por IA + Retratos + moreH) */}
        <div className="mb-2 flex items-stretch gap-1.5">
          <Tooltip label="Gerar cenas automaticamente via Claude" side="bottom">
            <ClaudeAiButton
              className="flex-1 justify-start pl-3.5"
              pending={gerarClaude.isPending}
              onClick={() => gerarClaude.mutate()}
            />
          </Tooltip>
          <Tooltip label={retratosTooltip} side="bottom">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handlePreencherRetratos}
              disabled={retratosDisabled}
            >
              {preencherRetratos.isPending ? <Loader2 className="animate-spin" /> : <ImageIcon />}
              Retratos{fichasSemRetrato > 0 ? ` (${fichasSemRetrato})` : ''}
            </Button>
          </Tooltip>
          <Tooltip label="Outras acoes (manual e studio)" side="bottom">
            <IconButton
              type="button"
              variant={moreOpen ? 'outline' : 'ghost'}
              size="sm"
              onClick={() => setMoreOpen((v) => !v)}
              aria-pressed={moreOpen}
              aria-label="Outras acoes"
            >
              <MoreHorizontal />
            </IconButton>
          </Tooltip>
        </div>

        {/* L2b: expander 'mais' - Manual + Studio (raras) */}
        {moreOpen && (
          <div className="mb-2 flex gap-1.5 rounded-[var(--radius-sm)] border border-dashed border-[var(--wb-border-soft)] bg-[var(--wb-bg-inset)] p-1.5">
            <Tooltip label="Adicionar cena manualmente" side="bottom">
              <Button type="button" variant="outline" size="sm" onClick={handleAdd}>
                <Plus />
                Manual
              </Button>
            </Tooltip>
            <Tooltip label="Abrir Remotion Studio" side="bottom">
              <Button type="button" variant="outline" size="sm" onClick={() => setManualOpen(true)}>
                <ExternalLink />
                Studio
              </Button>
            </Tooltip>
          </div>
        )}

        {/* L3: Padroes do projeto */}
        <div className="mb-2 flex items-center gap-1.5">
          <span className="mr-0.5 font-code text-[9.5px] font-bold uppercase tracking-[0.08em] text-[var(--wb-text-dim)]">
            Padroes
          </span>
          <RendererConfigControls.Card projetoId={projetoId} />
          <button
            type="button"
            onClick={() => setPadroesOpen((v) => !v)}
            title="Avancado · Render V2 · Sombra"
            className={cn(
              'ml-auto inline-flex h-[26px] items-center gap-1 rounded-[var(--radius-xs)] border border-[var(--wb-border-soft)] px-2 font-code text-[9.5px] font-bold uppercase tracking-[0.06em] text-[var(--wb-text-mute)] transition-colors',
              padroesOpen ? 'bg-[var(--wb-bg-inset)]' : 'bg-transparent',
            )}
            aria-expanded={padroesOpen}
          >
            avancado
            <ChevronDown
              size={11}
              className="transition-transform"
              style={{ transform: padroesOpen ? 'rotate(180deg)' : 'none' }}
            />
          </button>
        </div>

        {/* L3b: expander padroes avancado — Render + Sombra */}
        {padroesOpen && (
          <div className="mb-2 flex flex-wrap gap-1.5 rounded-[var(--radius-sm)] border border-dashed border-[var(--wb-border-soft)] bg-[var(--wb-bg-inset)] p-1.5">
            <RendererConfigControls.Avancado projetoId={projetoId} />
          </div>
        )}

        {/* L4: Stats grid 3 */}
        <div className="grid grid-cols-3 gap-1.5">
          <SceneStat label="Duracao" value={`${duracaoCenas.toFixed(1)}s`} />
          <SceneStat label="Densidade" value={`${cenasOrdenadas.length} cenas`} />
          <SceneStat label="Cobertura" value={`${cobertura.toFixed(1)}%`} />
        </div>

        {/* Botao Salvar so aparece quando dirty (mantem comportamento anterior) */}
        {dirty && (
          <div className="mt-2.5 flex justify-end">
            <Button
              type="button"
              variant="default"
              size="sm"
              onClick={handleSalvar}
              disabled={atualizar.isPending}
            >
              {atualizar.isPending ? <Loader2 className="animate-spin" /> : <CheckCircle2 />}
              Salvar cenas
            </Button>
          </div>
        )}
      </header>

      {/* Lista de cenas */}
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {validation.overlappingIndices.size > 0 && (
          <div className="mx-1 mb-2.5 rounded-[var(--radius-sm)] border border-[var(--wb-err)]/30 bg-[var(--wb-err-soft)] p-2.5 text-xs text-[var(--wb-err)]">
            <div className="flex items-start gap-2">
              <AlertTriangle size={14} className="mt-0.5" aria-hidden />
              <div className="flex flex-col gap-0.5">
                <span className="font-semibold">Cenas sobrepostas detectadas</span>
                <span>
                  {validation.maxSimultaneous > 2
                    ? `Ha ate ${validation.maxSimultaneous} cenas sobrepostas. A tela pode ficar poluida!`
                    : 'Algumas cenas aparecem no mesmo intervalo. Ajuste os limites.'}
                </span>
              </div>
            </div>
          </div>
        )}

        {cenasOrdenadas.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-4 py-12 text-center">
            <Film size={30} className="text-[var(--wb-text-dim)]" aria-hidden />
            <p className="text-sm font-medium text-[var(--wb-text)]">Nenhuma cena gerada</p>
            <p className="max-w-xs text-[11px] text-[var(--wb-text-mute)]">
              Use Gerar por IA para criar automaticamente; ou Manual para uma cena vazia.
            </p>
          </div>
        ) : (
          <ul role="list" className="flex flex-col gap-1.5">
            {cenasOrdenadas.map((cena, idx) => (
              <li key={`${cena.tipo}-${idx}-${cena.inicio}`}>
                <CenaItem
                  cena={cena}
                  ativa={idx === cenaAtivaIdx}
                  sobreposta={validation.overlappingIndices.has(idx)}
                  onChange={(next) => handleChange(idx, next)}
                  onRemove={() => handleRemove(idx)}
                  onSeek={onSeek}
                />
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Footer — "Tipos disponiveis ▾" + spacer + "Marcar validadas" (ok) */}
      <footer className="flex items-center gap-2 border-t border-[var(--wb-border-soft)] bg-[var(--wb-bg-inset)] p-2.5">
        <button
          type="button"
          onClick={() => setShowTypes((v) => !v)}
          className="inline-flex items-center gap-1.5 rounded text-[11px] text-[var(--wb-text-mute)] transition-colors hover:text-[var(--wb-text)]"
          aria-expanded={showTypes}
          title={`${Object.keys(TIPOS_CENA).length} tipos de cena disponiveis`}
        >
          <span>Tipos disponiveis</span>
          <span className="font-code text-[10px] text-[var(--wb-text-dim)]">
            {Object.keys(TIPOS_CENA).length}
          </span>
          <ChevronDown
            size={11}
            className="transition-transform"
            style={{ transform: showTypes ? 'rotate(180deg)' : 'none' }}
          />
        </button>
        <div className="flex-1" />
        <Tooltip label={validarTooltip} side="top">
          <Button
            type="button"
            variant="default"
            size="sm"
            onClick={handleValidarCenas}
            disabled={validarDisabled}
            data-testid="botao-validar-cenas"
            aria-pressed={cenasValidadas}
            className={cenasValidadas ? 'bg-[var(--wb-ok)] hover:opacity-90' : ''}
          >
            {validarCenas.isPending ? (
              <Loader2 className="animate-spin" />
            ) : cenasValidadas ? (
              <CheckCircle2 />
            ) : (
              <ShieldCheck />
            )}
            {cenasValidadas ? 'Validadas' : 'Marcar validadas'}
          </Button>
        </Tooltip>
      </footer>

      {/* Lista expansivel de tipos (clicar mostra/oculta) */}
      {showTypes && (
        <div className="border-t border-[var(--wb-border-soft)] bg-[var(--wb-bg-inset)] px-2.5 pb-2.5">
          <div className="flex max-h-24 flex-wrap gap-1 overflow-y-auto">
            {Object.entries(TIPOS_CENA).map(([tipo, meta]) => {
              const style = sceneTypeStyle(tipo);
              return (
                <span
                  key={tipo}
                  className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px]"
                  style={{ background: style.soft, color: style.color, borderColor: style.border }}
                >
                  <SceneTypeIcon tipo={tipo} size={10} />
                  {meta.label}
                </span>
              );
            })}
          </div>
        </div>
      )}

      <CenasManualModal open={manualOpen} onClose={() => setManualOpen(false)} corteId={corteId} />
    </section>
  );
});

// ── SceneStat · v3_pos.jsx:695-706 ───────────────────────────
function SceneStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[var(--radius-xs)] border border-[var(--wb-border-soft)] bg-[var(--wb-bg-card)] px-2 py-1.5">
      <div className="font-code text-[9px] font-bold uppercase tracking-[0.08em] text-[var(--wb-text-dim)]">
        {label}
      </div>
      <div
        className="mt-0.5 font-code text-[11.5px] text-[var(--wb-text)]"
        style={{ fontVariantNumeric: 'tabular-nums' }}
      >
        {value}
      </div>
    </div>
  );
}
