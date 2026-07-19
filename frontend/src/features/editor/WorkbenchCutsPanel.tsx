import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronDown, ChevronUp, Plus, Scissors, Settings } from 'lucide-react';
import { cn, formatarDuracaoHMS } from '@/lib/utils';
import { Tooltip } from '@/components/ui/tooltip';
import { PanelShell } from '@/components/workbench/PanelShell';
import { RetractableFooter } from '@/components/workbench/RetractableFooter';
import type { Corte, StatusExportCorte } from '@/types/models';
import { moverCorte, useReordenarCortes } from '@/hooks/useEditor';
import { MetadataModal } from '@/features/metadata/MetadataModal';
import { AdicionarCorteModal } from './AdicionarCorteModal';
import { resolveThumbUrl } from '@/lib/api';
import { tintarFundo, type SinalFlags } from './UnifiedSidebar';

// ─────────────────────────────────────────────────────────────
// WorkbenchCutsPanel — a lista de cortes da UnifiedSidebar
// re-hospedada num PanelShell retrátil (DE-PARA §3, Etapa 3a).
// A navegação por fases saiu (virou aba do shell); os tints
// `tintarFundo` e o CorteStatusCard são preservados intactos.
//
// Rodapé "⚙ FERRAMENTAS DO CORTE" (AUDITORIA-v2 §8, CP9): a auditoria
// lista 5 ações candidatas, mas 4 delas já têm um gatilho que funciona
// bem em outro lugar — duplicá-las aqui violaria a regra "sem duplicar
// trigger" da própria etapa. Decisão (ver deviations do commit):
//   - "÷ dividir corte em dois" já mora no menu ⚙ da Timeline (CP7).
//   - "↕ reordenar cortes" já é prático como setas ↑↓ inline na lista.
//   - "⧉ duplicar corte" está fora de escopo desta rodada (não existe
//     hook/endpoint — decisão de Paulo).
//   - "🗑 excluir corte" duplicaria 1:1 o botão "R · Rejeitar" do
//     veredito: `toggleRejeitado` já chama `useDeletarCorte` (delete
//     permanente com confirm), como confirma o title="Excluir (R)" em
//     `CommonTopBar.tsx`.
// Sobra só "✂ adicionar corte manual" (piso explícito da etapa) — o
// mesmo `AdicionarCorteModal` já acionado pelo ícone do header e pelo
// botão tracejado da lista; o rodapé é só mais um ponto de acesso
// estável (sempre no mesmo lugar, mesmo com a lista rolada/colapsada).
// ─────────────────────────────────────────────────────────────

const APROVADO_STATUS = new Set<Corte['status']>(['aprovado', 'editado', 'processado']);

interface Props {
  projetoId: string;
  cortes: Corte[];
  corteAtivoId: string;
  exportStatus: StatusExportCorte[];
  /** Resolve a URL ao clicar num corte. Default: /projetos/:id/cortes/:corteId. */
  getCortePath?: (corte: Corte) => string;
  /** Tempo atual do player p/ o modal "Adicionar corte" (só no Bruto). */
  getCurrentTime?: () => number;
}

export function WorkbenchCutsPanel({
  projetoId,
  cortes,
  corteAtivoId,
  exportStatus,
  getCortePath,
  getCurrentTime,
}: Props) {
  const navigate = useNavigate();
  const activeCardRef = useRef<HTMLDivElement | null>(null);
  const statusMap = new Map(exportStatus.map((s) => [s.corte_id, s] as const));
  const [adicionarOpen, setAdicionarOpen] = useState(false);
  const [metaCorte, setMetaCorte] = useState<Corte | null>(null);
  const [ferramentasOpen, setFerramentasOpen] = useState(false);
  const reordenar = useReordenarCortes(projetoId);

  const aprovados = cortes.filter((c) => APROVADO_STATUS.has(c.status)).length;

  function mover(corteId: string, delta: -1 | 1) {
    const novaOrdem = moverCorte(cortes, corteId, delta);
    if (novaOrdem) reordenar.mutate(novaOrdem);
  }

  useEffect(() => {
    activeCardRef.current?.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'auto' });
  }, [corteAtivoId, cortes.length]);

  return (
    <PanelShell
      id="cuts"
      side="left"
      title={`CORTES · ${aprovados}/${cortes.length}`}
      indicator={<span aria-hidden className="h-2 w-2 rounded-full bg-[var(--wb-accent)]" />}
      headerExtra={
        <Tooltip label="Adicionar corte manualmente" side="bottom">
          <button
            type="button"
            onClick={() => setAdicionarOpen(true)}
            aria-label="Adicionar corte manualmente"
            className="flex h-[22px] w-[22px] items-center justify-center rounded-md bg-[var(--wb-bg-inset)] text-[var(--wb-text-dim)] hover:text-[var(--wb-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--wb-focus)]"
          >
            <Plus size={12} strokeWidth={2.4} aria-hidden />
          </button>
        </Tooltip>
      }
    >
      <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-1.5 pb-2">
        {cortes.map((corte, idx) => {
          const ativo = corte.id === corteAtivoId;
          const stat = statusMap.get(corte.id);
          const publicado = Boolean(stat?.youtube_url_publicado);
          const flags: SinalFlags = {
            aprovado: APROVADO_STATUS.has(corte.status),
            rejeitado: corte.status === 'rejeitado',
            fire: Boolean(corte.is_fire),
            leitura: Boolean(corte.is_leitura),
          };
          const tintBackground = tintarFundo(flags, ativo);
          const inlineStyle: React.CSSProperties | undefined = tintBackground
            ? { background: tintBackground }
            : undefined;
          const podeSubir = idx > 0;
          const podeDescer = idx < cortes.length - 1;

          return (
            <div
              key={corte.id}
              ref={ativo ? activeCardRef : undefined}
              style={inlineStyle}
              className={cn(
                'group relative flex w-full items-center gap-1 rounded-[var(--radius-sm)] border px-1.5 py-1.5 transition-colors',
                !tintBackground && 'hover:bg-[var(--wb-bg-inset)]',
                ativo
                  ? cn(
                      'border-[var(--wb-border)] shadow-sm',
                      !tintBackground && 'bg-[var(--wb-bg-card)]',
                    )
                  : 'border-transparent',
              )}
            >
              {ativo && (
                <span
                  aria-hidden
                  className="absolute bottom-3 left-[-7px] top-3 w-[3px] rounded-r-full bg-[var(--wb-accent)]"
                />
              )}

              <div
                className={cn(
                  'pointer-events-none absolute right-0.5 top-0.5 flex flex-col gap-0.5 transition-opacity',
                  'opacity-0 focus-within:opacity-100 group-hover:opacity-100',
                  reordenar.isPending && 'opacity-100',
                )}
              >
                <button
                  type="button"
                  onClick={() => mover(corte.id, -1)}
                  disabled={!podeSubir || reordenar.isPending}
                  aria-label={`Mover corte ${corte.numero} para cima`}
                  className="pointer-events-auto flex h-3.5 w-3.5 items-center justify-center rounded-[var(--radius-xs)] bg-[var(--wb-bg-card)]/85 text-[var(--wb-text-dim)] shadow-sm hover:bg-[var(--wb-bg-inset)] hover:text-[var(--wb-text)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--wb-focus)] disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-[var(--wb-bg-card)]/85"
                >
                  <ChevronUp size={10} strokeWidth={2.4} aria-hidden />
                </button>
                <button
                  type="button"
                  onClick={() => mover(corte.id, 1)}
                  disabled={!podeDescer || reordenar.isPending}
                  aria-label={`Mover corte ${corte.numero} para baixo`}
                  className="pointer-events-auto flex h-3.5 w-3.5 items-center justify-center rounded-[var(--radius-xs)] bg-[var(--wb-bg-card)]/85 text-[var(--wb-text-dim)] shadow-sm hover:bg-[var(--wb-bg-inset)] hover:text-[var(--wb-text)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--wb-focus)] disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-[var(--wb-bg-card)]/85"
                >
                  <ChevronDown size={10} strokeWidth={2.4} aria-hidden />
                </button>
              </div>

              {/* Linha do protótipo: thumb 50×29 + "NN · título" + status. */}
              <button
                type="button"
                onClick={() =>
                  navigate(getCortePath?.(corte) ?? `/projetos/${projetoId}/cortes/${corte.id}`)
                }
                className="flex w-full items-center gap-2 text-left focus-visible:outline-none"
              >
                {resolveThumbUrl(projetoId, stat?.thumbnail_path) ? (
                  <img
                    src={resolveThumbUrl(projetoId, stat?.thumbnail_path) ?? undefined}
                    alt=""
                    loading="lazy"
                    className="h-[29px] w-[50px] flex-none rounded object-cover"
                  />
                ) : (
                  <span
                    aria-hidden
                    className="flex h-[29px] w-[50px] flex-none items-center justify-center rounded bg-[var(--wb-bg-inset)] font-code text-[9px] font-bold text-[var(--wb-text-dim)]"
                  >
                    #{corte.numero}
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  <span
                    className={cn(
                      'block truncate text-[11px]',
                      flags.aprovado || publicado
                        ? 'font-bold text-[var(--wb-text)]'
                        : 'font-semibold text-[var(--wb-text-mute)]',
                    )}
                  >
                    {corte.numero} · {corte.titulo_proposto || `Corte #${corte.numero}`}
                  </span>
                  <span
                    className={cn(
                      'block truncate text-[9.5px]',
                      ativo
                        ? 'font-semibold text-[var(--wb-accent)]'
                        : 'text-[var(--wb-text-mute)]',
                    )}
                  >
                    {formatarDuracaoHMS(Math.max(0, corte.fim_seg - corte.inicio_seg))}
                    {publicado
                      ? ' · publicado ▶'
                      : flags.rejeitado
                        ? ' · rejeitado'
                        : flags.aprovado
                          ? `${flags.fire ? ' · aprovado 🔥' : ' · aprovado ✓'}`
                          : ativo
                            ? ' · avaliando…'
                            : ' · pendente'}
                  </span>
                </span>
                <span
                  role="button"
                  tabIndex={0}
                  aria-label={`Abrir metadados do corte ${corte.numero}`}
                  title="Metadados"
                  onClick={(e) => {
                    e.stopPropagation();
                    setMetaCorte(corte);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.stopPropagation();
                      setMetaCorte(corte);
                    }
                  }}
                  className="flex-none rounded px-1 text-[11px] text-[var(--wb-text-dim)] opacity-0 hover:text-[var(--wb-text)] focus-visible:opacity-100 group-hover:opacity-100"
                >
                  🏷
                </span>
              </button>
            </div>
          );
        })}

        <button
          type="button"
          onClick={() => setAdicionarOpen(true)}
          className="mt-1 rounded-lg border border-dashed border-[var(--wb-border)] px-2 py-1.5 text-center text-[10.5px] font-semibold text-[var(--wb-text-dim)] hover:text-[var(--wb-text)]"
        >
          ＋ adicionar corte
        </button>
      </div>

      <RetractableFooter
        icon={<Settings size={13} />}
        label="FERRAMENTAS DO CORTE"
        open={ferramentasOpen}
        onToggle={() => setFerramentasOpen((v) => !v)}
      >
        <button
          type="button"
          onClick={() => setAdicionarOpen(true)}
          className="flex items-center gap-2 rounded-[var(--radius-sm)] px-2 py-1.5 text-left text-[11.5px] font-semibold text-[var(--wb-text)] hover:bg-[var(--wb-bg-inset)]"
        >
          <Scissors size={13} className="text-[var(--wb-text-dim)]" aria-hidden />
          Adicionar corte manual
        </button>
      </RetractableFooter>

      <AdicionarCorteModal
        open={adicionarOpen}
        onClose={() => setAdicionarOpen(false)}
        projetoId={projetoId}
        getCurrentTime={getCurrentTime}
        onCreated={(corte) =>
          navigate(getCortePath?.(corte) ?? `/projetos/${projetoId}/cortes/${corte.id}`)
        }
      />

      {metaCorte && (
        <MetadataModal
          open
          projetoId={projetoId}
          corte={metaCorte}
          onClose={() => setMetaCorte(null)}
        />
      )}
    </PanelShell>
  );
}
