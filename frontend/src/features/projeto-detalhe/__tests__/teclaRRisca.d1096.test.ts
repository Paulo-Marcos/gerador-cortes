import { describe, expect, it } from 'vitest';
import type { StatusCorte } from '@/types/models';
import * as confirmacoes from '@/features/editor/regeracaoConfirmacao';
import * as hooksDoCorte from '@/features/editor/useCortes';
import { acaoDaTeclaNaLinha } from '../cortesDoWorkspace';

// D-1096: o R da linha risca, e o "Excluir de vez" saiu do app (D-1082).

describe('a tecla R na linha do Workspace (D-1096)', () => {
  it.each<StatusCorte>(['proposto', 'aprovado', 'processado', 'rejeitado'])('R risca o corte %s', (status) => {
    expect(acaoDaTeclaNaLinha('r', status)).toBe('riscar');
    expect(acaoDaTeclaNaLinha('R', status)).toBe('riscar');
  });

  it('sem corte carregado, R não faz nada', () => {
    expect(acaoDaTeclaNaLinha('r', undefined)).toBeNull();
  });
});

describe('o excluir de vez saiu do app (D-1096)', () => {
  it('não há mais o diálogo de excluir o corte', () => {
    expect('confirmacaoExcluirCorte' in confirmacoes).toBe(false);
  });

  it('nem o hook que apagava o corte', () => {
    expect('useDeletarCorte' in hooksDoCorte).toBe(false);
  });
});
