import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type AlvoDoBoletim, boletimTecnicoApi } from './boletimTecnico';

// D-1015: o boletim é medido em segundo plano — enquanto o estado for "medindo"
// a tela pergunta de novo a cada poucos segundos; fora disso, não pergunta mais.
const INTERVALO_ENQUANTO_MEDE_MS = 4000;

export const boletimKey = (alvo: AlvoDoBoletim) => ['boletim-tecnico', alvo.tipo, alvo.id] as const;

export function useBoletimTecnico(alvo: AlvoDoBoletim | null) {
  return useQuery({
    queryKey: boletimKey(alvo ?? { tipo: 'corte', id: '' }),
    queryFn: () => boletimTecnicoApi.obter(alvo as AlvoDoBoletim),
    enabled: Boolean(alvo?.id),
    refetchInterval: (consulta) =>
      consulta.state.data?.estado === 'medindo' ? INTERVALO_ENQUANTO_MEDE_MS : false,
  });
}

export function useRemedirBoletim(alvo: AlvoDoBoletim) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => boletimTecnicoApi.remedir(alvo),
    onSuccess: (boletim) => qc.setQueryData(boletimKey(alvo), boletim),
  });
}
