import { useEffect, useState } from 'react';
import type { PalcoComponentes, TipoDoPalco } from './api/canais';
import { componentesDoRascunho } from './EdicaoDoPalco';
import { edicaoDe, rascunhoDe, type RascunhoDoPalco } from './PalcoComponentesSection';
import { useGravarPalcoDoEscopo, usePalcoDoEscopo, type AlvoDoEstilo } from './palcoDoEscopo';

// D-923: o palco do tipo (horizontal ou short) em rascunho dentro dos modais
// de posição. Fora de `palcoDoEscopo.tsx` para a rota não carregar o
// formulário do palco junto com a casca.

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
 * muda nada, e o canal nunca muda daqui.
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
  const vigente = usePalcoDoEscopo(tipo, projetoId, alvo === 'corte' ? corteId : undefined).data;
  const gravar = useGravarPalcoDoEscopo();
  const [rascunho, setRascunho] = useState<RascunhoDoPalco | null>(null);
  // O rascunho nasce ao abrir e não é reescrito pelas releituras: gravar no meio
  // da digitação (o short grava sozinho) não pode devolver o texto de antes.
  useEffect(() => {
    if (!aberto) setRascunho(null);
    else if (vigente && !rascunho) setRascunho(rascunhoDe(vigente.efetivo));
  }, [aberto, vigente, rascunho]);
  const efetivo = vigente?.efetivo;
  return {
    efetivo,
    rascunho,
    origem: vigente?.origem,
    estilo: rascunho?.estilo ?? (efetivo?.estilo === 'limpo' ? 'limpo' : 'atual'),
    /** O que a prévia desenha (null enquanto carrega). */
    componentes: efetivo && rascunho ? componentesDoRascunho(efetivo, rascunho) : null,
    mudar: setRascunho,
    setEstilo: (estilo: 'atual' | 'limpo') => rascunho && setRascunho({ ...rascunho, estilo }),
    /** O palco que o preset salvo leva junto. */
    paraPreset: () => (rascunho ? edicaoDe(rascunho) : undefined),
    /** Aplica o palco de um preset no rascunho. */
    dePreset: (palco: unknown) => efetivo && setRascunho(rascunhoDe(comPalcoDoPreset(efetivo, palco))),
    /** Grava o palco no corte ou no projeto do modal (nada no global, que é do canal). */
    aplicar: (aoTerminar?: () => void) => {
      if (!rascunho || alvo === 'global' || !projetoId) return;
      const corpo = { escopo: alvo, tipo, projeto_id: projetoId, corte_id: corteId ?? null };
      gravar.mutate({ ...corpo, componentes: edicaoDe(rascunho) }, { onSuccess: aoTerminar });
    },
    /** Esquece o que o corte (ou o projeto) ajustou: volta a valer o nível de cima. */
    herdar: () => {
      if (alvo === 'global' || !projetoId) return;
      gravar.mutate(
        { escopo: alvo, tipo, projeto_id: projetoId, corte_id: corteId ?? null, componentes: null },
        { onSuccess: (resposta) => setRascunho(rascunhoDe(resposta.efetivo)) },
      );
    },
    salvando: gravar.isPending,
    /** O rascunho difere do que está gravado (há o que salvar). */
    mudou: Boolean(rascunho && efetivo && JSON.stringify(edicaoDe(rascunho)) !== JSON.stringify(edicaoDe(rascunhoDe(efetivo)))),
  };
}
