import { describe, expect, it } from 'vitest';
import { linhaDeEmendas } from '../boletimTecnico';

// D-1027: a emenda que o boletim não achou no vídeo fica fora da conta, e a linha diz isso.

const base = { total: 12, com_som_dos_dois_lados: 1, acima_do_p99: 0, p99_da_fala: 0.04, itens: [] };

describe('linhaDeEmendas com emendas não localizadas', () => {
  it('avisa quantas ficaram sem posição certa', () => {
    expect(linhaDeEmendas({ ...base, nao_localizadas: 2 })).toBe(
      '12 emendas · 2 sem posição certa (fora da conta) · 1 com som dos dois lados · 0 com degrau acima do normal da fala',
    );
  });

  it('não menciona nada quando todas foram achadas', () => {
    expect(linhaDeEmendas({ ...base, nao_localizadas: 0 })).not.toContain('sem posição certa');
  });
});
