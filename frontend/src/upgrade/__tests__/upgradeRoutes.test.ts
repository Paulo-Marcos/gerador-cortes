import { describe, expect, it } from 'vitest';
import {
  corteDaRota,
  projetoDaRota,
  telaDaRota,
  trilhaDaTela,
} from '../upgradeRoutes';

describe('telaDaRota', () => {
  it('distingue as telas do projeto pela parte final da rota', () => {
    expect(telaDaRota('/projetos')).toBe('biblioteca');
    expect(telaDaRota('/projetos/267')).toBe('projeto');
    expect(telaDaRota('/projetos/267/cortes')).toBe('cortes');
    expect(telaDaRota('/projetos/267/cortes/7')).toBe('cortes');
    expect(telaDaRota('/projetos/267/post-production')).toBe('pos');
    expect(telaDaRota('/projetos/267/metadados')).toBe('metadados');
    expect(telaDaRota('/projetos/267/final-review')).toBe('revisao');
  });

  it('trata /export como pos-producao (a rota aposentada redireciona para la)', () => {
    expect(telaDaRota('/projetos/267/export')).toBe('pos');
  });

  it('separa a prateleira da curadoria do fire', () => {
    expect(telaDaRota('/shorts')).toBe('shorts');
    expect(telaDaRota('/shorts/7')).toBe('fire');
    expect(telaDaRota('/shorts/7/workspace')).toBe('prateleira');
  });

  it('cai em erro quando a rota nao existe no mapa', () => {
    expect(telaDaRota('/rota-que-nao-existe')).toBe('erro');
  });
});

describe('projetoDaRota e corteDaRota', () => {
  it('extrai os ids quando a rota os carrega', () => {
    expect(projetoDaRota('/projetos/267/cortes/7')).toBe('267');
    expect(corteDaRota('/projetos/267/cortes/7')).toBe('7');
    expect(corteDaRota('/shorts/42')).toBe('42');
  });

  it('devolve null fora do escopo de um projeto ou corte', () => {
    expect(projetoDaRota('/buscar-lives')).toBeNull();
    expect(corteDaRota('/projetos/267/cortes')).toBeNull();
  });
});

describe('trilhaDaTela', () => {
  it('encaixa os rotulos nos slots, na ordem do design', () => {
    expect(trilhaDaTela('cortes', ['LIVE 267', '#7'])).toEqual([
      'Biblioteca',
      'LIVE 267',
      'Cortes',
      '#7',
    ]);
  });

  it('descarta o slot sem rotulo em vez de deixar buraco', () => {
    expect(trilhaDaTela('cortes', ['LIVE 267'])).toEqual(['Biblioteca', 'LIVE 267', 'Cortes']);
    expect(trilhaDaTela('cortes')).toEqual(['Biblioteca', 'Cortes']);
  });

  it('ignora rotulos sobrando', () => {
    expect(trilhaDaTela('shorts', ['LIVE 267', '#7'])).toEqual(['Shorts']);
  });
});
