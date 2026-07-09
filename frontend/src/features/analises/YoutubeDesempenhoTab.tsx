// E-022 / D-313: aba "Desempenho YouTube". Status do último sync + botão de
// sincronizar e os levantamentos duração×retenção e título×desempenho. Nasce
// vazia de forma elegante: sem vídeos, orienta a reautorizar o OAuth e
// sincronizar. Nunca quebra se o backend pedir reautorização.
import { AlertTriangle, Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toaster';
import type { LevantamentoDuracao, LevantamentoTitulo } from '@/lib/api';
import {
  useLevantamentoDuracao,
  useLevantamentoTitulo,
  useSincronizarYoutube,
  useYoutubeStatsStatus,
} from './useAnalises';
import { formatarNumero, formatarPct, formatarSeg } from './analisesFormat';

const GRUPO_ROTULO: Record<string, string> = {
  comprimento: 'Comprimento do título',
  dois_pontos: 'Dois-pontos (:)',
  pergunta: 'Pergunta (?)',
  numero: 'Número',
};

/** Barra horizontal simples proporcional à retenção ponderada (0–100%). */
function RetencaoBar({ pct }: { pct: number }) {
  const largura = Math.max(0, Math.min(100, pct));
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 w-24 overflow-hidden rounded-full bg-[var(--wb-bg-inset)]">
        <div
          className="h-full rounded-full bg-[var(--wb-accent)]"
          style={{ width: `${largura}%` }}
        />
      </div>
      <span className="font-code text-[12px] text-[var(--wb-text-mute)]">{formatarPct(pct)}</span>
    </div>
  );
}

function DuracaoTabela({ faixas }: { faixas: LevantamentoDuracao[] }) {
  return (
    <div className="overflow-x-auto rounded-[var(--radius)] border border-[var(--wb-border-soft)]">
      <table className="w-full border-collapse text-left">
        <thead>
          <tr className="bg-[var(--wb-bg-inset)] font-code text-[10px] uppercase tracking-[0.08em] text-[var(--wb-text-dim)]">
            <th className="px-3 py-2 font-medium">Faixa (min)</th>
            <th className="px-3 py-2 font-medium">Vídeos</th>
            <th className="px-3 py-2 font-medium">Views (média)</th>
            <th className="px-3 py-2 font-medium">Retenção ponderada</th>
            <th className="px-3 py-2 font-medium">Duração média assistida</th>
          </tr>
        </thead>
        <tbody>
          {faixas.map((f) => (
            <tr key={f.faixa} className="border-t border-[var(--wb-border-soft)]">
              <td className="px-3 py-2.5 font-code text-[13px] text-[var(--wb-text)]">{f.faixa}</td>
              <td className="px-3 py-2.5 text-[13px] text-[var(--wb-text-mute)]">{f.videos}</td>
              <td className="px-3 py-2.5 text-[13px] text-[var(--wb-text-mute)]">
                {formatarNumero(Math.round(f.views_media))}
              </td>
              <td className="px-3 py-2.5">
                <RetencaoBar pct={f.retencao_ponderada_pct} />
              </td>
              <td className="px-3 py-2.5 font-code text-[13px] text-[var(--wb-text-mute)]">
                {formatarSeg(f.avg_view_duration_media_seg)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TituloTabela({ grupos }: { grupos: LevantamentoTitulo[] }) {
  return (
    <div className="overflow-x-auto rounded-[var(--radius)] border border-[var(--wb-border-soft)]">
      <table className="w-full border-collapse text-left">
        <thead>
          <tr className="bg-[var(--wb-bg-inset)] font-code text-[10px] uppercase tracking-[0.08em] text-[var(--wb-text-dim)]">
            <th className="px-3 py-2 font-medium">Grupo</th>
            <th className="px-3 py-2 font-medium">Faixa</th>
            <th className="px-3 py-2 font-medium">Vídeos</th>
            <th className="px-3 py-2 font-medium">Views (média)</th>
            <th className="px-3 py-2 font-medium">Retenção ponderada</th>
          </tr>
        </thead>
        <tbody>
          {grupos.map((g) => (
            <tr key={`${g.grupo}-${g.faixa}`} className="border-t border-[var(--wb-border-soft)]">
              <td className="px-3 py-2.5 text-[13px] text-[var(--wb-text-mute)]">
                {GRUPO_ROTULO[g.grupo] ?? g.grupo}
              </td>
              <td className="px-3 py-2.5 font-code text-[13px] text-[var(--wb-text)]">{g.faixa}</td>
              <td className="px-3 py-2.5 text-[13px] text-[var(--wb-text-mute)]">{g.videos}</td>
              <td className="px-3 py-2.5 text-[13px] text-[var(--wb-text-mute)]">
                {formatarNumero(Math.round(g.views_media))}
              </td>
              <td className="px-3 py-2.5">
                <RetencaoBar pct={g.retencao_ponderada_pct} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function YoutubeDesempenhoTab() {
  const { notify } = useToast();
  const status = useYoutubeStatsStatus();
  const duracao = useLevantamentoDuracao();
  const titulo = useLevantamentoTitulo();
  const sync = useSincronizarYoutube();

  const precisaReautorizar =
    sync.data?.status === 'erro' && sync.data.precisa_reautorizar === true;
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

  return (
    <div className="grid content-start gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius)] border border-[var(--wb-border-soft)] bg-[var(--wb-bg-card)] px-4 py-3">
        <div className="text-[13px] text-[var(--wb-text-mute)]">
          {status.isLoading ? (
            <span className="flex items-center gap-2">
              <Loader2 className="animate-spin" size={14} aria-hidden />
              Carregando status…
            </span>
          ) : status.data ? (
            <span>
              {status.data.sincronizado_em ? (
                <>
                  Último sync:{' '}
                  <strong className="text-[var(--wb-text)]">
                    {new Date(status.data.sincronizado_em).toLocaleString('pt-BR')}
                  </strong>
                  {status.data.stale && (
                    <span className="ml-2 rounded-full bg-[var(--wb-bg-inset)] px-2 py-0.5 font-code text-[10px] uppercase tracking-[0.06em] text-[var(--wb-warn)]">
                      desatualizado
                    </span>
                  )}
                  <span className="ml-2 text-[var(--wb-text-dim)]">
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
        <Button type="button" onClick={handleSync} disabled={sync.isPending}>
          {sync.isPending ? (
            <Loader2 className="animate-spin" size={16} aria-hidden />
          ) : (
            <RefreshCw size={16} aria-hidden />
          )}
          Sincronizar
        </Button>
      </div>

      {precisaReautorizar && (
        <div className="flex items-start gap-3 rounded-[var(--radius)] border border-[var(--wb-warn)]/40 bg-[var(--wb-bg-card)] p-4">
          <AlertTriangle size={18} className="mt-0.5 shrink-0 text-[var(--wb-warn)]" aria-hidden />
          <div className="text-[14px] text-[var(--wb-text-mute)]">
            <p className="font-medium text-[var(--wb-text)]">Reautorização necessária</p>
            <p className="mt-1">
              {sync.data?.mensagem ??
                'Falta o escopo de YouTube Analytics no token OAuth. Reautorize em Configurações → Canais e sincronize novamente.'}
            </p>
          </div>
        </div>
      )}

      {semDados && !status.isLoading ? (
        <div className="rounded-[var(--radius)] border border-dashed border-[var(--wb-border)] bg-[var(--wb-bg-card)] p-8 text-center">
          <p className="text-[15px] text-[var(--wb-text-mute)]">
            Ainda não há estatísticas do YouTube.
          </p>
          <p className="mt-1.5 text-[13px] text-[var(--wb-text-dim)]">
            <strong>Reautorize o OAuth</strong> (se preciso) e clique em <strong>Sincronizar</strong>{' '}
            para trazer views e retenção dos vídeos publicados.
          </p>
        </div>
      ) : (
        <>
          <section className="grid gap-2.5">
            <h2 className="font-code text-[11px] uppercase tracking-[0.1em] text-[var(--wb-text-dim)]">
              Duração × retenção
            </h2>
            {duracao.isLoading ? (
              <p className="text-[14px] text-[var(--wb-text-mute)]">Carregando…</p>
            ) : (
              <DuracaoTabela faixas={duracao.data ?? []} />
            )}
          </section>

          <section className="grid gap-2.5">
            <h2 className="font-code text-[11px] uppercase tracking-[0.1em] text-[var(--wb-text-dim)]">
              Título × desempenho
            </h2>
            {titulo.isLoading ? (
              <p className="text-[14px] text-[var(--wb-text-mute)]">Carregando…</p>
            ) : (
              <TituloTabela grupos={titulo.data ?? []} />
            )}
          </section>
        </>
      )}
    </div>
  );
}
