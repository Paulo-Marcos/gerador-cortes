import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isWorkbenchEnabled, WORKBENCH_FLAG_STORAGE_KEY } from '../workbenchFlag';
import { UPGRADE_FLAG_STORAGE_KEY } from '@/upgrade/upgradeFlag';

// Ambiente node: um localStorage de mentira basta para as duas flags.
let guardado: Map<string, string>;

beforeEach(() => {
  guardado = new Map();
  vi.stubGlobal('window', {
    localStorage: { getItem: (chave: string) => guardado.get(chave) ?? null },
  });
});

afterEach(() => vi.unstubAllGlobals());

describe('isWorkbenchEnabled', () => {
  it('liga pelo override local quando a casca nova esta desligada', () => {
    guardado.set(UPGRADE_FLAG_STORAGE_KEY, '0');
    guardado.set(WORKBENCH_FLAG_STORAGE_KEY, '1');
    expect(isWorkbenchEnabled()).toBe(true);
  });

  // D-599: com as duas flags ligadas, o editor pegava o layout Workbench sem o
  // provider dos paineis e quebrava ao abrir um corte.
  it('fica desligada sempre que a casca nova esta ligada', () => {
    guardado.set(UPGRADE_FLAG_STORAGE_KEY, '1');
    guardado.set(WORKBENCH_FLAG_STORAGE_KEY, '1');
    expect(isWorkbenchEnabled()).toBe(false);
  });
});
