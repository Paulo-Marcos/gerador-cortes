import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Star } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Tooltip } from '@/components/ui/tooltip';
import { useToast } from '@/components/ui/toaster';
import { votoQualidadeApi, type VotoQualidadeResponse } from '@/lib/votoQualidadeApi';

/**
 * D-372: referência comparativa entre o voto MANUAL do operador (qualidade real
 * da live, dada depois de assistir/cortar) e a nota que o Ranking calculou na
 * época — as duas às vezes divergem.
 */
export function compararVotoComRanking(
  voto: number | null,
  pontuacaoRanking: number,
): { label: string; variant: 'success' | 'warning' | 'default' } | null {
  if (voto === null || pontuacaoRanking <= 0) return null;
  const votoEm100 = voto * 20;
  const diff = votoEm100 - pontuacaoRanking;
  if (diff > 15) return { label: 'Superou a nota do ranking', variant: 'success' };
  if (diff < -15) return { label: 'Ficou abaixo da nota do ranking', variant: 'warning' };
  return { label: 'Bateu com a nota do ranking', variant: 'default' };
}

interface VotoQualidadeLiveProps {
  projetoId: string;
  pontuacaoRanking: number;
}

export function VotoQualidadeLive({ projetoId, pontuacaoRanking }: VotoQualidadeLiveProps) {
  const { notify } = useToast();
  const queryClient = useQueryClient();
  const queryKey = ['voto-qualidade-live', projetoId] as const;

  const query = useQuery({
    queryKey,
    queryFn: () => votoQualidadeApi.obter(projetoId),
  });

  const voto = query.data?.voto_qualidade_live ?? null;
  const comparativo = compararVotoComRanking(voto, pontuacaoRanking);

  function votar(novoVoto: number) {
    queryClient.setQueryData<VotoQualidadeResponse>(queryKey, (atual) =>
      atual ? { ...atual, voto_qualidade_live: novoVoto } : atual,
    );
    votoQualidadeApi.salvar(projetoId, novoVoto).catch((err) => {
      query.refetch();
      notify(err instanceof Error ? err.message : 'Falha ao salvar voto.', { tone: 'error' });
    });
  }

  if (query.isLoading) {
    return <Loader2 size={12} className="animate-spin text-text-400" />;
  }

  return (
    <span className="flex items-center gap-1.5">
      <Tooltip
        label={`Sua nota para a qualidade real da live (ranking deu ${Math.round(pontuacaoRanking)})`}
        side="bottom"
      >
        <span className="flex items-center gap-0.5" data-testid="voto-qualidade-estrelas">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => votar(n)}
              aria-label={`Votar qualidade ${n} de 5`}
              className="text-text-500 transition-colors hover:text-amber-300"
            >
              <Star
                size={13}
                className={n <= (voto ?? 0) ? 'fill-amber-300 text-amber-300' : undefined}
              />
            </button>
          ))}
        </span>
      </Tooltip>
      {comparativo && (
        <Badge variant={comparativo.variant} data-testid="voto-qualidade-comparativo">
          {comparativo.label}
        </Badge>
      )}
    </span>
  );
}
