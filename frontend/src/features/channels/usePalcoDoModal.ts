import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { PalcoComponentes, PalcoComponentesEdicao, TipoDoPalco } from './api/canais';
import { componentesDoRascunho } from './EdicaoDoPalco';
import { edicaoDe, rascunhoDe, type RascunhoDoPalco } from './PalcoComponentesSection';
import { useGravarPalcoDoEscopo, usePalcoDoEscopo, type AlvoDoEstilo } from './palcoDoEscopo';
import { useGravarPalco, usePalcoDoCanalAtivo } from './useChannels';

// D-923: o palco do tipo (horizontal ou short) em rascunho dentro dos modais
// de posição. Fora de `palcoDoEscopo.tsx` para a rota não carregar o
// formulário do palco junto com a casca. D-938: no alvo `canal` (o modal
// aberto pela tela de Canais) o rascunho é o palco do próprio canal.

/** O palco do preset por cima do que vale agora (o preset antigo, sem palco, não muda nada). */
function comPalcoDoPreset(efetivo: PalcoComponentes, palco: unknown): PalcoComponentes {
  if (!palco || typeof palco !== 'object') return efetivo;
  const p = palco as Partial<PalcoComponentes>;
  return {
    ...efetivo,
    ...p,
    cabecalho: { ...efetivo.cabecalho, ...p.cabecalho },
    placa: { ...efetivo.placa, ...p.placa },
    cards: { ...efetivo.cards, ...p.cards },
  };
}

/**
 * O palco do tipo em rascunho dentro de um modal: começa no que vale para o
 * corte (ou o projeto) e só grava ali no "Aplicar" do modal — Cancelar não
 * muda nada. O canal só muda no alvo `canal`.
 */
export function usePalcoDoModal({
  tipo,
  projetoId,
  corteId,
  alvo,
  aberto,
}: {
  tipo: TipoDoPalco;
  projetoId: string | undefined;
  corteId?: string;
  alvo: AlvoDoEstilo;
  aberto: boolean;
}) {
  // D-981: o palco do padrão global é o do canal. O preset aplicado ali grava
  // os cards no canal; antes só a geometria ia para o global e os cards do
  // preset sumiam, com o selo do preset dizendo que ele estava em uso.
  const doCanal = alvo === 'canal' || alvo === 'global';
  const vigente = usePalcoDoEscopo(tipo, doCanal ? undefined : projetoId, alvo === 'corte' ? corteId : undefined).data;
  const doPalcoDoCanal = usePalcoDoCanalAtivo().data;
  const gravar = useGravarPalcoDoEscopo();
  const gravarNoCanal = useGravarNoCanal();
  const [rascunho, setRascunho] = useState<RascunhoDoPalco | null>(null);
  const efetivo = doCanal ? doPalcoDoCanal : vigente?.efetivo;
  // O rascunho nasce ao abrir e não é reescrito pelas releituras: gravar no meio
  // da digitação (o short grava sozinho) não pode devolver o texto de antes.
  useEffect(() => {
    if (!aberto) setRascunho(null);
    else if (efetivo && !rascunho) setRascunho(rascunhoDe(efetivo));
  }, [aberto, efetivo, rascunho]);
  return {
    efetivo,
    rascunho,
    origem: doCanal ? ('canal' as const) : vigente?.origem,
    estilo: rascunho?.estilo ?? (efetivo?.estilo === 'limpo' ? 'limpo' : 'atual'),
    /** O que a prévia desenha (null enquanto carrega). */
    componentes: efetivo && rascunho ? componentesDoRascunho(efetivo, rascunho) : null,
    mudar: setRascunho,
    setEstilo: (estilo: 'atual' | 'limpo') => rascunho && setRascunho({ ...rascunho, estilo }),
    /** O palco que o preset salvo leva junto. */
    paraPreset: () => (rascunho ? edicaoDe(rascunho) : undefined),
    /** Aplica o palco de um preset no rascunho. */
    dePreset: (palco: unknown) => efetivo && setRascunho(rascunhoDe(comPalcoDoPreset(efetivo, palco))),
    /** Grava o palco no corte, no projeto ou no canal (o modal da tela de Canais e o do padrão global). */
    aplicar: (aoTerminar?: () => void) => {
      if (!rascunho) return;
      if (doCanal) return efetivo && gravarNoCanal.gravar(efetivo.canal_id, edicaoDe(rascunho), aoTerminar);
      if (!projetoId) return;
      const corpo = { escopo: alvo, tipo, projeto_id: projetoId, corte_id: corteId ?? null };
      gravar.mutate({ ...corpo, componentes: edicaoDe(rascunho) }, { onSuccess: aoTerminar });
    },
    /** Esquece o que o corte (ou o projeto) ajustou: volta a valer o nível de cima. */
    herdar: () => {
      if (alvo === 'global' || alvo === 'canal' || !projetoId) return;
      gravar.mutate(
        { escopo: alvo, tipo, projeto_id: projetoId, corte_id: corteId ?? null, componentes: null },
        { onSuccess: (resposta) => setRascunho(rascunhoDe(resposta.efetivo)) },
      );
    },
    salvando: gravar.isPending || gravarNoCanal.isPending,
    /** O rascunho difere do que está gravado (há o que salvar). */
    mudou: Boolean(rascunho && efetivo && JSON.stringify(edicaoDe(rascunho)) !== JSON.stringify(edicaoDe(rascunhoDe(efetivo)))),
  };
}

/** Grava o palco do canal; o que cada corte e projeto herda muda junto. */
function useGravarNoCanal() {
  const qc = useQueryClient();
  const gravar = useGravarPalco();
  const gravarNoCanal = (canalId: string, edicao: PalcoComponentesEdicao, aoTerminar?: () => void) =>
    gravar.mutate(
      { canalId, edicao },
      {
        onSuccess: () => {
          void qc.invalidateQueries({ queryKey: ['palco-do-escopo'] });
          aoTerminar?.();
        },
      },
    );
  return { gravar: gravarNoCanal, isPending: gravar.isPending };
}
