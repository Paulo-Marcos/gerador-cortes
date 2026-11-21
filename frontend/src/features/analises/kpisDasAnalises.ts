// D-1176 (E-069 H-22; DIRECAO §7.8) · Os quatro KPIs do topo de Análises, como regra pura.
// Nenhum endpoint novo: tudo sai do que as abas já carregam. A regra que importa: SEM DADO NÃO
// É ZERO. "0 publicados" é uma medida; "o YouTube ainda não foi sincronizado" é falta de dado, e
// o KPI mostra "Sem dados" com o motivo (o `Kpi` exige um dos dois).
import type { YoutubeStatsStatus } from './api';

const TRINTA_DIAS_MS = 30 * 24 * 60 * 60 * 1000;

type Medida = { valor: string | number; unidade?: string; detalhe?: string } | { valor: null; motivo: string };

export interface KpisDasAnalises {
  publicados30d: Medida;
  retencaoMedia: Medida;
  casados: Medida;
  custoLlm: Medida;
}

export interface ChamadaComCusto {
  custo_usd?: number | null;
}

const MOTIVO_SEM_SYNC = 'O YouTube ainda não foi sincronizado. Sincronize na aba Desempenho YouTube.';

const dinheiro = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function calcularKpis(
  status: YoutubeStatsStatus | undefined,
  chamadas: ChamadaComCusto[] | undefined,
  agora: number = Date.now(),
): KpisDasAnalises {
  const videos = status?.videos ?? [];
  const total = status?.total ?? 0;

  const publicados = videos.filter((v) => {
    if (!v.publicado_em) return false;
    const ts = Date.parse(v.publicado_em);
    return !Number.isNaN(ts) && agora - ts <= TRINTA_DIAS_MS;
  }).length;

  const retencoes = videos
    .map((v) => v.average_view_percentage)
    .filter((v): v is number => typeof v === 'number');

  const chamadasLidas = chamadas ?? [];
  const custo = chamadasLidas.reduce((soma, c) => soma + (c.custo_usd ?? 0), 0);

  return {
    publicados30d:
      total > 0
        ? { valor: publicados, detalhe: 'vídeos do canal nos últimos 30 dias' }
        : { valor: null, motivo: MOTIVO_SEM_SYNC },
    retencaoMedia:
      retencoes.length > 0
        ? {
            valor: (retencoes.reduce((s, v) => s + v, 0) / retencoes.length).toFixed(1).replace('.', ','),
            unidade: '%',
            detalhe: 'média dos vídeos sincronizados',
          }
        : { valor: null, motivo: 'Nenhum vídeo sincronizado trouxe a retenção.' },
    casados:
      total > 0
        ? { valor: `${status?.com_corte ?? 0}/${total}`, detalhe: 'vídeos ligados a um corte do app' }
        : { valor: null, motivo: MOTIVO_SEM_SYNC },
    custoLlm:
      chamadasLidas.length > 0
        ? { valor: `US$ ${dinheiro.format(custo)}`, detalhe: `soma das últimas ${chamadasLidas.length} chamadas de IA` }
        : { valor: null, motivo: 'Nenhuma chamada de IA registrada ainda.' },
  };
}
