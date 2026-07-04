import { useCallback, useEffect, useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { corteKey } from '@/hooks/useEditor';
import { useToast } from '@/components/ui/toaster';
import type { Corte, DecisaoSegmentoDetectado, SegmentoDetectado } from '@/types/models';

// F-054: hook único para o painel de YT layout. Expõe:
//  - segmentos: lista atual (vinda do corte no cache).
//  - detectando: true enquanto o POST inicial não respondeu.
//  - detectar(): dispara o scan manual (auto-trigger já roda no fim do bruto).
//  - decidir(idx, decisao): rejeita/aceita um segmento e atualiza o cache.
//
// Não polla. O re-fetch acontece naturalmente:
//   - quando o usuário troca de aba/janela (React Query staleTime),
//   - ou quando outra mutação invalida a query do corte.
// Como o scan termina em segundos para cortes curtos, isso basta no uso real.
export function useSegmentosDetectados(corteId: string, projetoId: string) {
  const qc = useQueryClient();
  const { notify } = useToast();

  // D-229: guarda o id do setTimeout do re-fetch para cancelá-lo no unmount —
  // sem isso a invalidação disparava depois do editor sair de tela (fantasma).
  const refetchTimeoutRef = useRef<number | null>(null);
  useEffect(() => {
    return () => {
      if (refetchTimeoutRef.current !== null) {
        window.clearTimeout(refetchTimeoutRef.current);
      }
    };
  }, []);

  const detectarMutation = useMutation({
    mutationFn: () => api.detectarSegmentos(corteId),
    onSuccess: () => {
      notify('Detecção de segmentos iniciada.', { tone: 'info' });
      // Re-fetch após delay curto: backend é fire-and-forget, mas pra cortes
      // curtos o scan já pode ter terminado em ~5s. Sem polling agressivo.
      if (refetchTimeoutRef.current !== null) {
        window.clearTimeout(refetchTimeoutRef.current);
      }
      refetchTimeoutRef.current = window.setTimeout(() => {
        refetchTimeoutRef.current = null;
        void qc.invalidateQueries({ queryKey: corteKey(corteId) });
      }, 8000);
    },
    onError: (error) => {
      notify(error instanceof Error ? error.message : 'Erro ao detectar segmentos.', {
        tone: 'error',
      });
    },
  });

  const decidirMutation = useMutation({
    mutationFn: ({ indice, decisao }: { indice: number; decisao: DecisaoSegmentoDetectado }) =>
      api.decidirSegmentoDetectado(corteId, indice, decisao),
    onSuccess: (updated) => {
      qc.setQueryData<Corte>(corteKey(corteId), (current) =>
        current ? ({ ...current, ...updated } as Corte) : updated,
      );
      // Layout pode ter recebido nova região — invalida a query do projeto
      // se algum outro consumidor depender disso.
      void qc.invalidateQueries({ queryKey: ['projeto', projetoId] });
    },
    onError: (error) => {
      notify(error instanceof Error ? error.message : 'Erro ao decidir segmento.', {
        tone: 'error',
      });
    },
  });

  const segmentos: SegmentoDetectado[] = (qc.getQueryData<Corte>(corteKey(corteId))
    ?.segmentos_detectados ?? []) as SegmentoDetectado[];

  const detectar = useCallback(() => {
    if (detectarMutation.isPending) return;
    detectarMutation.mutate();
  }, [detectarMutation]);

  const decidir = useCallback(
    (indice: number, decisao: DecisaoSegmentoDetectado) => {
      decidirMutation.mutate({ indice, decisao });
    },
    [decidirMutation],
  );

  return {
    segmentos,
    detectar,
    decidir,
    detectando: detectarMutation.isPending,
    decidindo: decidirMutation.isPending,
  };
}
