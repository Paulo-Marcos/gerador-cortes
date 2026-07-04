import { useEffect, useMemo, useState } from 'react';
import { Check, CircleSlash, Lock, RefreshCw, Sparkles } from 'lucide-react';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import type { PipelineStatusResponse } from '@/types/models';
import {
  FASES_RENDER,
  type FaseRender,
  type RenderRequest,
  alternarFase,
  descreverRequest,
  faseEhMeioObrigatorio,
  fasePronta,
  faseSelecionavel,
  selecaoParaRequest,
} from './renderEtapas';

interface RenderStepsModalProps {
  open: boolean;
  status?: PipelineStatusResponse;
  onClose: () => void;
  /** `auto` = continuar de onde parou; `req` = seleção granular de etapas. */
  onConfirm: (req: RenderRequest | { startFrom: 'auto'; continuar: true }) => void;
}

const SELECAO_COMPLETA = new Set<FaseRender>(['grade', 'overlays', 'render_final']);

export function RenderStepsModal({ open, status, onClose, onConfirm }: RenderStepsModalProps) {
  const [selecao, setSelecao] = useState<Set<FaseRender>>(SELECAO_COMPLETA);
  const [reaproveitarOverlays, setReaproveitarOverlays] = useState(true);

  // Reabrir o modal volta ao estado padrão (reprocessar tudo), ponto de
  // partida do qual o usuário encolhe a seleção para o que precisa.
  useEffect(() => {
    if (open) {
      setSelecao(new Set(SELECAO_COMPLETA));
      setReaproveitarOverlays(true);
    }
  }, [open]);

  const req = useMemo(
    () => selecaoParaRequest(selecao, { reaproveitarOverlays }),
    [selecao, reaproveitarOverlays],
  );

  const startInvalido = Boolean(req && !faseSelecionavel(req.startFrom, status));
  const overlaysNaSelecao = selecao.has('overlays');
  const podeConfirmar = Boolean(req) && !startInvalido;
  const temEtapas = Boolean(status?.tem_etapas_concluidas);

  function toggle(fase: FaseRender) {
    if (faseEhMeioObrigatorio(selecao, fase)) return;
    setSelecao((atual) => alternarFase(atual, fase));
  }

  function confirmarGranular() {
    if (req && podeConfirmar) onConfirm(req);
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="O que renderizar"
      description="Marque as etapas a (re)processar. As etapas formam uma sequência contígua."
      size="md"
    >
      {/* Atalhos rápidos */}
      <div className="mb-3 flex flex-wrap gap-2">
        {temEtapas && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onConfirm({ startFrom: 'auto', continuar: true })}
          >
            <Sparkles /> Continuar de onde parou
          </Button>
        )}
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            setSelecao(new Set(SELECAO_COMPLETA));
            setReaproveitarOverlays(false);
          }}
        >
          <RefreshCw /> Reprocessar tudo
        </Button>
      </div>

      {/* Checkboxes de etapas */}
      <div className="grid gap-2">
        {FASES_RENDER.map((info) => {
          const marcada = selecao.has(info.fase);
          const pronta = fasePronta(info.fase, status);
          const obrigatoria = faseEhMeioObrigatorio(selecao, info.fase);
          return (
            <button
              key={info.fase}
              type="button"
              onClick={() => toggle(info.fase)}
              aria-pressed={marcada}
              disabled={obrigatoria}
              className={[
                'flex items-start gap-3 rounded-[var(--radius-sm)] border p-3 text-left transition',
                marcada
                  ? 'border-[var(--wb-accent)] bg-[var(--wb-bg-card-elev)]'
                  : 'border-[var(--wb-border)] bg-[var(--wb-bg-card)] hover:border-[var(--wb-accent)]',
                obrigatoria ? 'cursor-not-allowed opacity-90' : '',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--wb-focus)]',
              ].join(' ')}
            >
              <span
                className={[
                  'mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-[var(--radius-xs)] border',
                  marcada
                    ? 'border-[var(--wb-accent)] bg-[var(--wb-accent)] text-[var(--wb-on-accent,white)]'
                    : 'border-[var(--wb-border)] text-transparent',
                ].join(' ')}
                aria-hidden
              >
                <Check size={12} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-[var(--wb-text)]">{info.label}</span>
                  {pronta && (
                    <span className="rounded-full bg-[var(--wb-ok)]/15 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-[var(--wb-ok)]">
                      pronta
                    </span>
                  )}
                  {obrigatoria && (
                    <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wide text-[var(--wb-text-mute)]">
                      <Lock size={10} /> intermediária
                    </span>
                  )}
                </span>
                <span className="mt-0.5 block text-xs leading-5 text-[var(--wb-text-mute)]">
                  {info.descricao}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      {/* Toggle de reaproveitamento (só relevante para overlays) */}
      {overlaysNaSelecao && (
        <label className="mt-3 flex cursor-pointer items-center gap-2 rounded-[var(--radius-sm)] border border-[var(--wb-border-soft)] bg-[var(--wb-bg-card)] p-2.5 text-xs text-[var(--wb-text)]">
          <input
            type="checkbox"
            checked={reaproveitarOverlays}
            onChange={(e) => setReaproveitarOverlays(e.target.checked)}
            className="h-3.5 w-3.5 accent-[var(--wb-accent)]"
          />
          <span>
            Reaproveitar overlays já renderizados
            <span className="ml-1 text-[var(--wb-text-mute)]">
              (desmarque para refazer todos os chunks do zero)
            </span>
          </span>
        </label>
      )}

      {/* Resumo do que vai acontecer */}
      <p className="mt-3 flex items-start gap-2 text-xs leading-5 text-[var(--wb-text-mute)]">
        {startInvalido ? (
          <>
            <CircleSlash size={14} className="mt-0.5 shrink-0 text-[var(--wb-warn)]" />
            <span>A grade precisa existir para iniciar dos overlays ou do render final.</span>
          </>
        ) : (
          <span>{descreverRequest(req)}</span>
        )}
      </p>

      <div className="mt-4 flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onClose}>
          Cancelar
        </Button>
        <Button type="button" size="sm" onClick={confirmarGranular} disabled={!podeConfirmar}>
          Renderizar
        </Button>
      </div>
    </Modal>
  );
}
