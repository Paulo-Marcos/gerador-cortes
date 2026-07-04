import { describe, expect, it } from 'vitest';
import type { PadroesCompilados } from '@/lib/api';
import { eixosComOcorrencias, rotuloEixo } from '../thumbnailPadroes';

describe('rotuloEixo', () => {
  it('traduz eixos conhecidos', () => {
    expect(rotuloEixo('cenario')).toBe('Cenário');
    expect(rotuloEixo('luminosidade')).toBe('Luz');
  });

  it('mantém eixos desconhecidos como vieram', () => {
    expect(rotuloEixo('foo')).toBe('foo');
  });
});

describe('eixosComOcorrencias', () => {
  const padroes: PadroesCompilados = {
    total_melhores: 3,
    com_tags: 3,
    eixos: {
      cenario: [{ valor: 'tribunal', contagem: 2 }],
      paleta: [],
      luminosidade: [{ valor: 'chave-baixa', contagem: 3 }],
    },
  };

  it('lista só eixos com ocorrências, na ordem da skill, com rótulo', () => {
    const lista = eixosComOcorrencias(padroes);
    expect(lista.map((e) => e.eixo)).toEqual(['cenario', 'luminosidade']);
    expect(lista[0].rotulo).toBe('Cenário');
    expect(lista[0].ocorrencias[0].valor).toBe('tribunal');
  });

  it('devolve vazio quando não há padrões', () => {
    expect(eixosComOcorrencias(null)).toEqual([]);
  });
});
