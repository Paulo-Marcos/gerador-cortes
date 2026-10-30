import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { MudancasDoCorte, type DiffDoCorte } from '../MudancasDoCorte';

// D-999: no "Por que este corte?", o que o operador mudou na proposta toma o
// lugar do voto. O texto de cada mudança vem pronto do backend.
const html = (diff: DiffDoCorte | undefined) => renderToStaticMarkup(<MudancasDoCorte diff={diff} />);

describe('MudancasDoCorte', () => {
  it('lista as mudanças na ordem que o backend mandou', () => {
    const saida = html({
      situacao: 'com_snapshot',
      mudancas: [
        { tipo: 'inicio_esticado', valor: 12, descricao: 'Começo esticado em 12 s' },
        { tipo: 'titulo_trocado', valor: 1, descricao: 'Título trocado' },
      ],
    });
    expect(saida).toContain('O que você mudou');
    expect(saida.indexOf('Começo esticado em 12 s')).toBeLessThan(saida.indexOf('Título trocado'));
  });

  it('proposta intacta diz que nada mudou', () => {
    expect(html({ situacao: 'com_snapshot', mudancas: [] })).toContain(
      'Nada: o corte segue a proposta da IA.',
    );
  });

  it('corte sem proposta guardada não inventa comparação', () => {
    expect(html({ situacao: 'sem_proposta_ia', mudancas: [] })).toContain(
      'Não há proposta da IA guardada para comparar.',
    );
  });

  it('sem telemetria carregada não desenha nada', () => {
    expect(html(undefined)).toBe('');
  });
});
