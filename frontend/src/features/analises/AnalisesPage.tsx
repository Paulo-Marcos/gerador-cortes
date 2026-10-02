// E-022: Área de Análises — uma tela, duas abas. Reúne a telemetria interna
// proposta×final (D-310) e o desempenho no YouTube (D-313). Cada aba nasce vazia
// de forma elegante e nunca quebra na ausência de dados.
import { useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import { PropostaFinalTab } from './PropostaFinalTab';
import { YoutubeDesempenhoTab } from './YoutubeDesempenhoTab';
import { LlmCallsTab } from './LlmCallsTab';
import { useYoutubeStatsStatus } from './useAnalises';
import { useLlmCalls } from './useLlmCalls';
import { useDefinirChrome } from '@/upgrade/UpgradeChrome';
import { Icon } from '@/upgrade/Icon';

type AbaId = 'proposta-final' | 'youtube' | 'llm-calls';

const ABAS: { id: AbaId; rotulo: string }[] = [
  { id: 'proposta-final', rotulo: 'Proposta × Final' },
  { id: 'youtube', rotulo: 'Desempenho YouTube' },
  { id: 'llm-calls', rotulo: 'Chamadas de IA' },
];

const TRINTA_DIAS_MS = 30 * 24 * 60 * 60 * 1000;

/** Stat-cards do topo (DE-PARA §9, [NOVO] composição) — derivados dos
 *  dados que as abas já carregam; nenhum endpoint novo. A API não expõe
 *  CTR, então o card de desempenho usa retenção média (dado real). */
function StatCards() {
  const ytStatus = useYoutubeStatsStatus();
  const llmCalls = useLlmCalls();

  const stats = useMemo(() => {
    const videos = ytStatus.data?.videos ?? [];
    const agora = Date.now();
    const publicados30d = videos.filter((v) => {
      if (!v.publicado_em) return false;
      const ts = Date.parse(v.publicado_em);
      return !Number.isNaN(ts) && agora - ts <= TRINTA_DIAS_MS;
    }).length;

    const retencoes = videos
      .map((v) => v.average_view_percentage)
      .filter((v): v is number => typeof v === 'number');
    const retencaoMedia =
      retencoes.length > 0 ? retencoes.reduce((s, v) => s + v, 0) / retencoes.length : null;

    const total = ytStatus.data?.total ?? 0;
    const comCorte = ytStatus.data?.com_corte ?? 0;

    const custoLlm = (llmCalls.data?.chamadas ?? []).reduce(
      (soma, call) => soma + (call.custo_usd ?? 0),
      0,
    );

    return { publicados30d, retencaoMedia, total, comCorte, custoLlm };
  }, [ytStatus.data, llmCalls.data]);

  return (
    <div className="grid flex-none gap-2.5 [grid-template-columns:repeat(auto-fit,minmax(180px,1fr))]">
      <StatCard
        icon={<Icon name="film" />}
        label="Publicados 30d"
        value={String(stats.publicados30d)}
        hint="Vídeos do canal publicados nos últimos 30 dias (sync YouTube)"
      />
      <StatCard
        icon={<Icon name="trending-up" />}
        label="Retenção média"
        value={stats.retencaoMedia != null ? `${stats.retencaoMedia.toFixed(1)}%` : '—'}
        hint="Média de average_view_percentage dos vídeos sincronizados"
      />
      <StatCard
        icon={<Icon name="link-2" />}
        label="Casados c/ corte"
        value={stats.total > 0 ? `${stats.comCorte}/${stats.total}` : '—'}
        hint="Vídeos do YouTube vinculados a um corte do app"
      />
      <StatCard
        icon={<Icon name="cpu" />}
        label="Custo LLM (últimas 100)"
        value={`$${stats.custoLlm.toFixed(2)}`}
        hint="Soma de custo_usd das chamadas de IA mais recentes"
      />
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  hint,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div
      title={hint}
      className="rounded-[var(--radius)] border border-[var(--wb-border-soft)] bg-[var(--wb-bg-panel)] px-3 py-2.5"
    >
      <div className="flex items-center gap-1.5 text-[var(--wb-text-dim)]">
        {icon}
        <span className="font-code text-[9px] font-extrabold uppercase tracking-[0.12em]">
          {label}
        </span>
      </div>
      <div className="mt-1 font-editorial text-[26px] font-medium leading-none text-[var(--wb-text)]">
        {value}
      </div>
    </div>
  );
}

export function AnalisesPage() {
  const [aba, setAba] = useState<AbaId>('proposta-final');

  // D-599: o titulo e o subtitulo passam para a casca; a faixa de STATS e
  // as abas continuam aqui, que e onde o design as coloca — logo abaixo do
  // cabecalho, dentro do conteudo.
  useDefinirChrome({ sub: 'proposta × final, desempenho no YouTube e custo de IA' }, []);

  return (
    <div
      className={cn(
        'flex min-h-0 flex-col overflow-hidden text-[var(--wb-text)]',
        'h-full',
        'h-full',
      )}
    >
      <header
        className={cn(
          'border-b border-[var(--wb-border-soft)] bg-[var(--wb-bg)]',
          'px-7 pt-5',
        )}
      >
        <StatCards />

        <nav className="mt-4 flex gap-1" aria-label="Abas de análise">
          {ABAS.map(({ id, rotulo }) => (
            <button
              key={id}
              type="button"
              onClick={() => setAba(id)}
              aria-current={aba === id ? 'page' : undefined}
              className={cn(
                'relative -mb-px border-b-2 px-4 py-2.5 text-[14px] font-medium transition-colors',
                aba === id
                  ? 'border-[var(--wb-accent)] text-[var(--wb-text)]'
                  : 'border-transparent text-[var(--wb-text-mute)] hover:text-[var(--wb-text)]',
              )}
            >
              {rotulo}
            </button>
          ))}
        </nav>
      </header>

      <main className="flex-1 overflow-auto p-6">
        {aba === 'proposta-final' && <PropostaFinalTab />}
        {aba === 'youtube' && <YoutubeDesempenhoTab />}
        {aba === 'llm-calls' && <LlmCallsTab />}
      </main>
    </div>
  );
}
