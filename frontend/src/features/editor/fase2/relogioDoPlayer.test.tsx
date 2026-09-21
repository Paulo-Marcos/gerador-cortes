import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ComTempoDoPlayer, criarRelogioDoPlayer } from './relogioDoPlayer';

// D-657: o relógio que tira o tempo do player do estado da página. O que ele
// evita — a página inteira re-renderizando a cada frame — só aparece com
// renderizações repetidas, e este vitest roda em `node` sem DOM; essa prova
// foi feita no navegador (contador de renders antes e depois). Aqui fica o
// contrato do relógio em si.

describe('relógio do player (D-657)', () => {
  it('guarda o tempo e avisa quem assinou', () => {
    const relogio = criarRelogioDoPlayer();
    const avisos: number[] = [];
    relogio.assinar(() => avisos.push(relogio.agora()));

    relogio.marcar(1.5);
    relogio.marcar(2);

    expect(relogio.agora()).toBe(2);
    expect(avisos).toEqual([1.5, 2]);
  });

  it('o mesmo tempo de novo não acorda ninguém', () => {
    const relogio = criarRelogioDoPlayer(3);
    let avisos = 0;
    relogio.assinar(() => avisos++);

    relogio.marcar(3);

    expect(avisos).toBe(0);
  });

  it('quem cancelou a assinatura para de ouvir', () => {
    const relogio = criarRelogioDoPlayer();
    let avisos = 0;
    const cancelar = relogio.assinar(() => avisos++);

    cancelar();
    relogio.marcar(1);

    expect(avisos).toBe(0);
  });

  it('entrega o tempo atual a quem desenha', () => {
    const relogio = criarRelogioDoPlayer(12.5);

    const html = renderToStaticMarkup(
      <ComTempoDoPlayer relogio={relogio}>{(t) => <span>{t}</span>}</ComTempoDoPlayer>,
    );

    expect(html).toBe('<span>12.5</span>');
  });
});
