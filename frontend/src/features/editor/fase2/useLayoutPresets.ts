/**
 * Hooks de presets de layout YouTube (F-048).
 *
 * `useLayoutPresets({ tipo })` lista os presets de um tipo (ou todos);
 * `useSaveLayoutPreset` cria; `useUpdateLayoutPreset` renomeia/atualiza payload;
 * `useDeleteLayoutPreset` remove. Todas as mutacoes invalidam a query base.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '@/lib/api';
import type {
  AtualizarLayoutPresetRequest,
  CriarLayoutPresetRequest,
  LayoutPreset,
  LayoutPresetTipo,
} from '@/types/presets';

const LAYOUT_PRESETS_KEY = ['layout-presets'] as const;

function queryKey(tipo?: LayoutPresetTipo) {
  return tipo ? ([...LAYOUT_PRESETS_KEY, tipo] as const) : LAYOUT_PRESETS_KEY;
}

export function useLayoutPresets(options: { tipo?: LayoutPresetTipo } = {}) {
  const { tipo } = options;
  return useQuery({
    queryKey: queryKey(tipo),
    queryFn: () => api.listarLayoutPresets(tipo),
    staleTime: 30_000,
  });
}

export function useSaveLayoutPreset() {
  const qc = useQueryClient();
  return useMutation<LayoutPreset, Error, CriarLayoutPresetRequest>({
    mutationFn: (body) => api.criarLayoutPreset(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: LAYOUT_PRESETS_KEY });
    },
  });
}

export function useUpdateLayoutPreset() {
  const qc = useQueryClient();
  return useMutation<LayoutPreset, Error, { id: string; body: AtualizarLayoutPresetRequest }>({
    mutationFn: ({ id, body }) => api.atualizarLayoutPreset(id, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: LAYOUT_PRESETS_KEY });
    },
  });
}

export function useDeleteLayoutPreset() {
  const qc = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: (id) => api.deletarLayoutPreset(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: LAYOUT_PRESETS_KEY });
    },
  });
}
