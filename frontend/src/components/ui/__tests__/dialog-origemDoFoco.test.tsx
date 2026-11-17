import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { guardarOrigem } from '../dialog';

describe('a origem do foco com autoFocus no miolo (D-1122)', () => {
  it('guarda quem abriu e não a troca pelo campo que tomou o foco depois', () => {
    const botao = { isConnected: true, focus: vi.fn() };
    const campo = { isConnected: true, focus: vi.fn() };
    const origem = guardarOrigem(null, botao);
    // O `autoFocus` do miolo move o foco para o campo; o render seguinte vê o campo.
    expect(guardarOrigem(origem, campo)).toBe(botao);
  });

  it('a origem é guardada no desenho, antes do miolo montar — e não no gancho do Radix', () => {
    const fonte = readFileSync(resolve(__dirname, '../dialog.tsx'), 'utf8');
    // O gancho `onOpenAutoFocus` não roda quando o miolo já tem o foco (campo com autoFocus).
    const gancho = fonte.slice(fonte.indexOf('onOpenAutoFocus'), fonte.indexOf('onCloseAutoFocus'));
    expect(gancho).not.toContain('guardarOrigem');
    expect(gancho).not.toContain('lembrarOrigem');
    expect(fonte).toMatch(/origem\.current = guardarOrigem\(origem\.current, document\.activeElement\)/);
  });
});
