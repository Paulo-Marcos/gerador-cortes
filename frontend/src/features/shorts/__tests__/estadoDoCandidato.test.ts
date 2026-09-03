import { describe, expect, it } from 'vitest';
import { APARENCIA, notaVisivel, planoDeAcoes, tomDaNota } from '../estadoDoCandidato';
import type { ShortSugerido, StatusShort } from '../shortsApi';

// D-492: a hierarquia da tela, testada como regra.
//
// O card tinha oito botoes de peso identico, disponiveis o tempo todo. Isso nao
// e "muitas opcoes" — e a tela se recusando a ter opiniao, e empurrando para o
// operador a tarefa de reconstruir a ordem de cabeca em cada card.

function short(over: Partial<ShortSugerido> = {}): ShortSugerido {
  return {
    id: 's1',
    corte_id: 'c1',
    numero: 1,
    titulo: 'T',
    gancho: 'g',
    inicio_seg: 10,
    fim_seg: 40,
    duracao_seg: 30,
    score: 8.5,
    justificativa: 'j',
    status: 'sugerido',
    foco_x: null,
    foco_efetivo: 0.5,
    arquivo_short_path: '',
    arquivo_previa_path: '',
    arranjo_palco: '',
    janela_cheia: '',
    origem: 'ia',
    palco_preset: '',
    moldura: 'palco',
    ajustes_palco: {},
    recortes_palco: {},
    fundo_palco: '',
    cenas: [],
    ...over,
  };
}

const TODOS: StatusShort[] = ['sugerido', 'aprovado', 'rejeitado', 'renderizado'];

describe('planoDeAcoes', () => {
  it('nunca oferece mais de UMA acao principal', () => {
    for (const status of TODOS) {
      const plano = planoDeAcoes(short({ status }), false);

      expect(typeof plano.principal === 'string' || plano.principal === null).toBe(true);
    }
  });

  it('em sugerido, decidir vem antes de produzir', () => {
    const plano = planoDeAcoes(short({ status: 'sugerido' }), false);

    expect(plano.principal).toBe('aprovar');
    expect([...plano.secundarias, ...plano.noMenu]).not.toContain('previa');
    expect([...plano.secundarias, ...plano.noMenu]).not.toContain('finalizar');
  });

  it('em aprovado sem previa, o passo barato e o destacado', () => {
    // Previa e reversivel; finalizar custa a passada boa.
    const plano = planoDeAcoes(short({ status: 'aprovado' }), false);

    expect(plano.principal).toBe('previa');
    expect(plano.secundarias).toContain('finalizar');
  });

  it('com previa pronta, finalizar assume o destaque', () => {
    const plano = planoDeAcoes(
      short({ status: 'aprovado', arquivo_previa_path: 'p/previa.mp4' }),
      false,
    );

    expect(plano.principal).toBe('finalizar');
    expect(plano.secundarias).toContain('refazerPrevia');
  });

  it('durante o render nao ha acao de producao nenhuma', () => {
    // Oferecer "finalizar" com um render em curso e oferecer um 409.
    const plano = planoDeAcoes(short({ status: 'aprovado' }), true);

    expect(plano.principal).toBeNull();
    expect([...plano.secundarias, ...plano.noMenu]).toEqual([]);
  });

  it('rejeitado tem um unico caminho, e e o de volta', () => {
    const plano = planoDeAcoes(short({ status: 'rejeitado' }), false);

    expect(plano.principal).toBeNull();
    expect([...plano.secundarias, ...plano.noMenu]).toEqual(['voltar']);
  });

  it('renderizado nao empurra refazer para a frente', () => {
    // Ha arquivo; refazer e excecao, e excecao vive no menu.
    const plano = planoDeAcoes(short({ status: 'renderizado' }), false);

    expect(plano.principal).toBeNull();
    expect(plano.noMenu).toContain('refazerFinal');
    expect(plano.secundarias).toEqual([]);
  });

  it('nenhuma acao aparece em dois lugares ao mesmo tempo', () => {
    for (const status of TODOS) {
      const plano = planoDeAcoes(short({ status }), false);
      const todas = [plano.principal, ...plano.secundarias, ...plano.noMenu].filter(Boolean);

      expect(new Set(todas).size).toBe(todas.length);
    }
  });
});

describe('APARENCIA', () => {
  it('cobre os quatro estagios', () => {
    for (const status of TODOS) expect(APARENCIA[status]).toBeTruthy();
  });

  it('rejeitado e neutro, nao erro', () => {
    // Foi uma decisao registrada, nao uma falha. Vermelho diria o contrario.
    expect(APARENCIA.rejeitado.tom).toBe('neutral');
  });

  it('renderizado e sucesso, porque ha arquivo', () => {
    expect(APARENCIA.renderizado.tom).toBe('success');
  });
});

describe('nota', () => {
  it('manual nao mostra 0.0', () => {
    // Mostrar zero o poria no fundo de uma fila de que ele nao participa.
    expect(notaVisivel(short({ origem: 'manual', score: 0 }))).toBe('—');
    expect(tomDaNota(short({ origem: 'manual', score: 0 }))).toBe('neutral');
  });

  it('a faixa alta se destaca do resto', () => {
    expect(tomDaNota(short({ score: 9.2 }))).toBe('success');
    expect(tomDaNota(short({ score: 7 }))).toBe('accent');
    expect(tomDaNota(short({ score: 4 }))).toBe('neutral');
  });

  it('a nota da IA sai com uma casa', () => {
    expect(notaVisivel(short({ score: 9 }))).toBe('9.0');
  });
});
