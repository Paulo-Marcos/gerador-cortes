import { Pipeline, PIPELINE_STAGE_META, type PipelineStep } from '@/components/ui/pipeline';
import type { Projeto } from '@/types/models';
import { estaProntoPraYoutube } from '@/hooks/useProjetos';

function buildSteps(projeto: Projeto): PipelineStep[] {
  const finalizado = estaProntoPraYoutube(projeto);

  const states = {
    ingestao: {
      done: ['transcrevendo', 'pronto', 'analisando', 'analisado'].includes(projeto.status),
      active: projeto.status === 'baixando',
      hint: 'Baixar video e preparar arquivos',
    },
    analise: {
      done: projeto.status === 'analisado' && projeto.total_cortes > 0,
      active:
        projeto.status === 'analisando' ||
        (projeto.status === 'pronto' && projeto.total_cortes === 0),
      hint: 'IA propoe cortes a partir da transcricao',
    },
    edicao: {
      done: projeto.total_cortes > 0 && projeto.total_aprovados >= projeto.total_cortes,
      active:
        projeto.status === 'analisado' &&
        projeto.total_cortes > 0 &&
        projeto.total_aprovados < projeto.total_cortes,
      hint: 'Revisar e aprovar cortes',
    },
    metadados: {
      done: projeto.total_aprovados > 0 && projeto.total_com_meta >= projeto.total_aprovados,
      active: projeto.total_aprovados > 0 && projeto.total_com_meta < projeto.total_aprovados,
      hint: 'Criar titulos, descricoes e capas',
    },
    publicacao: {
      done: finalizado,
      active:
        projeto.total_aprovados > 0 &&
        projeto.total_video_pronto < projeto.total_aprovados &&
        !finalizado,
      hint: 'Renderizar e publicar',
    },
  };

  return PIPELINE_STAGE_META.map((stage) => {
    const state = states[stage.key];
    return {
      ...stage,
      hint: state.hint,
      state: state.done ? 'done' : state.active ? 'active' : 'todo',
    };
  });
}

export function PipelineProgress({ projeto }: { projeto: Projeto }) {
  return <Pipeline steps={buildSteps(projeto)} compact />;
}
