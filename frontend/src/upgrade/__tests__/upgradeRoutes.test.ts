import { describe, expect, it } from 'vitest';
import {
  CABECALHO,
  corteDaRota,
  dentroDeUmaLive,
  destinosDaPaleta,
  esteiraDaLive,
  menuDoTrilho,
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
// nao leva a lugar nenhum e decoracao.
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
    const naBiblioteca = trilhaDaTela('biblioteca');
    expect(naBiblioteca).toEqual([{ texto: 'Biblioteca' }]);
  });

  it('omite o destino quando nao existe projeto na rota', () => {
    const trilha = trilhaDaTela('cortes', ['LIVE 267', '#7']);
    expect(trilha[1].to).toBeUndefined();
    expect(trilha[2].to).toBeUndefined();
  });

  it('aceita destino explicito da tela, sobrepondo o padrao', () => {
    const trilha = trilhaDaTela(
      'cortes',
      [{ texto: 'LIVE 267', to: '/projetos/267?aba=cortes' }, '#7'],
      '267',
    );
    expect(trilha[1].to).toBe('/projetos/267?aba=cortes');
  });

  it('nao linka "Inteligencia" — e nome de grupo do trilho, nao de tela', () => {
    const trilha = trilhaDaTela('ranking');
    expect(trilha[0]).toEqual({ texto: 'Inteligência' });
  });
});

// ── Rodada 2: uma tabela, quatro vistas ──────────────────────────

describe('menuDoTrilho', () => {
  const menu = menuDoTrilho();

  it('e FIXO: nao depende da rota nem de haver live aberta', () => {
    expect(menu.producao.map((i) => i.id)).toEqual(['biblioteca', 'shorts']);
    expect(menu.inteligencia.map((i) => i.id)).toEqual([
      'lives',
      'ranking',
      'thumbs',
      'analises',
    ]);
    expect(menu.ferramentas.map((i) => i.id)).toEqual(['atalhos', 'config']);
  });

  it('acende "Biblioteca" em todas as telas de dentro de uma live', () => {
    const biblioteca = menu.producao.find((i) => i.id === 'biblioteca');
    expect(biblioteca?.telas).toEqual(
      expect.arrayContaining(['biblioteca', 'projeto', 'cortes', 'pos', 'metadados', 'revisao']),
    );
  });

  it('acende "Shorts" ao curar um fire e na prateleira', () => {
    const shorts = menu.producao.find((i) => i.id === 'shorts');
    expect(shorts?.telas).toEqual(expect.arrayContaining(['shorts', 'fire', 'prateleira']));
  });

  it('nao oferece a Fila como item de bloco — ela tem o cartao do pe', () => {
    const todos = [...menu.producao, ...menu.inteligencia, ...menu.ferramentas];
    expect(todos.some((i) => i.id === 'fila')).toBe(false);
    // …e o kit, que e andaime de dev fora da casca, tambem nao entra.
    expect(todos.some((i) => i.id === 'kit')).toBe(false);
  });
});

describe('esteiraDaLive', () => {
  it('lista as cinco fases na ordem do trabalho, com destino', () => {
    const passos = esteiraDaLive('metadados', '267');
    expect(passos.map((p) => p.id)).toEqual(['projeto', 'cortes', 'pos', 'metadados', 'revisao']);
    expect(passos[1].to).toBe('/projetos/267/cortes');
  });

  it('marca como "agora" a fase da rota atual', () => {
    const passos = esteiraDaLive('pos', '267');
    expect(passos.filter((p) => p.agora).map((p) => p.id)).toEqual(['pos']);
  });

  it('nao existe fora de uma live', () => {
    expect(esteiraDaLive('shorts', '267')).toEqual([]);
    expect(esteiraDaLive('cortes', null)).toEqual([]);
    expect(dentroDeUmaLive('biblioteca')).toBe(false);
    expect(dentroDeUmaLive('cortes')).toBe(true);
  });
});

describe('destinosDaPaleta e CABECALHO', () => {
  it('a paleta oferece as telas da tabela, sem o andaime de dev', () => {
    const ids = destinosDaPaleta().map((d) => d.id);
    expect(ids).toContain('t-fila');
    expect(ids).toContain('t-biblioteca');
    expect(ids).not.toContain('t-kit');
    expect(ids).not.toContain('t-erro');
  });

  it('o cabecalho de cada tela vem da mesma tabela', () => {
    expect(CABECALHO.cortes).toEqual({ icone: 'scissors', titulo: 'Editor de cortes' });
    expect(CABECALHO.erro.icone).toBe('triangle-alert');
  });
});
