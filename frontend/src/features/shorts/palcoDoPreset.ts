import { useEffect, useRef } from 'react';
import { useCorte } from '@/features/editor/useCortes';
import type { PalcoDoEscopoEdicao } from '@/features/channels/api/canais';
import { useGravarPalcoDoEscopo } from '@/features/channels/palcoDoEscopo';
import type { EstiloDoPalco } from '@/shared/palco/presetsPorEstilo';
import type { PalcoShortPreset } from '@/types/presets';
import { usePalcoDoShort } from './PalcoDoShortNoModal';
import { useGuardarPresetPadrao, type GuardaDePreset } from './useShortsDoCorte';

// D-960: o preset do short leva o palco do estilo, e não só o arranjo.
//
// "Eu salvo, só que não fica atrelado ao preset." Dois furos davam isso. O
// editor de preset aberto pelos padrões do corte guardava só a foto do trecho
// (arranjo, janelas, textura, legenda) — sem o estilo, o preset nascia "do
// antigo" e sumia da lista do limpo; sem o palco, nome, @ e cabeçalho ficavam
// fora. E escolher o preset como padrão do corte só apontava o id: o palco que
// ele leva nunca chegava ao corte, então os shorts seguiam com o do canal.

/** A foto do trecho com o estilo e o palco em que o preset foi montado. */
export function presetComPalco<P>(foto: PalcoShortPreset, estilo: EstiloDoPalco, palco: P) {
  return { ...foto, estilo, palco };
}

/** O PUT que leva o palco do preset ao corte; `null` quando não há o que levar. */
export function corpoDoPalcoNoCorte(
  payload: unknown,
  { corteId, projetoId }: { corteId: string; projetoId: string | undefined },
): PalcoDoEscopoEdicao | null {
  const palco = (payload as { palco?: unknown } | null | undefined)?.palco;
  if (!projetoId || !palco || typeof palco !== 'object') return null;
  return {
    escopo: 'corte',
    tipo: 'short',
    projeto_id: projetoId,
    corte_id: corteId,
    componentes: palco as PalcoDoEscopoEdicao['componentes'],
  };
}

/** Grava no corte o palco do preset que virou o padrão dele. */
export function useLevarPalcoDoPresetAoCorte(corteId: string) {
  const projetoId = useCorte(corteId).data?.projeto_id;
  const gravar = useGravarPalcoDoEscopo();
  return (payload: unknown) => {
    const corpo = corpoDoPalcoNoCorte(payload, { corteId, projetoId });
    if (corpo) gravar.mutate(corpo);
  };
}

/**
 * O palco do preset em edição: nasce do que vale no corte com o palco do
 * preset por cima, e só sai dali quando o preset é salvo — nada grava no corte
 * enquanto se edita.
 */
export function usePalcoDoPresetEmEdicao(corteId: string, payloadDoPreset: unknown) {
  const palco = usePalcoDoShort(corteId, true);
  const semeado = useRef(false);
  const { efetivo, dePreset } = palco;
  useEffect(() => {
    if (!efetivo || semeado.current) return;
    semeado.current = true;
    dePreset((payloadDoPreset as { palco?: unknown } | null | undefined)?.palco);
  }, [efetivo, dePreset, payloadDoPreset]);
  return palco;
}

/**
 * A guarda do preset de palco dos padrões: virar o padrão do corte leva o palco
 * do preset ao corte — só depois de salvo, porque o `onClose` da guarda também
 * roda ao apagar.
 */
export function useGuardarPresetDePalco({
  corteId,
  editando,
  onClose,
}: {
  corteId: string;
  editando: { id: string; nome: string } | null;
  onClose: () => void;
}) {
  const levar = useLevarPalcoDoPresetAoCorte(corteId);
  const levarAoSalvar = useRef<unknown>(null);
  const guarda = useGuardarPresetPadrao({
    tipo: 'palco_short',
    corteId,
    editando,
    onClose: () => {
      if (levarAoSalvar.current) levar(levarAoSalvar.current);
      onClose();
    },
  });
  const salvar = (nome: string, payload: GuardaDePreset['payload'], virarPadrao: boolean) => {
    levarAoSalvar.current = virarPadrao ? payload : null;
    return guarda.salvar(nome, payload, virarPadrao);
  };
  return { ...guarda, salvar };
}

interface Opcao {
  id: string;
  nome: string;
}

/**
 * Os palcos que o select dos padrões oferece: só os do estilo ativo. O padrão
 * já escolhido de outro estilo fica, marcado — sumir com ele faria o select
 * dizer "cada trecho decide" sobre um corte que tem padrão.
 */
export function opcoesDoPalcoPadrao(
  disponiveis: readonly Opcao[],
  doEstilo: readonly { id: string }[],
  escolhido: string,
): Opcao[] {
  const ids = new Set(doEstilo.map((preset) => preset.id));
  return disponiveis
    .filter((preset) => ids.has(preset.id) || preset.id === escolhido)
    .map((preset) => (ids.has(preset.id) ? preset : { ...preset, nome: `${preset.nome} (outro estilo)` }));
}
