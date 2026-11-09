import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { TrilhaDeEtapas } from '../TrilhaDeEtapas';
import { resumirCorte, trilhaDaLive, type EtapaDaTrilha } from '../trilhaDaLive';

// D-1044: com um corte aberto, cada casa resume ESTE corte; no Workspace, continua
// contando a live. A contagem da live segue no aria-label e na dica.

const CORTE = {
  inicio_seg: 0,
  fim_seg: 100,
  // Como o corte chega da API: o trecho marcado pela IA ou à mão só traz o hms.
  desvios: [
    { inicio_hms: '00:00:10.000', fim_hms: '00:00:16.000' },
    { inicio_hms: '00:00:20.000', fim_hms: '00:00:26.000' },
  ],
  alertas_conferir: [{ conferido: false }, { conferido: true }],
  cenas_remotion: [{}, {}],
  cenas_validadas: 0,
};
const DADOS = { statusDoProjeto: 'analisado', arquivosLimpos: false, cortes: [], exportados: [] };
const casa = (etapas: EtapaDaTrilha[], id: string) => etapas.find((e) => e.id === id)!;

describe('D-1044 · o resumo do corte', () => {
  const queSai = (desvios: { inicio_hms: string; fim_hms: string }[]) =>
    resumirCorte({ inicio_seg: 100, fim_seg: 200, desvios }, undefined).cortes;

  it('trecho sobreposto não conta duas vezes', () => {
    expect(
      queSai([
        { inicio_hms: '00:02:00.000', fim_hms: '00:02:10.000' },
        { inicio_hms: '00:02:05.000', fim_hms: '00:02:15.000' },
      ]),
    ).toBe('fica 1:25 · sai 0:15');
  });

  it('trecho fora do intervalo do corte não conta', () => {
    expect(queSai([{ inicio_hms: '00:10:00.000', fim_hms: '00:10:30.000' }])).toBe('fica 1:40 · nada sai');
  });

  it('trecho de menos de meio segundo não some da conta', () => {
    expect(queSai([{ inicio_hms: '00:02:00.000', fim_hms: '00:02:00.300' }])).toBe('fica 1:40 · sai 0:01');
  });

  it('diz o que sai, o conferir, as cenas, a capa e a revisão', () => {
    expect(resumirCorte(CORTE, { thumbnail_pronta: false, metadados_completos: false, pronto_publicar: false })).toEqual({
      cortes: 'fica 1:28 · sai 0:12, 1 conferir',
      pos: '2 cenas, por validar',
      metadados: 'falta capa',
      revisao: 'falta algo',
    });
  });

  it('corte validado, com capa e pronto', () => {
    const r = resumirCorte(
      { inicio_seg: 0, fim_seg: 100, desvios: [], cenas_remotion: { cenas: [{}] }, cenas_validadas: 1 },
      { thumbnail_pronta: true, metadados_completos: true, pronto_publicar: true },
    );
    expect(r).toEqual({ cortes: 'fica 1:40 · nada sai', pos: '1 cena', metadados: 'ok', revisao: 'pronto' });
  });

  it('falta metadado com a capa pronta', () => {
    expect(resumirCorte({ inicio_seg: 0, fim_seg: 100 }, { thumbnail_pronta: true, metadados_completos: false }).metadados).toBe('falta metadado');
  });

  it('sem status no export, as casas de publicação não inventam nada', () => {
    const r = resumirCorte({ inicio_seg: 0, fim_seg: 100, cenas_remotion: [] }, undefined);
    expect(r).toEqual({ cortes: 'fica 1:40 · nada sai', pos: 'sem cenas' });
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
