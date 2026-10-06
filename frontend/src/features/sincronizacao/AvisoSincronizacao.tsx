import { useQuery } from '@tanstack/react-query';
import { sincronizacaoApi } from './api';
import { Icon } from '@/upgrade/Icon';

// D-491: o aviso que teria poupado quatro caçadas a bugs que não existiam.
//
// Backend anterior ao código, `npm install` faltando, coluna que só nasce no
// boot. Em todos, o código certo existia — só não era o que estava no ar. O
// sintoma aparecia na feature; a causa estava no processo, e era invisível.
//
// Fica em `App`, acima dos dois shells (workbench e legado), e não numa tela:
// a dessincronização não é de uma tela só, e quem está numa tela quebrada não
// vai procurar o aviso noutro lugar.
//
// D-879: ocupa o próprio espaço, no topo da coluna que `App` monta, e empurra
// a casca para baixo. Flutuando (`fixed`, z-50) ele cobria os 31 px de cima da
// barra superior: o "Mais" do editor, a busca e o tema não recebiam clique
// justo depois de um pull, quando o aviso aparece.

/** Um minuto: rápido o bastante para pegar um restart, raro o bastante para sumir do radar. */
const INTERVALO_MS = 60_000;

export function AvisoSincronizacao() {
  const { data } = useQuery({
    queryKey: ['sincronizacao'],
    queryFn: sincronizacaoApi.estado,
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
      className="flex flex-none flex-wrap items-center gap-x-3 gap-y-1 border-b border-[var(--wb-warn-ink)] bg-[var(--wb-warn-soft)] px-4 py-1.5 text-[12px] text-[var(--wb-warn-ink)] shadow-sm"
    >
      <Icon name="triangle-alert" className="flex-none" />
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
          <Icon name="refresh-cw" />
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
