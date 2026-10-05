import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { StatusExportCorte } from '@/types/models';
import { montarTira, resumoDaLinha, textoDaProxima } from '../tiraDoCorte';
import { TiraDoCorteAp, TiraMini } from '../TiraDoCorteAp';
import { statusExportPendente } from '@/features/publicacao/statusExport';

function status(patch: Partial<StatusExportCorte> = {}): StatusExportCorte {
  return statusExportPendente({
    corte_id: 'corte-1',
    numero: 1,
    titulo: 'Corte',
    raw_pronto: false,
    grade_pronta: false,
    overlays_prontos: false,
    cenas_geradas: false,
    cenas_validadas: false,
    video_pronto: false,
    thumbnail_pronta: false,
    metadados_completos: false,
    pronto_publicar: false,
    ...patch,
  });
}

const estados = (t: ReturnType<typeof montarTira>) =>
  Object.fromEntries(t.grupos.flatMap((g) => g.pips).map((p) => [p.sigla, p.estado]));

describe('montarTira', () => {
  it('agrupa em CENAS · RENDER · PUBLICAÇÃO, na ordem do fluxo', () => {
    const t = montarTira(status());
    expect(t.grupos.map((g) => [g.nome, g.pips.map((p) => p.sigla)])).toEqual([
      ['CENAS', ['BRU', 'CEN']],
      ['RENDER', ['GRD', 'OVL', 'FIN']],
      ['PUBLICAÇÃO', ['THU', 'MET', 'YT']],
    ]);
  });

  it('cenas validadas sem render: para no graded (5A)', () => {
    const t = montarTira(status({ raw_pronto: true, cenas_validadas: true }));
    expect(estados(t)).toMatchObject({ BRU: 'feito', CEN: 'feito', GRD: 'agora', FIN: 'falta', YT: 'falta' });
    expect(t.contagem).toBe('2/8');
    // D-868: o mesmo verbo da linha do Workspace.
    expect(textoDaProxima(t)).toBe('próximo: aplicar filtro');
  });

  it('renderizado e sem capa aponta a capa, não o YouTube', () => {
    const t = montarTira(
      status({ raw_pronto: true, cenas_validadas: true, grade_pronta: true, overlays_prontos: true, video_pronto: true }),
    );
    expect(t.proxima?.sigla).toBe('THU');
  });

  it('corte rejeitado: primeiro pip em erro, nenhum âmbar, sem próxima (5C)', () => {
    const t = montarTira(status({ raw_pronto: true }), 'rejeitado');
    const e = Object.values(estados(t));
    expect(e[0]).toBe('rejeitado');
    expect(e).not.toContain('agora');
    expect(t.proxima).toBeUndefined();
  });

  it('corte no ar com mídia limpa não aponta etapa para trás', () => {
    const t = montarTira(
      status({ raw_pronto: true, thumbnail_pronta: true, metadados_completos: true, youtube_url_publicado: 'https://youtu.be/x' }),
    );
    expect(t.proxima).toBeUndefined();
    expect(Object.values(estados(t))).not.toContain('agora');
    expect(textoDaProxima(t)).toBe('no ar');
  });

  it('corte 8/8: nenhum âmbar (5D)', () => {
    const t = montarTira(
      status({
        raw_pronto: true,
        cenas_validadas: true,
        grade_pronta: true,
        overlays_prontos: true,
        video_pronto: true,
        thumbnail_pronta: true,
        metadados_completos: true,
        youtube_url_publicado: 'https://youtu.be/x',
      }),
    );
    expect(t.contagem).toBe('8/8');
    expect(Object.values(estados(t))).not.toContain('agora');
    expect(textoDaProxima(t)).toBe('no ar');
  });

  it('sem nada feito e sem publicar, nada pendente só quando rejeitado', () => {
    expect(textoDaProxima(montarTira(status(), 'rejeitado'))).toBe('nada pendente');
  });
});

// D-859: a tira está no piso de 11 px (era 9), e a mini quebra entre os
// grupos para caber na coluna da lista — os oito pips passavam da borda.
describe('a tira no piso de 11 px', () => {
  const tira = montarTira(status({ raw_pronto: true }));
  const fontes = (html: string) => [...html.matchAll(/font-size:([\d.]+)px/g)].map((m) => Number(m[1]));

  it('TiraDoCorteAp: nenhum texto abaixo de 11 px', () => {
    const html = renderToStaticMarkup(createElement(TiraDoCorteAp, { tira }));
    expect(fontes(html).length).toBeGreaterThan(0);
    expect(Math.min(...fontes(html))).toBeGreaterThanOrEqual(11);
  });

  it('TiraMini: siglas a 11 px, e a fileira quebra entre os grupos, não dentro', () => {
    const html = renderToStaticMarkup(createElement(TiraMini, { tira }));
    expect(fontes(html).length).toBe(8);
    expect(Math.min(...fontes(html))).toBeGreaterThanOrEqual(11);
    const [fileira, ...resto] = html.match(/<span[^>]*style="[^"]*"/g) ?? [];
    expect(fileira).toContain('flex-wrap:wrap');
    // os três grupos (CENAS · RENDER · PUBLICAÇÃO), cada um um bloco sem quebra própria
    const grupos = resto.filter((s) => !s.includes('data-estado'));
    expect(grupos).toHaveLength(3);
    for (const g of grupos) expect(g).not.toContain('flex-wrap');
  });
});

// D-868 (Onda 3, nota 3): estado em palavras. A linha do Workspace troca as
// 11 siglas por uma barra de 8 passos e "N de 8 · próximo: verbo".
describe('resumoDaLinha', () => {
  it('cada etapa tem um verbo, na ordem do fluxo', () => {
    const verbos = montarTira(status())
      .grupos.flatMap((g) => g.pips)
      .map((p) => p.verbo);
    expect(verbos).toEqual([
      'gerar bruto',
      'gerar cenas',
      'aplicar filtro',
      'renderizar overlays',
      'renderizar final',
      'gerar capa',
      'completar metadados',
      'publicar no YouTube',
    ]);
  });

  it('nada feito: "0 de 8 · próximo: gerar bruto" (o texto da prancha)', () => {
    expect(resumoDaLinha(montarTira(status()))).toBe('0 de 8 · próximo: gerar bruto');
  });

  it('parou no meio: conta as feitas e diz o verbo da próxima', () => {
    const t = montarTira(status({ raw_pronto: true, cenas_validadas: true, grade_pronta: true }));
    expect(resumoDaLinha(t)).toBe('3 de 8 · próximo: renderizar overlays');
  });

  it('no ar: diz só isso — a contagem da mídia limpa ("1 de 8") enganava', () => {
    const t = montarTira(status({ youtube_url_publicado: 'https://youtu.be/x' }));
    expect(resumoDaLinha(t)).toBe('no ar');
  });

  it('cenas: gerar quando não existem, validar quando já foram geradas', () => {
    const verboDasCenas = (patch: Partial<StatusExportCorte>) =>
      montarTira(status({ raw_pronto: true, ...patch })).proxima?.verbo;
    expect(verboDasCenas({ cenas_geradas: false })).toBe('gerar cenas');
    expect(verboDasCenas({ cenas_geradas: true })).toBe('validar cenas');
  });

  it('a tira da Pós e do modal falam o mesmo verbo da linha', () => {
    const t = montarTira(status({ raw_pronto: true, cenas_validadas: true, grade_pronta: true }));
    expect(textoDaProxima(t)).toBe('próximo: renderizar overlays');
    expect(renderToStaticMarkup(createElement(TiraMini, { tira: t }))).toContain(
      'próximo: renderizar overlays',
    );
    expect(renderToStaticMarkup(createElement(TiraDoCorteAp, { tira: t }))).toContain(
      'próximo: renderizar overlays',
    );
  });

  it('rejeitado: diz isso, sem próxima etapa', () => {
    expect(resumoDaLinha(montarTira(status(), 'rejeitado'))).toBe('corte rejeitado');
  });
});
