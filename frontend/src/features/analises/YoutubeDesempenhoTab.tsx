// E-022 / D-313 / D-1176: aba "Desempenho YouTube". Status do último sync + botão de
// sincronizar e os levantamentos duração×retenção e título×desempenho. Nasce
// vazia de forma elegante: sem vídeos, orienta a reautorizar o OAuth e
// sincronizar. Nunca quebra se o backend pedir reautorização.
import { Button } from '@/components/ui/button';
import { EstadoDeErro } from '@/components/ui/estado-de-erro';
import { mensagemErro } from '@/lib/mensagemErro';
import { EstadoVazio } from '@/components/ui/estado-vazio';
import { Selo } from '@/components/ui/selo';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Tabela,
  TabelaCabeca,
  TabelaCelula,
  TabelaCorpo,
  TabelaLinha,
  TabelaTitulo,
} from '@/components/ui/tabela';
import { useToast } from '@/components/ui/toaster';
import type { CSSProperties } from 'react';
import type { LevantamentoDuracao, LevantamentoTitulo } from './api';
import {
  useLevantamentoDuracao,
  useLevantamentoTitulo,
  useSincronizarYoutube,
  useYoutubeStatsStatus,
} from './useAnalises';
import { formatarNumero, formatarPct, formatarSeg } from './analisesFormat';
import { Icon } from '@/upgrade/Icon';
import { AvisoFalhaSync } from './AvisoFalhaSync';

const GRUPO_ROTULO: Record<string, string> = {
  comprimento: 'Comprimento do título',
  dois_pontos: 'Dois-pontos (:)',
  pergunta: 'Pergunta (?)',
  numero: 'Número',
};

/** Barra horizontal proporcional à retenção ponderada (0–100%). */
function RetencaoBar({ pct }: { pct: number }) {
  const largura = Math.max(0, Math.min(100, pct));
  return (
    <div className="flex items-center gap-2.5">
      <div className="h-1.5 w-24 overflow-hidden rounded-full bg-vidro-3">
        <div
          className="h-full w-[var(--largura)] rounded-full bg-iris"
          style={{ '--largura': `${largura}%` } as CSSProperties}
        />
      </div>
      <span className="num text-fg-2">{formatarPct(pct)}</span>
    </div>
  );
}

function Moldura({ children }: { children: React.ReactNode }) {
  return <div className="overflow-x-auto rounded-cartao border border-fio bg-vidro">{children}</div>;
}

function DuracaoTabela({ faixas }: { faixas: LevantamentoDuracao[] }) {
  return (
    <Moldura>
      <Tabela>
        <TabelaCabeca>
          <TabelaLinha>
            <TabelaTitulo>Faixa (min)</TabelaTitulo>
            <TabelaTitulo aDireita>Vídeos</TabelaTitulo>
            <TabelaTitulo aDireita>Views (média)</TabelaTitulo>
            <TabelaTitulo>Retenção ponderada</TabelaTitulo>
            <TabelaTitulo aDireita>Duração média assistida</TabelaTitulo>
          </TabelaLinha>
        </TabelaCabeca>
        <TabelaCorpo>
          {faixas.map((f) => (
            <TabelaLinha key={f.faixa}>
              <TabelaCelula numero>{f.faixa}</TabelaCelula>
              <TabelaCelula numero aDireita>{f.videos}</TabelaCelula>
              <TabelaCelula numero aDireita>{formatarNumero(Math.round(f.views_media))}</TabelaCelula>
              <TabelaCelula>
                <RetencaoBar pct={f.retencao_ponderada_pct} />
              </TabelaCelula>
              <TabelaCelula numero aDireita>{formatarSeg(f.avg_view_duration_media_seg)}</TabelaCelula>
            </TabelaLinha>
          ))}
        </TabelaCorpo>
      </Tabela>
    </Moldura>
  );
}

function TituloTabela({ grupos }: { grupos: LevantamentoTitulo[] }) {
  return (
    <Moldura>
      <Tabela>
        <TabelaCabeca>
          <TabelaLinha>
            <TabelaTitulo>Grupo</TabelaTitulo>
            <TabelaTitulo>Faixa</TabelaTitulo>
            <TabelaTitulo aDireita>Vídeos</TabelaTitulo>
            <TabelaTitulo aDireita>Views (média)</TabelaTitulo>
            <TabelaTitulo>Retenção ponderada</TabelaTitulo>
          </TabelaLinha>
        </TabelaCabeca>
        <TabelaCorpo>
          {grupos.map((g) => (
            <TabelaLinha key={`${g.grupo}-${g.faixa}`}>
              <TabelaCelula className="text-fg-2">{GRUPO_ROTULO[g.grupo] ?? g.grupo}</TabelaCelula>
              <TabelaCelula numero>{g.faixa}</TabelaCelula>
              <TabelaCelula numero aDireita>{g.videos}</TabelaCelula>
              <TabelaCelula numero aDireita>{formatarNumero(Math.round(g.views_media))}</TabelaCelula>
              <TabelaCelula>
                <RetencaoBar pct={g.retencao_ponderada_pct} />
              </TabelaCelula>
            </TabelaLinha>
          ))}
        </TabelaCorpo>
      </Tabela>
    </Moldura>
  );
}

function Secao({ titulo, carregando, children }: { titulo: string; carregando: boolean; children: React.ReactNode }) {
  return (
    <section className="grid gap-2.5">
      <h2 className="text-linha text-fg">{titulo}</h2>
      {carregando ? <div role="status">
          <span className="sr-only">Carregando {titulo.toLowerCase()}…</span>
          <Skeleton className="h-[72px] w-full" />
        </div> : children}
    </section>
  );
}

export function YoutubeDesempenhoTab() {
  const { notify } = useToast();
  const status = useYoutubeStatsStatus();
  const duracao = useLevantamentoDuracao();
  const titulo = useLevantamentoTitulo();
  const sync = useSincronizarYoutube();

  const semDados = (status.data?.total ?? 0) === 0;

  const handleSync = () => {
    sync.mutate(undefined, {
      onSuccess: (resultado) => {
        if (resultado.status === 'erro') {
          notify(resultado.mensagem ?? 'Não foi possível sincronizar.', { tone: 'error' });
        } else {
          notify(resultado.mensagem ?? 'Sincronização iniciada.', { tone: 'success' });
        }
      },
      onError: (error) =>
        notify(error instanceof Error ? error.message : 'Erro ao sincronizar.', {
          tone: 'error',
        }),
    });
  };

  // D-1204: consulta caída não é "ainda não há estatísticas".
  const falhas = [status, duracao, titulo].filter((q) => q.isError && !q.data);
  if (falhas.length > 0) {
    return (
      <EstadoDeErro
        titulo="Não consegui carregar o desempenho do YouTube"
        motivo={mensagemErro(falhas[0].error, 'O backend não respondeu. Tente de novo.')}
        aoTentar={() => falhas.forEach((q) => void q.refetch())}
      />
    );
  }

  return (
    <div className="grid content-start gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-cartao border border-fio bg-vidro px-5 py-3.5">
        <div className="text-corpo text-fg-2">
          {status.isLoading ? (
            <span className="flex items-center gap-2">
              <Icon name="loader-2" className="animate-spin" />
              Carregando status…
            </span>
          ) : status.data ? (
            <span className="flex flex-wrap items-center gap-2">
              {status.data.sincronizado_em ? (
                <>
                  <span>
                    Último sync:{' '}
                    <strong className="font-semibold text-fg">
                      {new Date(status.data.sincronizado_em).toLocaleString('pt-BR')}
                    </strong>
                  </span>
                  {status.data.stale && <Selo tom="convite">desatualizado</Selo>}
                  <span className="text-fg-3">
                    {status.data.total} vídeos · {status.data.com_corte} casados com cortes
                  </span>
                </>
              ) : (
                'Nenhuma sincronização ainda.'
              )}
            </span>
          ) : (
            'Status indisponível.'
          )}
        </div>
        <Button type="button" variant="secundario" carregando={sync.isPending} onClick={handleSync}>
          <Icon name="refresh-cw" size={16} />
          {sync.isPending ? 'Sincronizando…' : 'Sincronizar'}
        </Button>
      </div>

      <AvisoFalhaSync
        falha={status.data?.falha ?? null}
        sincronizadoEm={status.data?.sincronizado_em ?? null}
      />

      {semDados && !status.isLoading ? (
        <EstadoVazio
          icone="bar-chart"
          titulo="Ainda não há estatísticas do YouTube"
          descricao="Reautorize o OAuth, se preciso, e clique em Sincronizar para trazer views e retenção dos vídeos publicados."
        />
      ) : (
        <>
          <Secao titulo="Duração × retenção" carregando={duracao.isLoading}>
            <DuracaoTabela faixas={duracao.data ?? []} />
          </Secao>
          <Secao titulo="Título × desempenho" carregando={titulo.isLoading}>
            <TituloTabela grupos={titulo.data ?? []} />
          </Secao>
        </>
      )}
    </div>
  );
}
