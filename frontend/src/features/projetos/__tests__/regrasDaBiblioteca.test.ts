import { describe, expect, it } from 'vitest';
import {
  cabecalhoDaBiblioteca,
  cortesDoMapa,
  diaDaLive,
  diasDaRegua,
  esperandoVoce,
  estadoDaCasa,
  motivoDoErro,
  noArHaPouco,
  saudacao,
} from '../regrasDaBiblioteca';
import { corte, projeto } from './fixtures/projetoDaSala';

// D-1148 (H-15; DIRECAO §7.1, §7.12 e §11): as regras da Biblioteca saem da listagem.

describe('saudação', () => {
  it('usa só o primeiro nome do operador', () => {
    expect(saudacao(21, 'Paulo Marcos')).toBe('Boa noite, Paulo.');
    expect(saudacao(9, 'Paulo')).toBe('Bom dia, Paulo.');
    expect(saudacao(14, 'Paulo')).toBe('Boa tarde, Paulo.');
  });

  it('sem nome sai sem nome (§11)', () => {
    expect(saudacao(21, '')).toBe('Boa noite.');
    expect(saudacao(3, '   ')).toBe('Boa noite.');
  });
});

describe('estado da casa (a segunda linha da saudação)', () => {
  it('conta os cortes que esperam o ok antes de tudo', () => {
    const casa = [projeto({ id: 'a', total_cortes: 4 }), projeto({ id: 'b', total_cortes: 2 }), projeto({ id: 'c', status: 'baixando' })];
    expect(estadoDaCasa(casa)).toBe('6 cortes esperam o seu ok.');
    expect(estadoDaCasa([projeto({ total_cortes: 1 })])).toBe('1 corte espera o seu ok.');
  });

  it('depois as prontas, as a caminho e as que esperam; e o canal novo', () => {
    const pronta = projeto({ total_cortes: 2, total_aprovados: 2, total_video_pronto: 2, total_com_meta: 2 });
    expect(estadoDaCasa([pronta])).toBe('1 live está pronta para publicar.');
    expect(estadoDaCasa([projeto({ status: 'baixando' }), projeto({ id: 'x', status: 'analisando' })])).toBe(
      '2 lives estão a caminho.',
    );
    expect(estadoDaCasa([projeto({ total_cortes: 2, total_aprovados: 1 })])).toBe('1 live espera você.');
    expect(estadoDaCasa([projeto({ total_cortes: 1, total_publicados: 1 })])).toBe('Tudo no ar.');
    expect(estadoDaCasa([])).toBe('A sala está pronta. Falta a primeira live.');
  });

  it('o cabeçalho junta a saudação, a data e o estado da casa', () => {
    const agora = new Date(2026, 10, 20, 21, 30);
    expect(cabecalhoDaBiblioteca(agora, 'Paulo', [projeto({ total_cortes: 6 })])).toEqual({
      titulo: 'Boa noite, Paulo.',
      sub: 'sex, 20 de nov · 6 cortes esperam o seu ok.',
    });
    expect(cabecalhoDaBiblioteca(agora, '', undefined)).toEqual({ titulo: 'Boa noite.', sub: 'sex, 20 de nov' });
  });
});

describe('régua dos últimos 8 dias', () => {
  it('lê a data da live nos três formatos', () => {
    expect(diaDaLive('20261118')).toBe('2026-11-18');
    expect(diaDaLive('20261118153000')).toBe('2026-11-18');
    expect(diaDaLive('2026-11-18T10:00:00')).toBe('2026-11-18');
    expect(diaDaLive('')).toBe('');
  });

  it('tem oito casas, de sete dias atrás até hoje, e só hoje marcado', () => {
    const dias = diasDaRegua([], new Date(2026, 10, 20, 9));
    expect(dias.map((d) => d.data)).toEqual([
      '2026-11-13', '2026-11-14', '2026-11-15', '2026-11-16',
      '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20',
    ]);
    expect(dias.filter((d) => d.hoje).map((d) => d.data)).toEqual(['2026-11-20']);
    expect(dias.every((d) => d.lives.length === 0)).toBe(true);
  });

  it('põe cada live no dia dela, com capa, destino e o ponto de estado', () => {
    const dias = diasDaRegua(
      [projeto({ id: 'a', data_live: '20261118', status: 'baixando' }), projeto({ id: 'velha', data_live: '20261001' })],
      new Date(2026, 10, 20),
    );
    const dia = dias.find((d) => d.data === '2026-11-18');
    expect(dia?.lives).toEqual([
      {
        id: 'a',
        titulo: 'Live de teste',
        href: '/projetos/a',
        capa: 'https://i.ytimg.com/vi/abcdefghijk/mqdefault.jpg',
        tom: 'curso',
        estado: 'Baixando',
      },
    ]);
    expect(dias.flatMap((d) => d.lives).map((l) => l.id)).toEqual(['a']);
  });
});

describe('as duas colunas', () => {
  const casa = [
    projeto({ id: 'destaque', data_live: '20261120', total_cortes: 3 }),
    projeto({ id: 'espera', data_live: '20261119', total_cortes: 3 }),
    projeto({ id: 'noar-velha', data_live: '20261110', total_cortes: 1, total_publicados: 1 }),
    projeto({ id: 'noar-nova', data_live: '20261118', total_cortes: 1, total_publicados: 1 }),
  ];

  it('"Esperando você" = não publicadas menos a do destaque (§7.1)', () => {
    expect(esperandoVoce(casa, 'destaque').map((p) => p.id)).toEqual(['espera']);
  });

  it('"No ar há pouco" = as publicadas, da mais recente para trás', () => {
    expect(noArHaPouco(casa).map((p) => p.id)).toEqual(['noar-nova', 'noar-velha']);
  });
});

describe('mini-mapa do "Continue"', () => {
  it('aprovado acende, rejeitado risca, proposto fica de vidro (§3.3)', () => {
    const mapa = cortesDoMapa(
      [
        corte({ id: 'a', status: 'aprovado' }),
        corte({ id: 'b', status: 'processado' }),
        corte({ id: 'c', status: 'rejeitado' }),
        corte({ id: 'd', status: 'proposto', titulo_proposto: '' }),
      ],
      'p1',
    );
    expect(mapa.map((c) => c.estado)).toEqual(['pronto', 'pronto', 'riscado', 'proposto']);
    expect(mapa[3].nome).toBe('juros');
    expect(mapa[0]).toMatchObject({ inicioSeg: 600, fimSeg: 1200, href: '/projetos/p1/cortes/a' });
  });
});

describe('motivo do erro', () => {
  it('a falha de rede vira uma frase do operador; o resto passa como veio', () => {
    expect(motivoDoErro(new TypeError('Failed to fetch'))).toBe(
      'O app não conseguiu falar com o backend. Confira se ele está rodando.',
    );
    expect(motivoDoErro(new Error('Canal sem banco'))).toBe('Canal sem banco');
    expect(motivoDoErro(null)).toBe('A lista de lives não chegou.');
  });
});
