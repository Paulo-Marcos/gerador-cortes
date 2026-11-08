import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { useToast } from '@/components/ui/toaster';
import { invalidaCorte } from '@/features/editor/useCortes';
import { geracaoIaApi } from '@/features/ia';
import { mensagemErro } from '@/lib/mensagemErro';
import { ErroDaApi } from '@/shared/api';
import { exportStatusKey, todasAsRodadasDasCenasKey } from '@/shared/chavesDeCache';
import { filaGlobalApi } from '@/shared/filaGlobal/api';
import type { CenaRemotion } from '@/types/models';
import { cenasApi } from '../api/cenas';
import { aceiteDa, ajusteDaCenaKey, jobDoAjuste, type IdentidadeDaCena, type PropostaDeAjuste } from './regrasDoAjuste';

/** O `detail` do servidor é a frase que o operador lê; o status HTTP é ruído (D-1065). */
const motivo = (erro: unknown, padrao: string) => (erro instanceof ErroDaApi ? erro.detalhe : mensagemErro(erro, padrao));

/**
 * O ajuste de uma cena do corte (D-1074, RN-40): um por corte, como no servidor, e nunca junto
 * da geração do plano (o "Gerar cenas" trava enquanto a IA ajusta). O pedido,
 * a proposta que volta, e o Aceitar, o Descartar e o Cancelar. A proposta fica só na tela
 * até o Aceitar: descartar é esquecê-la.
 *
 * Aceitar grava só aquela cena; o servidor recusa se o plano mudou desde o pedido. Dando
 * certo ou não, o plano recarrega: a lista, a marca de validadas e as rodadas seguem o banco.
 */
export function useAjusteDaCena(corteId: string, projetoId: string) {
  const qc = useQueryClient();
  const { notify } = useToast();
  const [proposta, setProposta] = useState<PropostaDeAjuste | null>(null);
  const cancelou = useRef(false);

  const pedir = useMutation({
    mutationKey: ajusteDaCenaKey(corteId),
    mutationFn: ({ cena, pedido }: { cena: CenaRemotion; pedido: string }) =>
      geracaoIaApi.ajustarCena(corteId, { tipo: cena.tipo, inicio: cena.inicio, pedido }),
    onMutate: () => {
      cancelou.current = false;
      setProposta(null);
    },
    onSuccess: (nova: PropostaDeAjuste) => setProposta(nova),
    onError: (erro: unknown) =>
      notify(motivo(erro, 'Não foi possível pedir o ajuste.'), { tone: cancelou.current ? 'info' : 'error' }),
  });

  const cancelar = useMutation({
    mutationFn: () => filaGlobalApi.cancelarJob(jobDoAjuste(corteId)),
    onMutate: () => {
      cancelou.current = true;
    },
    onError: (erro: unknown) => notify(motivo(erro, 'Não foi possível cancelar o ajuste.'), { tone: 'error' }),
  });

  const aceitar = useMutation({
    mutationFn: (aceita: PropostaDeAjuste) => cenasApi.aceitarAjuste(corteId, aceiteDa(aceita)),
    onSuccess: () => notify('Cena ajustada. Valide o plano de novo.', { tone: 'success' }),
    onError: (erro: unknown) => notify(motivo(erro, 'Não foi possível aceitar o ajuste.'), { tone: 'error' }),
    onSettled: () => {
      setProposta(null);
      qc.invalidateQueries({ queryKey: todasAsRodadasDasCenasKey(corteId) });
      invalidaCorte(qc, corteId, projetoId);
      qc.invalidateQueries({ queryKey: exportStatusKey(projetoId), refetchType: 'all' });
    },
  });

  // A cena do ajuste: a do pedido enquanto a IA trabalha, depois a da proposta.
  const alvo: IdentidadeDaCena | null = pedir.isPending
    ? (pedir.variables?.cena ?? null)
    : proposta && { tipo: String(proposta.antes.tipo), inicio: Number(proposta.antes.inicio) };

  return {
    alvo,
    proposta,
    pedindo: pedir.isPending,
    cancelando: cancelar.isPending,
    aceitando: aceitar.isPending,
    pedir: (cena: CenaRemotion, pedido: string) => pedir.mutate({ cena, pedido: pedido.trim() }),
    cancelar: () => cancelar.mutate(),
    aceitar: () => {
      if (proposta) aceitar.mutate(proposta);
    },
    descartar: () => setProposta(null),
  };
}

export type AjusteDoCorte = ReturnType<typeof useAjusteDaCena>;
