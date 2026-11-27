// E-022 / D-1176 (E-069 H-22; DIRECAO §7.8): Análises na Sala escura. Faixa de quatro KPIs,
// abas e, em cada aba, o resultado. Tela de leitura: nenhum botão primário (PRIMARIOS_POR_TELA).
// O "Exportar CSV de todas as lives" mora no cabeçalho da casca, como secundária.
import { useMemo, useState } from 'react';
import { EstadoDeErro } from '@/components/ui/estado-de-erro';
import { Kpi } from '@/components/ui/kpi';
import { mensagemErro } from '@/lib/mensagemErro';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { analisesApi } from './api';
import { calcularKpis } from './kpisDasAnalises';
import { PropostaFinalTab } from './PropostaFinalTab';
import { YoutubeDesempenhoTab } from './YoutubeDesempenhoTab';
import { LlmCallsTab } from './LlmCallsTab';
import { useYoutubeStatsStatus } from './useAnalises';
import { useLlmCalls } from './useLlmCalls';
import { useDefinirChrome } from '@/upgrade/UpgradeChrome';

type AbaId = 'proposta-final' | 'youtube' | 'llm-calls';

const ABAS: { id: AbaId; rotulo: string }[] = [
  { id: 'proposta-final', rotulo: 'Proposta × Final' },
  { id: 'youtube', rotulo: 'Desempenho YouTube' },
  { id: 'llm-calls', rotulo: 'Chamadas de IA' },
];

/** A faixa do topo: derivada dos dados que as abas já carregam, sem endpoint novo. */
export function FaixaDeKpis() {
  const ytStatus = useYoutubeStatsStatus();
  const llmCalls = useLlmCalls();
  const kpis = useMemo(
    () => calcularKpis(ytStatus.data, llmCalls.data?.chamadas),
    [ytStatus.data, llmCalls.data],
  );

  // D-1204: consulta caída não é "Sem dados": o KPI afirmaria que nada foi sincronizado.
  const falhas = [ytStatus, llmCalls].filter((q) => q.isError && !q.data);
  if (falhas.length > 0) {
    return (
      <EstadoDeErro
        className="flex-none p-6"
        titulo="Não consegui carregar os números das análises"
        motivo={mensagemErro(falhas[0].error, 'O backend não respondeu. Tente de novo.')}
        aoTentar={() => falhas.forEach((q) => void q.refetch())}
      />
    );
  }

  return (
    <section aria-label="Resumo" className="grid gap-3.5 [grid-template-columns:repeat(auto-fit,minmax(220px,1fr))]">
      <Kpi rotulo="Publicados 30d" icone="film" {...kpis.publicados30d} />
      <Kpi rotulo="Retenção média" icone="trending-up" {...kpis.retencaoMedia} />
      <Kpi rotulo="Casados com corte" icone="link-2" {...kpis.casados} />
      <Kpi rotulo="Custo de IA" icone="cpu" {...kpis.custoLlm} />
    </section>
  );
}

export function AnalisesPage() {
  const [aba, setAba] = useState<AbaId>('proposta-final');
  // D-994: a falha da sync do YouTube precisa ser vista sem abrir a aba.
  const syncFalhou = !!useYoutubeStatsStatus().data?.falha;

  useDefinirChrome(
    {
      sub: 'proposta × final, desempenho no YouTube e custo de IA',
      acoes: [
        {
          icone: 'download',
          texto: 'Exportar CSV de todas as lives',
          onClick: () => window.open(analisesApi.telemetriaCortesCsvUrl(), '_blank', 'noopener'),
        },
      ],
    },
    [],
  );

  return (
    <div className="flex h-full min-h-0 flex-col gap-6 overflow-auto px-7 py-6 text-fg">
      <FaixaDeKpis />

      <Tabs value={aba} onValueChange={(v) => setAba(v as AbaId)} className="flex flex-col gap-5">
        <TabsList aria-label="Abas de análise">
          {ABAS.map(({ id, rotulo }) => (
            <TabsTrigger key={id} value={id}>
              {rotulo}
              {id === 'youtube' && syncFalhou && (
                <span
                  role="img"
                  aria-label="sincronização com falha"
                  className="inline-block size-2 rounded-full bg-aviso"
                />
              )}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="proposta-final">
          <PropostaFinalTab />
        </TabsContent>
        <TabsContent value="youtube">
          <YoutubeDesempenhoTab />
        </TabsContent>
        <TabsContent value="llm-calls">
          <LlmCallsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
