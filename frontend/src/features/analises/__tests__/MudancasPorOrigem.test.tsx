import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { MOTIVOS_APAGADO } from '@/features/editor/motivoApagado';
import { MudancasPorOrigem } from '../MudancasPorOrigem';
import { resumirApagados } from '../analisesFormat';

// D-999: a aba Proposta × Final soma "o que você mudou" por origem da proposta.
const porTipo = {
  inicio_esticado: 3,
  inicio_encurtado: 1,
  fim_esticado: 0,
  fim_encurtado: 2,
  titulo_trocado: 4,
  trechos_acrescentados: 5,
  trechos_desfeitos: 6,
};
const semApagado = { total: 0, por_motivo: { repetido: 0, sem_motivo: 0 } };

describe('MudancasPorOrigem', () => {
  it('uma linha por origem, com esticar e encurtar lado a lado', () => {
    const html = renderToStaticMarkup(
      <MudancasPorOrigem
        grupos={[
          {
            origem: 'claude',
            cortes: 9,
            sem_mudanca: 2,
            por_tipo: porTipo,
            apagados: { total: 2, por_motivo: { repetido: 1, sem_motivo: 1 } },
          },
          { origem: 'gemini', cortes: 1, sem_mudanca: 1, por_tipo: {}, apagados: semApagado },
        ]}
      />,
    );
    expect(html).toContain('O que você mudou, por origem');
    expect(html).toContain('>claude<');
    expect(html).toContain('>3 / 1<');
    expect(html).toContain('>5 / 6<');
    expect(html).toContain('Repete outro corte 1 · sem motivo 1');
    expect(html).toContain('>gemini<');
  });

  it('sem nenhuma origem não desenha o quadro', () => {
    expect(renderToStaticMarkup(<MudancasPorOrigem grupos={[]} />)).toBe('');
  });
});

describe('resumirApagados', () => {
  it('só os motivos que aconteceram, com o rótulo da tela', () => {
    expect(resumirApagados({ tema_fraco: 2, repetido: 0, sem_motivo: 1 }, MOTIVOS_APAGADO)).toBe(
      'Tema não rende 2 · sem motivo 1',
    );
  });

  it('nenhum apagado vira traço', () => {
    expect(resumirApagados({ repetido: 0 }, MOTIVOS_APAGADO)).toBe('—');
  });
});
