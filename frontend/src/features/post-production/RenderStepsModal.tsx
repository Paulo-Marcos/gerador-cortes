import { useEffect, useMemo, useState } from 'react';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Selo } from '@/components/ui/selo';
import { FOCO } from '@/features/editor/salaDoEditor';
import { cn } from '@/lib/utils';
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
import { Icon } from '@/upgrade/Icon';

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
    <Dialog
      open={open}
      onClose={onClose}
      title="O que renderizar"
      description="Marque as etapas a (re)processar. As etapas formam uma sequência contígua."
      tamanho="md"
    >
      {/* Atalhos rápidos */}
      <div className="mb-3 flex flex-wrap gap-2">
        {temEtapas && (
          <Button
            type="button"
            variant="secundario"
            size="pq"
            onClick={() => onConfirm({ startFrom: 'auto', continuar: true })}
          >
            <Icon name="sparkles" /> Continuar de onde parou
          </Button>
        )}
        <Button
          type="button"
          variant="secundario"
          size="pq"
          onClick={() => {
            setSelecao(new Set(SELECAO_COMPLETA));
            setReaproveitarOverlays(false);
          }}
        >
          <Icon name="refresh-cw" /> Reprocessar tudo
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
              data-sala=""
              className={cn(
                'flex items-start gap-3 rounded-campo border p-3 text-left transition-colors motion-reduce:transition-none',
                marcada ? 'border-iris-fio bg-iris-suave' : 'border-fio-2 bg-vidro hover:border-campo',
                obrigatoria && 'cursor-not-allowed opacity-90',
                FOCO,
              )}
            >
              <span
                className={cn(
                  'mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-etiqueta border',
                  marcada ? 'border-iris bg-iris text-sobre-iris' : 'border-campo text-transparent',
                )}
                aria-hidden
              >
                <Icon name="check" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="text-linha text-fg">{info.label}</span>
                  {pronta && <Selo tom="ok">pronta</Selo>}
                  {obrigatoria && (
                    <span className="inline-flex items-center gap-1 text-micro text-fg-2">
                      <Icon name="lock" /> intermediária
                    </span>
                  )}
                </span>
                <span className="mt-0.5 block text-pequeno leading-5 text-fg-2">
                  {info.descricao}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      {/* Toggle de reaproveitamento (só relevante para overlays) */}
      {overlaysNaSelecao && (
        <label className="mt-3 flex cursor-pointer items-center gap-2 rounded-campo border border-fio bg-vidro p-2.5 text-pequeno text-fg">
          <Checkbox checked={reaproveitarOverlays} onCheckedChange={setReaproveitarOverlays} />
          <span>
            Reaproveitar overlays já renderizados
            <span className="ml-1 text-fg-2">
              (desmarque para refazer todos os chunks do zero)
            </span>
          </span>
        </label>
      )}

      {/* Resumo do que vai acontecer */}
      <p className="mt-3 flex items-start gap-2 text-pequeno leading-5 text-fg-2">
        {startInvalido ? (
          <>
            <Icon name="circle-slash" className="mt-0.5 shrink-0 text-aviso" />
            <span>A grade precisa existir para iniciar dos overlays ou do render final.</span>
          </>
        ) : (
          <span>{descreverRequest(req)}</span>
        )}
      </p>

      <div className="mt-4 flex justify-end gap-2">
        <Button type="button" variant="fantasma" size="pq" onClick={onClose}>
          Cancelar
        </Button>
        <Button type="button" variant="secundario" size="pq" onClick={confirmarGranular} disabled={!podeConfirmar}>
          Renderizar
        </Button>
      </div>
    </Dialog>
  );
}
