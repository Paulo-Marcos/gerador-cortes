import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { Desvio } from '@/types/models';
import {
  ATRIBUTO_DA_AGULHA,
  CONTORNO_SOB_AGULHA,
  TOKEN_DA_AGULHA,
  marcarSobAgulha,
  textoDaAgulha,
  trechoSobAgulha,
} from '../agulhaDaOnda';
import { LegendaDaTimeline } from '../LegendaDaTimeline';
import { ESTILO_DO_TRECHO, ROTULO_DO_TRECHO, VEU_DO_TRECHO } from '../origemDaBorda';
import { drawRegions, type RegionsInstance } from '../regioesDaOnda';

// D-1150 (E-069 H-17, DIRECAO §3.3 e §7.3): na linha do tempo, o que fica é ACESO e o
// que sai leva o VÉU listrado. O contorno íris é o trecho ajustado por você; o contorno
// `cc-aviso` é o trecho sob a agulha; a agulha é traço claro com o rótulo no feixe.

const desvio = (inicio: string, fim: string, extra: Partial<Desvio> = {}) =>
  ({ inicio_hms: inicio, fim_hms: fim, categoria: 'silencio', ...extra }) as unknown as Desvio;

type Criada = { id: string; color: string; element: { style: Record<string, string>; attrs: Record<string, string>; title: string } };

function regioesFalsas() {
  const criadas: Criada[] = [];
  const regions = {
    clearRegions: () => undefined,
    addRegion: (r: { id: string; color: string }) => {
      const element = {
        style: {} as Record<string, string>,
        attrs: {} as Record<string, string>,
        title: '',
        setAttribute(k: string, v: string) {
          this.attrs[k] = v;
        },
      };
      const criada = { ...r, element } as unknown as Criada;
      criadas.push(criada);
      return criada;
    },
  } as unknown as RegionsInstance;
  return { regions, criadas };
}

describe('o véu do que sai (§3.3)', () => {
  it('todo trecho que sai leva o véu listrado; a origem vai no contorno', () => {
    for (const estilo of Object.values(ESTILO_DO_TRECHO)) expect(estilo.backgroundImage).toBe(VEU_DO_TRECHO);
    expect(VEU_DO_TRECHO).toMatch(/^repeating-linear-gradient\(.*var\(--cc-veu\)/);
    expect(ESTILO_DO_TRECHO.voce.border).toContain('var(--cc-iris)');
    expect(ESTILO_DO_TRECHO.ia.border).not.toContain('iris');
  });

  it('na onda, os trechos recebem o véu e o corte (o que fica) não', () => {
    const { regions, criadas } = regioesFalsas();
    drawRegions(
      regions,
      0,
      120,
      [desvio('00:00:30', '00:00:50', { rodada: 1, borda_da_rodada: [30, 50] }), desvio('00:01:00', '00:01:10', { origem: 'manual' })],
      0,
      false,
      [],
      'var(--cc-vidro)',
    );
    const [corte, ...trechos] = criadas;
    expect(corte.id).toBe('corte-principal');
    expect(corte.element.style.backgroundImage).toBeUndefined();
    expect(trechos.map((t) => t.element.style.backgroundImage)).toEqual([VEU_DO_TRECHO, VEU_DO_TRECHO]);
    expect(trechos.map((t) => t.element.attrs['data-trecho'])).toEqual(['ia', 'voce']);
    expect(trechos[1].element.style.border).toBe(ESTILO_DO_TRECHO.voce.border);
  });

  it('a legenda fala a língua da tela: fica aceso, sai pela IA, sai ajustado por você', () => {
    const html = renderToStaticMarkup(<LegendaDaTimeline corDoCorte="var(--cc-vidro)" />);
    // O texto é o que fica entre um ">" e o "<" seguinte (sem apagar tags por regex).
    const texto = html
      .split('>')
      .map((parte) => parte.split('<')[0])
      .join('');
    expect(texto).toContain('fica, aceso');
    expect(texto).toContain(`véu listrado · ${ROTULO_DO_TRECHO.ia}`);
    expect(texto).toContain(`véu com contorno íris · ${ROTULO_DO_TRECHO.voce}`);
    expect(ROTULO_DO_TRECHO).toMatchObject({ ia: 'sai, pela IA', voce: 'sai, ajustado por você' });
    // O quadradinho usa o mesmo véu e o mesmo contorno da onda, por variável.
    expect(html).toMatch(/data-legenda="voce".*?--borda:2px solid var\(--cc-iris\)/);
    expect(html).toContain('--veu:repeating-linear-gradient');
    expect(html).not.toMatch(/style="(?!--)[a-z]/);
  });
});

describe('a agulha e o trecho sob ela (§7.3)', () => {
  const DESVIOS = [desvio('00:00:10', '00:00:20'), desvio('00:00:40', '00:00:45')];

  it('o trecho sob a agulha é o que contém o instante; no que fica, nenhum', () => {
    expect(trechoSobAgulha(DESVIOS, 12)).toBe(0);
    expect(trechoSobAgulha(DESVIOS, 44.9)).toBe(1);
    expect(trechoSobAgulha(DESVIOS, 30)).toBe(-1);
    expect(trechoSobAgulha(DESVIOS, 20)).toBe(-1);
  });

  it('acende o contorno de aviso só nele, e apaga quando a agulha sai', () => {
    const el = () => {
      const attrs = new Set<string>();
      return {
        style: { outline: '', outlineOffset: '' },
        toggleAttribute: (k: string, on: boolean) => (on ? attrs.add(k) : attrs.delete(k)),
        tem: (k: string) => attrs.has(k),
      };
    };
    const regioes = [
      { id: 'corte-principal', element: el() },
      { id: 'desvio-0', element: el() },
      { id: 'desvio-1', element: el() },
    ];
    marcarSobAgulha(regioes as never, 1);
    expect(regioes[2].element.style.outline).toBe(CONTORNO_SOB_AGULHA);
    expect(regioes[2].element.tem('data-sob-agulha')).toBe(true);
    expect(regioes[1].element.style.outline).toBe('');
    expect(regioes[0].element.style.outline).toBe('');
    marcarSobAgulha(regioes as never, -1);
    expect(regioes[2].element.style.outline).toBe('');
    expect(CONTORNO_SOB_AGULHA).toContain('var(--cc-aviso)');
  });

  it('o rótulo diz o tempo dentro do corte, e a agulha usa o traço do foco', () => {
    expect(textoDaAgulha(130, 100)).toBe('00:30');
    expect(textoDaAgulha(90, 100)).toBe('00:00');
    expect(TOKEN_DA_AGULHA).toBe('--cc-foco');
    expect(ATRIBUTO_DA_AGULHA).toBe('data-playhead-dot');
  });
});
