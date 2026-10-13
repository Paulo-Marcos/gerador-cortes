import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { DestinoEscalonado } from '../api/escalonamento';
import {
  BlocosDoDestinoForm,
  parametrosValidos,
  resumoDosParametros,
} from '../BlocosDoDestinoForm';
import { ReferenciaDoPublicoGrade } from '../ReferenciaDoPublicoGrade';
import { gradeDasFaixas } from '../escalonamentoPublico';

/**
 * D-908. O que a tela de Canais promete: a grade clicável de 7 × 24 com cada
 * hora nomeada, e um formulário por rede que mostra o valor do canal, o padrão
 * ao lado e se o canal já mexeu.
 */
const DIAS = ['segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado', 'domingo'];

const SHORTS: DestinoEscalonado = {
  destino: 'youtube_shorts',
  rotulo: 'YouTube Shorts',
  parametros: {
    blocos: ['17:00', '21:00'],
    itens_por_bloco: 2,
    teto_por_dia: 4,
    intervalo_minimo_min: 60,
    dias_ativos: [0, 2, 4],
  },
  padrao: {
    blocos: ['16:00', '19:00', '22:00'],
    itens_por_bloco: 1,
    teto_por_dia: 3,
    intervalo_minimo_min: 180,
    dias_ativos: [0, 1, 2, 3, 4, 5, 6],
  },
  personalizado: true,
};

describe('a grade do público', () => {
  it('desenha 168 células, cada uma dizendo dia, hora e força', () => {
    const html = renderToStaticMarkup(
      <ReferenciaDoPublicoGrade
        grade={gradeDasFaixas([{ dia: 5, inicio: 12, fim: 23, intensidade: 'forte' }])}
        diasDaSemana={DIAS}
        onTrocar={() => {}}
      />,
    );

    expect(html.match(/aria-label="/g)).toHaveLength(7 * 24);
    expect(html).toContain('aria-label="sábado 13h: forte"');
    expect(html).toContain('aria-label="segunda 13h: médio"');
    expect(html).toContain('title="forte 12h–23h"');
  });
});

describe('o formulário de um destino', () => {
  it('mostra os blocos do canal, o padrão ao lado e a marca de personalizado', () => {
    const html = renderToStaticMarkup(
      <BlocosDoDestinoForm
        destino={SHORTS}
        diasDaSemana={DIAS}
        pending={false}
        onSave={() => {}}
        onReset={() => {}}
        onSugerir={async () => []}
      />,
    );

    expect(html).toContain('YouTube Shorts');
    expect(html).toContain('personalizado');
    expect(html).toContain('value="17:00"');
    expect(html).toContain('value="21:00"');
    expect(html).toContain('padrão: 16:00, 19:00, 22:00 · 1 por bloco · até 3 por dia · 180 min');
    // Os dias ativos: segunda ligada, terça não.
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain('aria-pressed="false"');
    expect(html).toContain('sugerir pela referência');
    // Os campos numéricos não impõem passo: com `min=1` e `step=5` o navegador
    // recusava 180 min e engolia o submit (visto no navegador, D-908).
    expect(html).not.toContain('step="5"');
    expect(html).toContain('step="any"');
  });

  it('resume os parâmetros numa linha', () => {
    expect(resumoDosParametros(SHORTS.padrao)).toBe(
      '16:00, 19:00, 22:00 · 1 por bloco · até 3 por dia · 180 min entre itens',
    );
  });

  it('recusa o que o backend recusaria: sem bloco, hora torta, zero por dia, sem dia', () => {
    expect(parametrosValidos(SHORTS.parametros)).toBe(true);
    expect(parametrosValidos({ ...SHORTS.parametros, blocos: [] })).toBe(false);
    expect(parametrosValidos({ ...SHORTS.parametros, blocos: ['tarde'] })).toBe(false);
    expect(parametrosValidos({ ...SHORTS.parametros, teto_por_dia: 0 })).toBe(false);
    expect(parametrosValidos({ ...SHORTS.parametros, dias_ativos: [] })).toBe(false);
  });
});
