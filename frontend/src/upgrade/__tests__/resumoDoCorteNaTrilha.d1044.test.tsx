import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { TrilhaDeEtapas } from '../TrilhaDeEtapas';
import { resumirCorte, trilhaDaLive, type EtapaDaTrilha } from '../trilhaDaLive';

// D-1044: com um corte aberto, cada casa resume ESTE corte; no Workspace, continua
// contando a live. A contagem da live segue no aria-label e na dica.

const CORTE = {
  desvios: [
    { inicio_seg: 10, fim_seg: 16 },
    { inicio_seg: 20, fim_seg: 26 },
  ],
  alertas_conferir: [{ conferido: false }, { conferido: true }],
  cenas_remotion: [{}, {}],
  cenas_validadas: 0,
};
const DADOS = { statusDoProjeto: 'analisado', arquivosLimpos: false, cortes: [], exportados: [] };
const casa = (etapas: EtapaDaTrilha[], id: string) => etapas.find((e) => e.id === id)!;

describe('D-1044 · o resumo do corte', () => {
  it('diz o que sai, o conferir, as cenas, a capa e a revisão', () => {
    expect(resumirCorte(CORTE, { thumbnail_pronta: false, metadados_completos: false, pronto_publicar: false })).toEqual({
      cortes: 'sai 12 s, 1 conferir',
      pos: '2 cenas, por validar',
      metadados: 'falta capa',
      revisao: 'falta algo',
    });
  });

  it('corte validado, com capa e pronto', () => {
    const r = resumirCorte(
      { desvios: [], cenas_remotion: { cenas: [{}] }, cenas_validadas: 1 },
      { thumbnail_pronta: true, metadados_completos: true, pronto_publicar: true },
    );
    expect(r).toEqual({ cortes: 'sem trechos', pos: '1 cena', metadados: 'ok', revisao: 'pronto' });
  });

  it('falta metadado com a capa pronta', () => {
    expect(resumirCorte({}, { thumbnail_pronta: true, metadados_completos: false }).metadados).toBe('falta metadado');
  });

  it('sem status no export, as casas de publicação não inventam nada', () => {
    const r = resumirCorte({ cenas_remotion: [] }, undefined);
    expect(r).toEqual({ cortes: 'sem trechos', pos: 'sem cenas' });
  });
});

describe('D-1044 · o resumo nas casas', () => {
  const RESUMO = { cortes: 'sai 12 s', pos: '2 cenas' };

  it('com corte aberto, a casa leva o resumo, e a contagem da live continua lá', () => {
    const etapas = trilhaDaLive('cortes', 'p1', 'c1', DADOS, false, RESUMO);
    expect(casa(etapas, 'cortes').doCorte).toBe('sai 12 s');
    expect(casa(etapas, 'cortes').contagem).toBeTruthy();
  });

  it('não vaza para o Workspace, que continua contando a live', () => {
    const etapas = trilhaDaLive('projeto', 'p1', 'c1', DADOS, false, RESUMO);
    expect(etapas.every((e) => e.doCorte === undefined)).toBe(true);
  });

  it('casa sem resumo fica com a contagem', () => {
    const etapas = trilhaDaLive('cortes', 'p1', 'c1', DADOS, false, RESUMO);
    expect(casa(etapas, 'baixado').doCorte).toBeUndefined();
  });

  it('desenhada: mostra o resumo e mantém a live no rótulo e na dica', () => {
    const etapas = trilhaDaLive('cortes', 'p1', 'c1', DADOS, false, RESUMO);
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <TrilhaDeEtapas etapas={etapas} />
      </MemoryRouter>,
    );
    const contagem = casa(etapas, 'cortes').contagem;
    expect(html).toContain('>sai 12 s<');
    expect(html).toContain(`aria-label="Cortes: ${contagem}`);
    expect(html).toContain(`title="Cortes · este corte: sai 12 s · na live: ${contagem}"`);
    expect(html).toContain('aria-description="Este corte: sai 12 s"');
  });
});
