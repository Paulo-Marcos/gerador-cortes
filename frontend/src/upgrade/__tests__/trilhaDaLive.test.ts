import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { StatusCorte } from '@/types/models';
import {
  dadosDaLive,
  dentroDeUmaLive,
  filtroNoArLigado,
  trilhaDaLive,
  type DadosDaLive,
} from '../trilhaDaLive';

// D-866: a trilha única da live. Cada `it` é um item do pedido (Onda 3,
// nota 1, e as decisões do Paulo de 03/10).

type Exportado = DadosDaLive['exportados'][number];

function corte(id: string, status: StatusCorte) {
  return { id, status };
}

function exportado(corte_id: string, campos: Partial<Exportado> = {}): Exportado {
  return {
    corte_id,
    titulo_youtube: null,
    thumbnail_pronta: false,
    video_pronto: false,
    metadados_completos: false,
    pronto_publicar: false,
    youtube_url_publicado: '',
    ...campos,
  };
}

/** Live analisada: 4 cortes — 2 aprovados (um já processado), 1 proposto, 1 rejeitado. */
const LIVE: DadosDaLive = {
  statusDoProjeto: 'analisado',
  arquivosLimpos: false,
  cortes: [
    corte('a', 'aprovado'),
    corte('b', 'processado'),
    corte('c', 'proposto'),
    corte('d', 'rejeitado'),
  ],
  exportados: [
    exportado('a', { video_pronto: true, metadados_completos: true, pronto_publicar: true }),
    exportado('b', { video_pronto: true }),
    // O proposto não conta em etapa nenhuma depois de Cortes.
    exportado('c', { video_pronto: true, metadados_completos: true, pronto_publicar: true }),
  ],
};

const porId = (etapas: ReturnType<typeof trilhaDaLive>) =>
  Object.fromEntries(etapas.map((e) => [e.id, e]));

describe('trilhaDaLive', () => {
  it('são sete etapas, na ordem do trabalho', () => {
    expect(trilhaDaLive('projeto', '267', null, LIVE).map((e) => e.texto)).toEqual([
      'Baixado',
      'Analisado',
      'Cortes',
      'Pós',
      'Metadados',
      'Revisão',
      'Publicado',
    ]);
  });

  it('conta Pós, Metadados, Revisão e Publicado sobre os aprovados (processado também é aprovado)', () => {
    const e = porId(trilhaDaLive('projeto', '267', null, LIVE));
    expect(e.cortes.contagem).toBe('2 de 3');
    expect(e.pos.contagem).toBe('2 de 2');
    expect(e.metadados.contagem).toBe('1 de 2');
    expect(e.publicado.contagem).toBe('0 de 2');
    expect(e.analisado.contagem).toBe('4 propostos');
    expect(e.baixado.contagem).toBe('ok');
  });

  it('Revisão feita = todos os aprovados prontos para publicar, contada como "N de M prontos"', () => {
    const meio = porId(trilhaDaLive('projeto', '267', null, LIVE));
    expect(meio.revisao.contagem).toBe('1 de 2 prontos');
    expect(meio.revisao.feita).toBe(false);

    const tudoPronto: DadosDaLive = {
      ...LIVE,
      exportados: [exportado('a', { pronto_publicar: true }), exportado('b', { pronto_publicar: true })],
    };
    const fim = porId(trilhaDaLive('projeto', '267', null, tudoPronto));
    expect(fim.revisao.contagem).toBe('2 de 2 prontos');
    expect(fim.revisao.feita).toBe(true);
  });

  it('corte no ar já passou por Pós, Metadados e Revisão — mesmo com a mídia limpa', () => {
    // Medido no DEV (03/10): live com os 9 cortes no ar mostrava Pós "0 de 9",
    // porque a limpeza (D-598) apaga o vídeo de quem subiu e video_pronto volta
    // a falso. A trilha conta progresso, e progresso não anda para trás.
    const limpa: DadosDaLive = {
      ...LIVE,
      cortes: [corte('a', 'aprovado'), corte('b', 'processado')],
      exportados: [
        exportado('a', { youtube_url_publicado: 'https://youtu.be/a' }),
        exportado('b', { youtube_url_publicado: 'https://youtu.be/b' }),
      ],
    };
    const e = porId(trilhaDaLive('projeto', '267', null, limpa));
    expect([e.pos.contagem, e.metadados.contagem, e.revisao.contagem]).toEqual([
      '2 de 2',
      '2 de 2',
      '2 de 2 prontos',
    ]);
    expect([e.pos.feita, e.metadados.feita, e.revisao.feita, e.publicado.feita]).toEqual([
      true,
      true,
      true,
      true,
    ]);
  });

  it('live limpa é live encerrada: Pós conta todos os aprovados (decisão do Paulo)', () => {
    // O Limpar (D-598) apaga o vídeo também de quem só subiu no TikTok ou não
    // subiu; o disco deixa de ser a fonte de verdade, e a live já terminou.
    // Na Revisão, pronto_publicar = vídeo + título + capa (export.py). Só o
    // vídeo vem do disco; título e capa moram no banco e continuam valendo.
    const limpa: DadosDaLive = {
      ...LIVE,
      arquivosLimpos: true,
      cortes: [
        corte('a', 'aprovado'),
        corte('b', 'aprovado'),
        corte('d', 'aprovado'),
        corte('e', 'aprovado'),
        corte('f', 'aprovado'),
        corte('c', 'proposto'),
      ],
      exportados: [
        // 'a' tem título e descrição, mas não tem capa: não estava pronto.
        exportado('a', { metadados_completos: true, titulo_youtube: 'A' }),
        // 'b' e 'd' têm título e capa (sem descrição): estavam prontos.
        exportado('b', { titulo_youtube: 'B', thumbnail_pronta: true }),
        exportado('d', { titulo_youtube: 'D', thumbnail_pronta: true }),
        // 'e' tem capa, mas não tem título: não estava pronto.
        exportado('e', { thumbnail_pronta: true }),
        // 'f' está no ar sem título nem capa no banco: já passou da Revisão.
        exportado('f', { youtube_url_publicado: 'https://youtu.be/f' }),
      ],
    };
    const e = porId(trilhaDaLive('projeto', '267', null, limpa));
    expect([e.pos.contagem, e.revisao.contagem]).toEqual(['5 de 5', '3 de 5 prontos']);
    expect([e.pos.feita, e.revisao.feita]).toEqual([true, false]);
    // Metadados e Publicado não vêm do disco: continuam contando o que é.
    expect(e.metadados.contagem).toBe('2 de 5');
    expect(e.publicado.contagem).toBe('1 de 5');
  });

  it('Cortes só fica feito quando nenhum corte espera decisão', () => {
    expect(porId(trilhaDaLive('projeto', '267', null, LIVE)).cortes.feita).toBe(false);
    const decidida = { ...LIVE, cortes: LIVE.cortes.filter((c) => c.status !== 'proposto') };
    expect(porId(trilhaDaLive('projeto', '267', null, decidida)).cortes.feita).toBe(true);
  });

  it('Baixado, Analisado e Publicado levam ao Workspace — Publicado com o filtro "No ar"', () => {
    const e = porId(trilhaDaLive('pos', '267', '7', LIVE));
    expect(e.baixado.to).toBe('/projetos/267');
    expect(e.analisado.to).toBe('/projetos/267');
    expect(e.publicado.to).toBe('/projetos/267?filtro=no-ar');
  });

  it('as etapas de tela levam ao corte aberto (D-798) e, sem ele, à tela da live', () => {
    const comCorte = porId(trilhaDaLive('revisao', '267', '7', LIVE));
    expect(comCorte.cortes.to).toBe('/projetos/267/cortes/7');
    expect(comCorte.pos.to).toBe('/projetos/267/post-production?corte=7');
    expect(comCorte.metadados.to).toBe('/projetos/267/metadados?corte=7');
    expect(comCorte.revisao.to).toBe('/projetos/267/final-review?corte=7');
    expect(porId(trilhaDaLive('projeto', '267', null, LIVE)).pos.to).toBe(
      '/projetos/267/post-production',
    );
  });

  it('acende a etapa da tela aberta', () => {
    const acesas = (tela: Parameters<typeof trilhaDaLive>[0]) =>
      trilhaDaLive(tela, '267', null, LIVE)
        .filter((e) => e.agora)
        .map((e) => e.id);
    expect(acesas('cortes')).toEqual(['cortes']);
    expect(acesas('pos')).toEqual(['pos']);
    expect(acesas('metadados')).toEqual(['metadados']);
    expect(acesas('revisao')).toEqual(['revisao']);
  });

  it('no Workspace acende onde a live parou; com o filtro "No ar", Publicado', () => {
    const acesa = (filtroNoAr: boolean, dados = LIVE) =>
      trilhaDaLive('projeto', '267', null, dados, filtroNoAr).filter((e) => e.agora).map((e) => e.id);
    expect(acesa(false)).toEqual(['cortes']);
    expect(acesa(true)).toEqual(['publicado']);
    const baixando: DadosDaLive = { ...LIVE, statusDoProjeto: 'baixando', cortes: [], exportados: [] };
    expect(acesa(false, baixando)).toEqual(['baixado']);
  });

  it('sem aprovados as etapas seguintes ficam sem contagem; carregando, nada aparece feito', () => {
    const soPropostos: DadosDaLive = { ...LIVE, cortes: [corte('c', 'proposto')] };
    const e = porId(trilhaDaLive('projeto', '267', null, soPropostos));
    expect([e.pos.contagem, e.revisao.contagem, e.publicado.contagem]).toEqual(['—', '—', '—']);
    expect(e.pos.feita).toBe(false);

    const carregando = trilhaDaLive('cortes', '267', null, undefined);
    expect(carregando).toHaveLength(7);
    expect(carregando.some((x) => x.feita)).toBe(false);
  });

  it('Baixado diz "limpo" quando a mídia pesada já foi apagada, e não está feito durante o download', () => {
    expect(porId(trilhaDaLive('projeto', '267', null, { ...LIVE, arquivosLimpos: true })).baixado.contagem).toBe('limpo');
    const baixando: DadosDaLive = { ...LIVE, statusDoProjeto: 'baixando', cortes: [], exportados: [] };
    expect(porId(trilhaDaLive('projeto', '267', null, baixando)).baixado.feita).toBe(false);
  });

  it('não existe fora de uma live', () => {
    expect(trilhaDaLive('shorts', '267', null, LIVE)).toEqual([]);
    expect(trilhaDaLive('cortes', null, null, LIVE)).toEqual([]);
    expect(dentroDeUmaLive('biblioteca')).toBe(false);
    expect(dentroDeUmaLive('projeto')).toBe(true);
  });
});

describe('filtroNoArLigado', () => {
  it('lê o filtro "No ar" da URL', () => {
    expect(filtroNoArLigado('?filtro=no-ar')).toBe(true);
    expect(filtroNoArLigado('filtro=no-ar&x=1')).toBe(true);
    expect(filtroNoArLigado('')).toBe(false);
    expect(filtroNoArLigado('?filtro=outro')).toBe(false);
  });

  it('a trilha e o Workspace leem o filtro pela mesma função', () => {
    const fonte = (c: string) => readFileSync(resolve(__dirname, c), 'utf8');
    expect(fonte('../useTrilhaDaLive.ts')).toContain("tela === 'projeto' && filtroNoArLigado(search)");
    expect(fonte('../../features/projeto-detalhe/useWorkspaceProjeto.tsx')).toContain(
      'const soNoAr = filtroNoArLigado(parametros.toString());',
    );
  });
});

describe('trilhaDaLive · bordas do download e da análise', () => {
  it('transcrevendo: Baixado feito, Analisado ainda não', () => {
    const transcrevendo: DadosDaLive = { ...LIVE, statusDoProjeto: 'transcrevendo', cortes: [], exportados: [] };
    const e = porId(trilhaDaLive('projeto', '267', null, transcrevendo));
    expect(e.baixado.feita).toBe(true);
    expect(e.analisado.feita).toBe(false);
  });

  it('analisado sem corte nenhum: a análise terminou, com zero propostos', () => {
    const vazia: DadosDaLive = { ...LIVE, statusDoProjeto: 'analisado', cortes: [], exportados: [] };
    const e = porId(trilhaDaLive('projeto', '267', null, vazia));
    expect(e.analisado.feita).toBe(true);
    expect(e.analisado.contagem).toBe('0 propostos');
  });
});

describe('dadosDaLive', () => {
  const cortes = [corte('a', 'aprovado')];

  it('sem projeto ou sem cortes ainda não há o que contar', () => {
    expect(dadosDaLive(undefined, cortes, [])).toBeUndefined();
    expect(dadosDaLive({ status: 'analisado' }, undefined, [])).toBeUndefined();
  });

  it('monta os dados; export ausente é live sem render, não carregando', () => {
    expect(dadosDaLive({ status: 'analisado', arquivos_limpos: true }, cortes, undefined)).toEqual({
      statusDoProjeto: 'analisado',
      arquivosLimpos: true,
      cortes,
      exportados: [],
    });
  });
});
