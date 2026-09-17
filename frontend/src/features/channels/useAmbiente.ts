// D-627: pré-requisitos da máquina (GET /sincronizacao/ambiente). Hook próprio
// para o cartão continuar "burro": ele só recebe o retrato pronto.
import { useQuery } from '@tanstack/react-query';
import { API_BASE } from '@/lib/apiBase';

export type EstadoItem = 'ok' | 'aviso' | 'erro';

export interface ItemAmbiente {
  id: string;
  nome: string;
  obrigatorio: boolean;
  estado: EstadoItem;
  detalhe: string;
  /** Vazio quando o item está ok. */
  como_resolver: string;
}

export interface Ambiente {
  /** Falso se algum obrigatório falta. Veredito do backend, não da tela. */
  pronto: boolean;
  itens: ItemAmbiente[];
}

export function useAmbiente() {
  return useQuery<Ambiente>({
    queryKey: ['ambiente'],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/sincronizacao/ambiente`);
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      return res.json();
    },
    // A máquina não muda com a tela aberta; quem instalou algo clica em "Checar de novo".
    staleTime: Infinity,
    retry: false,
  });
}
