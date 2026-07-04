import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Tooltip } from '@/components/ui/tooltip';
import type { Projeto } from '@/types/models';

// ─────────────────────────────────────────────────────────────
// RendererConfigControls — selects de configuracao de render do projeto.
// Refatorado para o hand-off (`02_POS.md > Aba 1 Cenas > Padroes do projeto`):
//   - Em v3_pos.jsx os Padroes sao separados em "Card" (sempre visivel) +
//     "Render/Sombra" recolhidos em expander "avancado".
//   - Aqui expomos sub-componentes: <Card/> e <Avancado/> (Render + Sombra).
//   - Mantemos export default que renderiza todos juntos (compatibilidade
//     com callers existentes — pode ser deprecado depois).
//
// Mutations e queries preservadas: useAtualizarRenderConfig + cache opt do
// projeto.
// ─────────────────────────────────────────────────────────────

type Sombra = 'nenhuma' | 'leve' | 'media' | 'forte';
type LayoutCard = 'horizontal' | 'vertical';
type RenderConfigPatch = {
  sombra_nivel_padrao?: Sombra;
  layout_card_padrao?: LayoutCard;
};

const SOMBRA_LABELS: Record<Sombra, string> = {
  nenhuma: 'Sem sombra',
  leve: 'Leve',
  media: 'Media',
  forte: 'Forte',
};

const LAYOUT_LABELS: Record<LayoutCard, string> = {
  horizontal: 'Horizontal',
  vertical: 'Vertical',
};

interface Props {
  projetoId: string;
}

function useRenderConfig(projetoId: string) {
  const qc = useQueryClient();
  const { data: projeto } = useQuery<Projeto>({
    queryKey: ['projeto', projetoId],
    queryFn: () => api.obterProjeto(projetoId),
    staleTime: 30_000,
  });

  const [sombra, setSombra] = useState<Sombra>('nenhuma');
  const [layout, setLayout] = useState<LayoutCard>('vertical');
  const projetoSombra = projeto?.sombra_nivel_padrao ?? 'nenhuma';
  const projetoLayout = projeto?.layout_card_padrao ?? 'vertical';

  useEffect(() => {
    if (projeto) {
      setSombra(projetoSombra);
      setLayout(projetoLayout);
    }
  }, [projeto, projetoSombra, projetoLayout]);

  const mutate = useMutation({
    mutationFn: (body: RenderConfigPatch) => api.atualizarRenderConfig(projetoId, body),
    onMutate: async (body) => {
      await qc.cancelQueries({ queryKey: ['projeto', projetoId] });
      const previous = qc.getQueryData<Projeto>(['projeto', projetoId]);
      qc.setQueryData<Projeto>(['projeto', projetoId], (current) =>
        current ? { ...current, ...body } : current,
      );
      return { previous };
    },
    onError: (_error, _body, context) => {
      if (context?.previous) qc.setQueryData(['projeto', projetoId], context.previous);
    },
    onSuccess: (updated) => {
      qc.setQueryData(['projeto', projetoId], updated);
      void qc.invalidateQueries({ queryKey: ['projeto', projetoId] });
    },
  });

  const handleSombra = (next: Sombra) => {
    setSombra(next);
    mutate.mutate({ sombra_nivel_padrao: next });
  };
  const handleLayout = (next: LayoutCard) => {
    setLayout(next);
    mutate.mutate({ layout_card_padrao: next });
  };

  return { sombra, layout, handleSombra, handleLayout, pending: mutate.isPending };
}

// ── ConfigSelect · v3_pos.jsx:650-693 ────────────────────────
// Label segmentado + select numa pill compacta. Mono UPPERCASE.
function ConfigSelect<T extends string>({
  label,
  value,
  options,
  optionLabels,
  onChange,
  disabled,
  title,
}: {
  label: string;
  value: T;
  options: readonly T[];
  optionLabels?: Record<T, string>;
  onChange: (v: T) => void;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <Tooltip label={title ?? label} side="bottom">
      <label
        className="inline-flex h-[26px] items-center overflow-hidden rounded-[var(--radius-xs)] border border-[var(--wb-border)] bg-[var(--wb-bg-inset)]"
        style={{ flex: '1 1 0', minWidth: 0 }}
      >
        <span className="inline-flex h-full items-center border-r border-[var(--wb-border-soft)] px-2 font-code text-[9.5px] font-bold uppercase tracking-[0.06em] text-[var(--wb-text-dim)]">
          {label}
        </span>
        <select
          value={value}
          onChange={(e) => onChange(e.target.value as T)}
          disabled={disabled}
          className="h-full min-w-0 flex-1 bg-transparent px-1.5 font-code text-[11px] font-bold uppercase tracking-[0.04em] text-[var(--wb-text)] outline-none disabled:opacity-60"
        >
          {options.map((o) => (
            <option key={o} value={o}>
              {optionLabels?.[o] ?? o}
            </option>
          ))}
        </select>
      </label>
    </Tooltip>
  );
}

// Sub-componentes expostos para CenasPanel:
// `RendererConfigControls.Card` = sempre visivel (Card Horizontal/Vertical)
// `RendererConfigControls.Avancado` = expander (Sombra + Render placeholder)
function CardSelect({ projetoId }: Props) {
  const { layout, handleLayout, pending } = useRenderConfig(projetoId);
  return (
    <ConfigSelect<LayoutCard>
      label="Card"
      value={layout}
      options={['horizontal', 'vertical'] as const}
      optionLabels={LAYOUT_LABELS}
      onChange={handleLayout}
      disabled={pending}
      title="Layout padrao dos cards · cenas com auto usam este modelo"
    />
  );
}

function AvancadoSelects({ projetoId }: Props) {
  // Sombra default = 'nenhuma' (decisao Paulo, ja era o default no
  // `useRenderConfig`). Render V2 removido — V1 nao existe mais e nao havia
  // uso real para o select.
  const { sombra, handleSombra, pending } = useRenderConfig(projetoId);
  return (
    <ConfigSelect<Sombra>
      label="Sombra"
      value={sombra}
      options={['nenhuma', 'leve', 'media', 'forte'] as const}
      optionLabels={SOMBRA_LABELS}
      onChange={handleSombra}
      disabled={pending}
      title="Sombra padrao do projeto · cenas com auto usam este nivel"
    />
  );
}

// Export default = compat: renderiza Card + Avancado juntos (caller antigo).
export function RendererConfigControls({ projetoId }: Props) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <CardSelect projetoId={projetoId} />
      <AvancadoSelects projetoId={projetoId} />
    </div>
  );
}

RendererConfigControls.Card = CardSelect;
RendererConfigControls.Avancado = AvancadoSelects;
