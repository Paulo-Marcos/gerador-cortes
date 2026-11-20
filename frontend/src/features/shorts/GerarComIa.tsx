// D-803: o mesmo trabalho que o fim do bruto faz sozinho, agora no clique.
//
// Existe porque o automático só roda quando o bruto termina: o Fire marcado
// depois, o indicado à mão e a proposta que falhou ficavam sem short e sem
// caminho. Sem bruto, ele é refeito antes sem refazer a transcrição da live nem
// as cenas (D-160); a salvaguarda de silêncios ainda ressincroniza a
// transcrição do corte. Nada do que já está na fila é apagado (RN-41).
//
// D-1168: saiu da `ShortsPage` para a linha do Fire poder oferecer o mesmo gesto no "⋯"
// sem copiar a mutação. O botão é secundário e pequeno (DIRECAO §7.6: sem primária).
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Icon, ICONE_DO_CONCEITO } from '@/upgrade/Icon';
import { aoGerarShortsDoFire } from './aposGerarShorts';
import { motivoDoErro, shortsApi, type FireComBruto } from './shortsApi';

/** D-495: sem bruto e sem a live em disco não há de onde recortar; o caminho é o botão da live. */
export function semDeOndeRecortar(fire: FireComBruto): boolean {
  return !fire.tem_bruto && !fire.live_em_disco;
}

export function useGerarShortsDoFire(fire: FireComBruto) {
  const queryClient = useQueryClient();
  const [aviso, setAviso] = useState('');

  const gerar = useMutation({
    mutationFn: () => shortsApi.gerarManualmente(fire.corte_id),
    onSuccess: (r) => {
      const repetidos = r.descartes.length ? ` · ${r.descartes.length} descartado(s)` : '';
      setAviso(
        r.bruto_regerado && r.shorts.length === 0
          ? 'Bruto refeito; a IA propôs os trechos junto com ele.'
          : `${r.shorts.length} candidato(s) novo(s)${repetidos}`,
      );
      void aoGerarShortsDoFire(queryClient, fire.corte_id);
    },
    onError: (e) => setAviso(motivoDoErro(e, 'Não consegui gerar os shorts.')),
  });

  return { gerar, aviso };
}

export function dicaDeGerar(fire: FireComBruto): string {
  return fire.tem_bruto
    ? 'A IA propõe trechos novos. Nada da fila é apagado; trecho repetido fica de fora.'
    : 'Refaz o bruto a partir da live (sem refazer as cenas nem a transcrição da live; a do corte se ajusta aos silêncios) e a IA propõe os trechos.';
}

export function rotuloDeGerar(fire: FireComBruto): string {
  return fire.tem_bruto ? 'Gerar shorts com IA' : 'Gerar bruto e shorts com IA';
}

export function GerarComIa({ fire, liveRodando }: { fire: FireComBruto; liveRodando: boolean }) {
  const { gerar, aviso } = useGerarShortsDoFire(fire);

  if (semDeOndeRecortar(fire)) {
    return (
      <p className="text-micro text-aviso">
        Sem bruto e com a live limpa: use “Baixar a live e gerar” no topo do grupo.
      </p>
    );
  }

  return (
    <div className="grid gap-1">
      <Button
        variant="secundario"
        size="pq"
        disabled={liveRodando}
        carregando={gerar.isPending}
        onClick={() => gerar.mutate()}
        title={dicaDeGerar(fire)}
      >
        {gerar.isPending ? null : <Icon name={ICONE_DO_CONCEITO.iaGera} />}
        {gerar.isPending ? 'A IA está propondo…' : rotuloDeGerar(fire)}
      </Button>
      {aviso && <p className="text-micro text-fg-3">{aviso}</p>}
    </div>
  );
}
