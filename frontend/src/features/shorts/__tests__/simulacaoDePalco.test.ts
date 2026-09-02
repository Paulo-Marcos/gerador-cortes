import { describe, expect, it } from 'vitest';
import {
  INICIAL,
  INTERVALO_MS,
  aoDescartar,
  aoMover,
  aoResponder,
  aoSoltar,
  type Ajustes,
} from '../simulacaoDePalco';

// D-500: o contrato do arraste ao vivo.
//
// O que se protege aqui NAO e a geometria — essa e do backend, e e por isso
// mesmo que ela nao aparece neste arquivo. O que se protege e quando chamar,
// quantas vezes, e qual resposta ainda tem o direito de pintar a tela.

const bloco = (x: number): Ajustes => ({ pessoa: { x, y: 0, w: 100, h: 100 } });

describe('aoMover', () => {
  it('a primeira mexida dispara na hora', () => {
    const passo = aoMover(INICIAL, bloco(1), 1000);

    expect(passo.disparar).toEqual(bloco(1));
    expect(passo.estado.emVoo).toBe(true);
  });

  it('nao dispara enquanto a anterior esta em voo', () => {
    // Sessenta eventos por segundo virariam sessenta requisicoes, e as ultimas
    // chegariam depois de o operador ja ter soltado.
    const primeiro = aoMover(INICIAL, bloco(1), 1000);
    const segundo = aoMover(primeiro.estado, bloco(2), 1000 + INTERVALO_MS * 2);

    expect(segundo.disparar).toBeNull();
  });

  it('nao dispara duas vezes dentro do intervalo', () => {
    const livre = { ...INICIAL, ultimaEm: 1000 };

    expect(aoMover(livre, bloco(2), 1000 + INTERVALO_MS - 1).disparar).toBeNull();
    expect(aoMover(livre, bloco(2), 1000 + INTERVALO_MS).disparar).toEqual(bloco(2));
  });

  it('o movimento segurado substitui o anterior', () => {
    // Estrangular nao pode virar acumular: posicoes intermediarias ja nao
    // interessam a ninguem quando o dedo passou delas.
    let estado = aoMover(INICIAL, bloco(1), 1000).estado;
    estado = aoMover(estado, bloco(2), 1010).estado;
    estado = aoMover(estado, bloco(9), 1020).estado;

    expect(estado.pendente).toEqual(bloco(9));
  });
});

describe('aoResponder', () => {
  it('o ultimo movimento da rajada nao se perde', () => {
    // Estrangular nao pode virar ignorar: o quadro que importa e o de onde o
    // dedo parou.
    let estado = aoMover(INICIAL, bloco(1), 1000).estado;
    estado = aoMover(estado, bloco(9), 1010).estado;

    const volta = aoResponder(estado, estado.geracao, 1050);

    expect(volta.disparar).toEqual(bloco(9));
    expect(volta.estado.pendente).toBeNull();
  });

  it('sem nada guardado, a resposta so libera a vaga', () => {
    const estado = aoMover(INICIAL, bloco(1), 1000).estado;

    const volta = aoResponder(estado, estado.geracao, 1050);

    expect(volta.disparar).toBeNull();
    expect(volta.estado.emVoo).toBe(false);
  });

  it('resposta de um arraste ja encerrado nao pinta a tela', () => {
    // Sem isso, uma simulacao lenta repintaria o palco com um rascunho que o
    // operador ja abandonou: a divergencia silenciosa de novo, agora corrida.
    const emVoo = aoMover(INICIAL, bloco(1), 1000);
    const geracaoDela = emVoo.estado.geracao;
    const depois = aoSoltar(emVoo.estado);

    const volta = aoResponder(depois, geracaoDela, 1200);

    expect(volta.pintar).toBe(false);
    expect(volta.disparar).toBeNull();
  });

  it('resposta velha tampouco reabre a torneira', () => {
    // Deixar o `pendente` de um arraste morto sobreviver faria a proxima
    // resposta valida disparar uma posicao de outro gesto.
    let estado = aoMover(INICIAL, bloco(1), 1000).estado;
    const geracaoDela = estado.geracao;
    estado = aoMover(estado, bloco(9), 1010).estado;
    estado = aoSoltar(estado);

    const volta = aoResponder(estado, geracaoDela, 1050);

    expect(volta.disparar).toBeNull();
  });
});

describe('fim do arraste', () => {
  it('soltar nao apaga o desenho', () => {
    // Apagar no soltar faria o palco piscar de volta para a geometria antiga
    // durante o intervalo entre o PATCH e o refetch — o operador veria o
    // proprio ajuste ser desfeito e voltar.
    const estado = aoSoltar(aoMover(INICIAL, bloco(1), 1000).estado);

    expect(estado.geracao).toBeGreaterThan(INICIAL.geracao);
  });

  it('descartar tambem invalida o que estiver em voo', () => {
    const emVoo = aoMover(INICIAL, bloco(1), 1000);
    const depois = aoDescartar(emVoo.estado);

    expect(aoResponder(depois, emVoo.estado.geracao, 1200).pintar).toBe(false);
  });

  it('cada gesto ganha uma geracao propria', () => {
    const um = aoSoltar(INICIAL);
    const dois = aoSoltar(um);

    expect(new Set([INICIAL.geracao, um.geracao, dois.geracao]).size).toBe(3);
  });
});
