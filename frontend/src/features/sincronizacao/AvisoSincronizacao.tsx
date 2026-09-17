import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { API_BASE } from '@/lib/apiBase';

// D-491: o aviso que teria poupado quatro caçadas a bugs que não existiam.
//
// Backend anterior ao código, `npm install` faltando, coluna que só nasce no
// boot. Em todos, o código certo existia — só não era o que estava no ar. O
// sintoma aparecia na feature; a causa estava no processo, e era invisível.
//
// Fica em `App`, acima dos dois shells (workbench e legado), e não numa tela:
// a dessincronização não é de uma tela só, e quem está numa tela quebrada não
// vai procurar o aviso noutro lugar. Flutua sobre o topo para não precisar
// mexer no layout de nenhum shell — o do workbench está travado.


interface Estado {
  commit_rodando: string;
  commit_disco: string;
  backend_velho: boolean;
  colunas_pendentes: string[];
  dependencias_faltando: string[];
  canal_em_uso: string;
  canal_escolhido: string;
  troca_de_canal_pendente: boolean;
  em_dia: boolean;
}

/** Um minuto: rápido o bastante para pegar um restart, raro o bastante para sumir do radar. */
const INTERVALO_MS = 60_000;

export function AvisoSincronizacao() {
  const { data } = useQuery<Estado>({
    queryKey: ['sincronizacao'],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/sincronizacao`);
      if (!res.ok) throw new Error(String(res.status));
      return res.json();
    },
    refetchInterval: INTERVALO_MS,
    refetchOnWindowFocus: true,
    // Backend fora do ar é outro problema, com outro sintoma (a tela toda
    // falha). Não é trabalho deste aviso, e insistir encheria o console.
    retry: false,
  });

  if (!data || data.em_dia) return null;

  return (
    <div
      role="status"
      className="fixed inset-x-0 top-0 z-50 flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-[var(--wb-warn-ink)] bg-[var(--wb-warn-soft)] px-4 py-1.5 text-[12px] text-[var(--wb-warn-ink)] shadow-sm"
    >
      <AlertTriangle size={13} className="flex-none" aria-hidden />
      <span className="font-bold">Fora de sincronia.</span>
      {data.troca_de_canal_pendente && (
        <span>
          canal <code className="font-code">{data.canal_escolhido}</code> escolhido, mas o app ainda
          usa <code className="font-code">{data.canal_em_uso}</code> — feche e abra o app antes de
          processar qualquer coisa
        </span>
      )}
      {data.backend_velho && (
        <span className="inline-flex items-center gap-1">
          <RefreshCw size={11} aria-hidden />
          backend rodando <code className="font-code">{data.commit_rodando}</code>, disco em{' '}
          <code className="font-code">{data.commit_disco}</code> — reinicie
        </span>
      )}
      {data.dependencias_faltando.length > 0 && (
        <span title={data.dependencias_faltando.join(', ')}>
          falta <code className="font-code">npm install</code> (
          {data.dependencias_faltando.length}{' '}
          {data.dependencias_faltando.length === 1 ? 'pacote' : 'pacotes'})
        </span>
      )}
      {data.colunas_pendentes.length > 0 && (
        <span title={data.colunas_pendentes.join(', ')}>
          {data.colunas_pendentes.length} coluna(s) do modelo ainda não no banco — reinicie o
          backend
        </span>
      )}
    </div>
  );
}
