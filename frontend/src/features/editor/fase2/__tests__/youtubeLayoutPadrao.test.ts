import { describe, expect, it } from 'vitest';
import {
  DEFAULT_YOUTUBE_LAYOUT,
  normalizeYoutubeLayout,
  resolveLayoutChain,
  type YoutubeLayout,
} from '../youtubeLayout';
import { draftMatchesPreset, montarPadraoJson, readPadraoModo } from '../youtubeLayoutPadrao';

describe('readPadraoModo', () => {
  it('retorna null para vazio / undefined / "{}"', () => {
    expect(readPadraoModo(undefined)).toBeNull();
    expect(readPadraoModo(null)).toBeNull();
    expect(readPadraoModo('')).toBeNull();
    expect(readPadraoModo('{}')).toBeNull();
  });

  it('retorna "full" quando o JSON tem modo_padrao=full', () => {
    expect(readPadraoModo(JSON.stringify({ modo_padrao: 'full' }))).toBe('full');
  });

  it('retorna "compartilhada" quando explicitamente compartilhada', () => {
    expect(readPadraoModo(JSON.stringify({ modo_padrao: 'compartilhada' }))).toBe('compartilhada');
  });

  it('default = compartilhada quando JSON existe mas modo_padrao está ausente', () => {
    // Hand-off F-024 fase 4c: preset salvo SEM modo_padrao explicito
    // assume compartilhada (preset so faz sentido em Compartilhada).
    expect(readPadraoModo(JSON.stringify({ fundo: 'hud-topo' }))).toBe('compartilhada');
  });

  it('retorna null para modo_padrao desconhecido (invalido)', () => {
    expect(readPadraoModo(JSON.stringify({ modo_padrao: 'amarelo' }))).toBeNull();
  });

  it('retorna null para JSON malformado', () => {
    expect(readPadraoModo('{ ill formed')).toBeNull();
  });
});

describe('montarPadraoJson — escrita do padrao de um escopo (D-423)', () => {
  const base = normalizeYoutubeLayout(DEFAULT_YOUTUBE_LAYOUT) as YoutubeLayout;

  it('grava o modo_padrao pedido preservando fundo/placa/posicionamentos salvos', () => {
    const salvo = JSON.stringify({
      modo_padrao: 'full',
      fundo: 'cosmograph',
      placa: base.placa,
      compartilhada: base.compartilhada,
      full: base.full,
    });
    const resultado = JSON.parse(montarPadraoJson(salvo, { modo_padrao: 'compartilhada' }));
    expect(resultado.modo_padrao).toBe('compartilhada');
    expect(resultado.fundo).toBe('cosmograph');
  });

  it('mudar o modo NAO apaga o posicionamento Full ja salvo no escopo', () => {
    // Regressao D-423: `definirTipoProjeto` remontava o JSON sem a chave `full`,
    // entao cada troca de modo zerava o posicionamento Full daquele escopo.
    const fullCustomizado = { crop: { x: 5, y: 6, w: 50, h: 40 }, slot: base.full.slot };
    const salvo = JSON.stringify({ modo_padrao: 'compartilhada', full: fullCustomizado });
    const resultado = JSON.parse(montarPadraoJson(salvo, { modo_padrao: 'full' }));
    expect(resultado.full.crop).toEqual(fullCustomizado.crop);
  });

  it('salvar posicionamento Compartilhada num escopo VAZIO nao carimba modo_padrao=full', () => {
    // Regressao D-423: com o escopo vazio o JSON nascia de DEFAULT_YOUTUBE_LAYOUT
    // e o `modo_padrao: 'full'` dele entrava de carona — o projeto voltava a Full
    // toda vez que se definia um preset Compartilhada.
    const resultado = JSON.parse(
      montarPadraoJson('{}', {
        modo_padrao: 'compartilhada',
        compartilhada: { ...base.compartilhada, telas: 2 },
      }),
    );
    expect(resultado.modo_padrao).toBe('compartilhada');
    expect(resultado.compartilhada.telas).toBe(2);
  });

  it('NAO materializa chave ausente — e a ausencia que faz o escopo cair para o proximo', () => {
    // `resolver_layout_em_cascata` (backend) e `resolveLayoutChain` tratam cada
    // nivel como PARCIAL. Preencher defaults aqui pregaria o projeto num valor e
    // cortaria a heranca do Global sem ninguem ter pedido.
    const resultado = JSON.parse(montarPadraoJson(undefined, { modo_padrao: 'full' }));
    expect(Object.keys(resultado)).toEqual(['modo_padrao']);
  });

  it('so o modo mudou: nao inventa posicionamento que o escopo ainda herdava', () => {
    const salvo = JSON.stringify({ modo_padrao: 'full', fundo: 'cosmograph' });
    const resultado = JSON.parse(montarPadraoJson(salvo, { modo_padrao: 'compartilhada' }));
    expect(Object.keys(resultado).sort()).toEqual(['fundo', 'modo_padrao']);
    // e o que ja estava salvo continua la, com o modo trocado
    expect(resultado).toEqual({ modo_padrao: 'compartilhada', fundo: 'cosmograph' });
  });

  it('a heranca sobrevive: escopo sem posicionamento continua caindo para o Global', () => {
    const projetoJson = montarPadraoJson('{}', { modo_padrao: 'compartilhada' });
    const globalJson = JSON.stringify({ fundo: 'hud-forte' });
    expect(resolveLayoutChain(null, projetoJson, globalJson).fundo).toBe('hud-forte');
  });

  it('JSON salvo corrompido parte do zero em vez de estourar', () => {
    const resultado = JSON.parse(montarPadraoJson('{ ill formed', { modo_padrao: 'full' }));
    expect(resultado).toEqual({ modo_padrao: 'full' });
  });
});

describe('draftMatchesPreset', () => {
  // Layout base do projeto — usado como ponto de partida para os testes
  const base = normalizeYoutubeLayout(DEFAULT_YOUTUBE_LAYOUT) as YoutubeLayout;

  it('retorna false quando o padrao nao existe', () => {
    expect(draftMatchesPreset(base, undefined)).toBe(false);
    expect(draftMatchesPreset(base, '{}')).toBe(false);
  });

  it('retorna true quando draft == preset salvo (fundo+placa+compartilhada)', () => {
    const padraoJson = JSON.stringify({
      fundo: base.fundo,
      placa: base.placa,
      compartilhada: base.compartilhada,
    });
    expect(draftMatchesPreset(base, padraoJson)).toBe(true);
  });

  it('retorna false quando o fundo difere', () => {
    const padraoJson = JSON.stringify({
      fundo: 'hud-forte',
      placa: base.placa,
      compartilhada: base.compartilhada,
    });
    const draft = { ...base, fundo: 'cosmograph' as const };
    expect(draftMatchesPreset(draft, padraoJson)).toBe(false);
  });

  it('IGNORA modo_padrao na comparacao (decisao F-024 fase 4c)', () => {
    // Mesmo preset, mas modo_padrao diferente -> ainda considera "usando"
    const padraoJson = JSON.stringify({
      modo_padrao: 'compartilhada',
      fundo: base.fundo,
      placa: base.placa,
      compartilhada: base.compartilhada,
    });
    const draft: YoutubeLayout = { ...base, modo_padrao: 'full' };
    expect(draftMatchesPreset(draft, padraoJson)).toBe(true);
  });

  it('IGNORA regioes customizadas na comparacao', () => {
    const padraoJson = JSON.stringify({
      fundo: base.fundo,
      placa: base.placa,
      compartilhada: base.compartilhada,
    });
    const draft: YoutubeLayout = {
      ...base,
      regioes: [{ inicio: 10, fim: 20, modo: 'full' }],
    };
    expect(draftMatchesPreset(draft, padraoJson)).toBe(true);
  });

  it('retorna false para JSON malformado', () => {
    expect(draftMatchesPreset(base, '{ ill formed')).toBe(false);
  });
});

describe('resolveLayoutChain — cascade global -> projeto -> corte (I-025)', () => {
  it('projeto.layout_youtube_padrao serializado define o modo do corte intocado', () => {
    // Cenário do bug I-025: projeto está em "compartilhada" mas backend
    // entrega o JSON como string. Antes o cascade descartava silenciosamente
    // e o corte caía no DEFAULT (full).
    const projetoJson = JSON.stringify({
      modo_padrao: 'compartilhada',
      fundo: 'cosmograph',
    });
    const corteSentinela = { modo_padrao: 'full', regioes: [] };
    const resolvido = resolveLayoutChain(corteSentinela, projetoJson);
    expect(resolvido.modo_padrao).toBe('compartilhada');
    expect(resolvido.fundo).toBe('cosmograph');
  });

  it('global.youtube_layout_padrao_global serializado também é respeitado', () => {
    const globalJson = JSON.stringify({ modo_padrao: 'compartilhada' });
    const resolvido = resolveLayoutChain(null, undefined, globalJson);
    expect(resolvido.modo_padrao).toBe('compartilhada');
  });

  it('corte explicitamente configurado sobrescreve o projeto', () => {
    const projetoJson = JSON.stringify({ modo_padrao: 'compartilhada' });
    const corteOverride = {
      modo_padrao: 'full',
      compartilhada: { telas: 2 },
    };
    const resolvido = resolveLayoutChain(corteOverride, projetoJson);
    expect(resolvido.modo_padrao).toBe('full');
  });
});
