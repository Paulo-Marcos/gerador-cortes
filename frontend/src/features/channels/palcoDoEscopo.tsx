import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, type ReactNode } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useCorte } from '@/features/editor/useCortes';
import { presetsDoEstilo } from '@/shared/palco/presetsPorEstilo';
import { useLayoutPresets } from '@/shared/palco/useLayoutPresets';
import type { LayoutPreset, LayoutPresetTipo } from '@/types/presets';
import { palcoApi, type PalcoDoEscopo, type PalcoDoEscopoEdicao, type TipoDoPalco } from './api/canais';
import { paraComponentesDoPalco } from './palcoDoCanal';
import { PalcoDoCorteContext, useCanais, usePalcoDoCanalAtivoResolvido } from './useChannels';

// D-923: o palco de um projeto ou de um corte, por tipo de vídeo.
//
// O palco GLOBAL é o do canal (tela de Canais). No modal de posição do pós (o
// horizontal) e no do short, o operador ajusta o palco só do corte ou do
// projeto — e cada tipo tem o seu: o que muda no horizontal não vaza para o
// short. As prévias e as listas de presets da página seguem o palco que vale
// ali (`PalcoDoCortePelaRota`). Contrato: GET/PUT /palco/do-escopo.

function useCanalAtivoId(): string | undefined {
  return useCanais().data?.canais.find((c) => c.ativo)?.id;
}

/** O palco que vale no corte (ou no projeto) para o tipo, e de onde ele vem. */
export function usePalcoDoEscopo(tipo: TipoDoPalco, projetoId: string | undefined, corteId?: string) {
  const canal = useCanalAtivoId();
  return useQuery<PalcoDoEscopo>({
    queryKey: ['palco-do-escopo', canal ?? '', tipo, projetoId ?? '', corteId ?? ''],
    queryFn: () => palcoApi.doEscopo(canal ?? '', tipo, projetoId ?? '', corteId),
    enabled: Boolean(canal && projetoId),
    staleTime: 5_000,
  });
}

export function useGravarPalcoDoEscopo() {
  const qc = useQueryClient();
  const canal = useCanalAtivoId();
  return useMutation({
    mutationFn: (body: PalcoDoEscopoEdicao) => palcoApi.gravarDoEscopo(canal ?? '', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['palco-do-escopo'] }),
  });
}

/**
 * Põe o palco do corte (no tipo da página) por cima do canal para tudo o que a
 * página desenha. O corte vem de `?corte=` (pós) ou de `:corteId` (shorts).
 */
export function PalcoDoCortePelaRota({ tipo, children }: { tipo: TipoDoPalco; children: ReactNode }) {
  const params = useParams();
  const [busca] = useSearchParams();
  const corteId = params.corteId ?? busca.get('corte') ?? undefined;
  const corte = useCorte(corteId || undefined).data;
  const projetoId = params.id ?? corte?.projeto_id;
  const { data } = usePalcoDoEscopo(tipo, projetoId, corteId || undefined);
  const palco = useMemo(() => (data ? paraComponentesDoPalco(data.efetivo) : null), [data]);
  return <PalcoDoCorteContext.Provider value={palco}>{children}</PalcoDoCorteContext.Provider>;
}

/** Só os presets do estilo que vale aqui (o do corte em foco, senão o do canal). */
export function usePresetsDoEstiloEfetivo<T extends { payload?: unknown }>(presets: readonly T[]): T[] {
  const { estilo } = usePalcoDoCanalAtivoResolvido();
  return useMemo(() => presetsDoEstilo(presets, estilo), [presets, estilo]);
}

/** Os presets de palco do tipo, só os do estilo que vale aqui ("os antigos continuam aparecendo"). */
export function useLayoutPresetsDoEstilo(filtro: { tipo: LayoutPresetTipo }) {
  const consulta = useLayoutPresets(filtro);
  const data = usePresetsDoEstiloEfetivo(consulta.data ?? SEM_PRESETS);
  return { ...consulta, data };
}

const SEM_PRESETS: LayoutPreset[] = [];

/** Onde a troca feita no modal grava: no corte, no projeto ou em lugar nenhum (o global é do canal). */
export type AlvoDoEstilo = 'corte' | 'projeto' | 'global';

/** O escopo do modal de posição → onde a troca grava (segmentos gravam no corte). */
export function alvoDoEstiloPara(escopo: string): AlvoDoEstilo {
  return escopo === 'global' || escopo === 'projeto' ? escopo : 'corte';
}
