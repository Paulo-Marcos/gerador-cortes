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

// A trilha devolve MIGALHAS ({texto, to}) desde a Rodada 1: breadcrumb que
// nao leva a lugar nenhum e decoracao. Os testes abaixo cobrem as tres
// regras que sustentam isso — ordem dos slots, destino de cada migalha e a
// ultima sempre sem link.
describe('trilhaDaTela', () => {
  const textos = (tela: Parameters<typeof trilhaDaTela>[0], rotulos?: Array<string>, id?: string) =>
    trilhaDaTela(tela, rotulos, id).map((m) => m.texto);

  it('encaixa os rotulos nos slots, na ordem do design', () => {
    expect(textos('cortes', ['LIVE 267', '#7'], '267')).toEqual([
      'Biblioteca',
      'LIVE 267',
      'Cortes',
      '#7',
    ]);
  });

  it('descarta o slot sem rotulo em vez de deixar buraco', () => {
    expect(textos('cortes', ['LIVE 267'], '267')).toEqual(['Biblioteca', 'LIVE 267', 'Cortes']);
    expect(textos('cortes')).toEqual(['Biblioteca', 'Cortes']);
  });

  it('ignora rotulos sobrando', () => {
    expect(textos('shorts', ['LIVE 267', '#7'])).toEqual(['Shorts']);
  });

  it('da destino as migalhas fixas e ao nome da live', () => {
    const trilha = trilhaDaTela('cortes', ['LIVE 267', '#7'], '267');
    expect(trilha[0]).toEqual({ texto: 'Biblioteca', to: '/projetos' });
    // O primeiro slot das telas de dentro de uma live e sempre a live.
    expect(trilha[1]).toEqual({ texto: 'LIVE 267', to: '/projetos/267' });
    expect(trilha[2]).toEqual({ texto: 'Cortes', to: '/projetos/267/cortes' });
  });

  it('nunca linka a ultima migalha — e onde a pessoa ja esta', () => {
    const trilha = trilhaDaTela('cortes', ['LIVE 267', '#7'], '267');
    expect(trilha[trilha.length - 1]).toEqual({ texto: '#7' });
    // Mesmo quando a ultima e uma migalha fixa que TEM rota conhecida.
    const naBiblioteca = trilhaDaTela('biblioteca');
    expect(naBiblioteca).toEqual([{ texto: 'Biblioteca' }]);
  });

  it('omite o destino quando nao existe projeto na rota', () => {
    const trilha = trilhaDaTela('cortes', ['LIVE 267', '#7']);
    expect(trilha[1].to).toBeUndefined();
    expect(trilha[2].to).toBeUndefined();
  });

  it('aceita destino explicito da tela, sobrepondo o padrao', () => {
    const trilha = trilhaDaTela('cortes', [{ texto: 'LIVE 267', to: '/projetos/267?aba=cortes' }, '#7'], '267');
    expect(trilha[1].to).toBe('/projetos/267?aba=cortes');
  });

  it('nao linka "Inteligencia" — e nome de grupo do trilho, nao de tela', () => {
    const trilha = trilhaDaTela('ranking');
    expect(trilha[0]).toEqual({ texto: 'Inteligência' });
  });
});
