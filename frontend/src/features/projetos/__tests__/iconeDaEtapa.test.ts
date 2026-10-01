import { describe, expect, it } from 'vitest';
import type { Projeto } from '@/types/models';
import { construirEtapas } from '../PipelineProgress';
import { ICONE_ETAPA } from '../ProjetoCardAp';

// D-851: a fita do card acha o ícone pelo rótulo da etapa. Uma chave que
// não casa com o rótulo não quebra nada visível de imediato — a etapa só
// cai no ícone genérico —, por isso o acordo entre os dois lados se prova aqui.
describe('ICONE_ETAPA', () => {
  it('tem uma chave para cada rótulo de construirEtapas, e só elas', () => {
    const rotulos = construirEtapas({
      status: 'analisado',
      total_cortes: 0,
      total_aprovados: 0,
      total_publicados: 0,
      total_com_meta: 0,
      total_video_pronto: 0,
    } as Projeto).map((e) => e.label);

    expect(Object.keys(ICONE_ETAPA)).toEqual(rotulos);
  });
});
