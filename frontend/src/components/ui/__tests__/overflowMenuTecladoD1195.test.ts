import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { acaoDaTecla, focoFicouPerdido, indiceDoProximoItem } from '../overflow-menu';

// D-1195 (E-069 H-25; DIRECAO §8.2 Foco e Semântica): o menu "⋯" (Biblioteca, linha do corte,
// Metadados) abria pelo Enter mas as setas não andavam: o foco ficava no gatilho e o operador
// de teclado só chegava aos itens pelo Tab, sem saber que eram um menu. Agora as setas, Home e
// End andam pelos itens (como o menu do Radix), o foco entra no primeiro item ao abrir, o Tab
// fecha o menu e, ao fechar, o foco perdido volta ao gatilho.

describe('setas no menu ⋯', () => {
  it('↓ desce e dá a volta; ↑ sobe e dá a volta', () => {
    expect(indiceDoProximoItem(0, 3, 'ArrowDown')).toBe(1);
    expect(indiceDoProximoItem(2, 3, 'ArrowDown')).toBe(0);
    expect(indiceDoProximoItem(0, 3, 'ArrowUp')).toBe(2);
  });

  it('sem item com foco, ↓ vai ao primeiro e ↑ ao último', () => {
    expect(indiceDoProximoItem(-1, 3, 'ArrowDown')).toBe(0);
    expect(indiceDoProximoItem(-1, 3, 'ArrowUp')).toBe(2);
  });

  it('Home e End vão às pontas; outra tecla não é do menu', () => {
    expect(indiceDoProximoItem(1, 3, 'Home')).toBe(0);
    expect(indiceDoProximoItem(1, 3, 'End')).toBe(2);
    expect(indiceDoProximoItem(1, 3, 'a')).toBeNull();
    expect(indiceDoProximoItem(-1, 0, 'ArrowDown')).toBeNull();
  });
});

describe('o que cada tecla faz com o menu aberto', () => {
  it('seta, Home e End andam até um item', () => {
    expect(acaoDaTecla(0, 3, 'ArrowDown')).toEqual({ andarPara: 1 });
    expect(acaoDaTecla(1, 3, 'End')).toEqual({ andarPara: 2 });
  });

  it('o Tab fecha o menu (o foco segue para fora dele)', () => {
    expect(acaoDaTecla(0, 3, 'Tab')).toBe('fechar');
  });

  it('as outras teclas não são do menu', () => {
    expect(acaoDaTecla(0, 3, 'Enter')).toBeNull();
    expect(acaoDaTecla(0, 3, 'a')).toBeNull();
  });
});

describe('o foco ao fechar', () => {
  const corpo = { id: 'body' } as unknown as Element;
  const outro = { id: 'botao-do-dialogo' } as unknown as Element;

  it('perdido (no <body> ou em lugar nenhum): volta ao gatilho', () => {
    expect(focoFicouPerdido(corpo, corpo)).toBe(true);
    expect(focoFicouPerdido(null, corpo)).toBe(true);
  });

  it('já em outro lugar (clique fora, diálogo aberto pelo item): fica onde está', () => {
    expect(focoFicouPerdido(outro, corpo)).toBe(false);
  });
});

describe('o componente liga as decisões', () => {
  const fonte = readFileSync('src/components/ui/overflow-menu.tsx', 'utf8');

  it('o painel do menu escuta as teclas e o foco entra no primeiro item ao abrir', () => {
    expect(fonte).toMatch(/role="menu"\s+onKeyDown=\{navegar\}/);
    expect(fonte).toContain('querySelector<HTMLElement>(ITENS_FOCAVEIS)?.focus()');
  });

  it('a tecla que fecha fecha de verdade, e a que anda leva o foco ao item', () => {
    expect(fonte).toMatch(/if \(acao === 'fechar'\) \{\s*mudar\(false\);/);
    expect(fonte).toContain('itens[acao.andarPara]?.focus()');
  });

  it('ao fechar, o foco perdido volta ao gatilho', () => {
    expect(fonte).toMatch(
      /return \(\) => \{\s*if \(focoFicouPerdido\(document\.activeElement, document\.body\)\) wrap\?\.querySelector<HTMLElement>\(GATILHO\)\?\.focus\(\);/,
    );
  });
});
