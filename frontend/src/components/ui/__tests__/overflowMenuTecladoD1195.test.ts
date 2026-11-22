import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { indiceDoProximoItem } from '../overflow-menu';

// D-1195 (E-069 H-25; DIRECAO §8.2 Foco e Semântica): o menu "⋯" (Biblioteca, linha do corte,
// Metadados) abria pelo Enter mas as setas não andavam: o foco ficava no gatilho e o operador
// de teclado só chegava aos itens pelo Tab, sem saber que eram um menu. Agora as setas, Home e
// End andam pelos itens (como o menu do Radix) e o foco entra no primeiro item ao abrir.

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

  it('o painel do menu escuta as teclas e o foco entra no primeiro item ao abrir', () => {
    const fonte = readFileSync('src/components/ui/overflow-menu.tsx', 'utf8');
    expect(fonte).toMatch(/role="menu"\s+onKeyDown=\{navegar\}/);
    expect(fonte).toContain("querySelector<HTMLElement>(ITENS_FOCAVEIS)?.focus()");
  });
});
