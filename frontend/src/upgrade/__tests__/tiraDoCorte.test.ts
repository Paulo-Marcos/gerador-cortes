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

// D-1144 (H-14, DIRECAO §5): as siglas saíram; a tira é o MedidorDeEtapas (oito traços e a
// frase), sem sigla e sem style inline. (Era o describe "a tira no piso de 11 px", D-859.)
describe('a tira é o medidor de etapas', () => {
  const tira = montarTira(status({ raw_pronto: true }));
  const SIGLAS = ['>BRU<', '>CEN<', '>GRD<', '>OVL<', '>FIN<', '>THU<', '>MET<', '>YT<'];
  const semIcones = (html: string) => html.replace(/<svg[\s\S]*?<\/svg>/g, '');

  it.each([
    ['TiraDoCorteAp', TiraDoCorteAp],
    ['TiraMini', TiraMini],
  ])('%s: oito traços nomeados, sem sigla e sem style', (_nome, Tira) => {
    const html = renderToStaticMarkup(createElement(Tira, { tira }));
    expect(html.match(/data-etapa="/g)).toHaveLength(8);
    expect(html).toContain('role="img"');
    for (const sigla of SIGLAS) expect(html).not.toContain(sigla);
    expect(semIcones(html)).not.toContain('style=');
  });

  it('TiraDoCorteAp leva a frase; TiraMini a guarda só no aria-label (a coluna tem 145 px)', () => {
    const frase = resumoDaLinha(tira);
    expect(renderToStaticMarkup(createElement(TiraDoCorteAp, { tira }))).toContain(`>${frase}</span>`);
    const mini = renderToStaticMarkup(createElement(TiraMini, { tira }));
    expect(mini).toContain(`aria-label="Etapas do corte: ${frase}"`);
    expect(mini).not.toContain(`>${frase}</span>`);
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
