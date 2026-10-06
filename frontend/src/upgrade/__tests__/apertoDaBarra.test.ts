import { describe, expect, it, vi } from 'vitest';
import {
  ESPACADOR_MIN_PX,
  estaApertada,
  juntarNoMais,
  NIVEL_MAX,
  pecasNoAperto,
  proximoAperto,
  SEM_APERTO,
  type Aperto,
  type MedidaDaBarra,
} from '../apertoDaBarra';
import { SELETOR_MAX_PX, TRILHA_MIN_PX } from '../medidas';
import type { ScreenAction } from '../ScreenHeader';

// D-877: na Bancada a 1100 px a barra tem 888 px e o conteúdo pedia 1036 —
// a trilha ia a 0 e fila, tema e busca ficavam fora da tela. A barra agora
// cede em degraus: subtítulo, texto do canal, ações num "Mais".

describe('estaApertada', () => {
  it('com folga não está, mesmo com trilha curta', () => {
    expect(estaApertada({ folga: 20, trilha: 40, transbordo: 0 })).toBe(false);
  });

  it('sem folga, está quando algo passa da barra', () => {
    expect(estaApertada({ folga: 0, trilha: 300, transbordo: 1 })).toBe(true);
  });

  it('sem folga, está quando a trilha fica abaixo do piso', () => {
    expect(estaApertada({ folga: 0, trilha: TRILHA_MIN_PX - 1, transbordo: 0 })).toBe(true);
    expect(estaApertada({ folga: 0, trilha: TRILHA_MIN_PX, transbordo: 0 })).toBe(false);
  });
});

describe('proximoAperto', () => {
  const apertada = (largura: number): MedidaDaBarra => ({ largura, folga: 0, trilha: 0, transbordo: 50 });
  const folgada = (largura: number): MedidaDaBarra => ({ largura, folga: 40, trilha: 300, transbordo: 0 });

  it('cede um degrau por passo e anota a largura de cada um', () => {
    let a: Aperto = SEM_APERTO;
    a = proximoAperto(a, apertada(888));
    a = proximoAperto(a, apertada(888));
    expect(a).toEqual({ nivel: 2, cedeuEm: [888, 888] });
  });

  it('para no último degrau: não há o que ceder depois do Mais', () => {
    const noTeto: Aperto = { nivel: NIVEL_MAX, cedeuEm: [800, 800, 800] };
    expect(proximoAperto(noTeto, apertada(700))).toBe(noTeto);
  });

  it('só devolve quando a barra fica mais larga do que quando cedeu', () => {
    const a: Aperto = { nivel: 2, cedeuEm: [1000, 900] };
    expect(proximoAperto(a, folgada(900))).toBe(a);
    expect(proximoAperto(a, folgada(901))).toEqual({ nivel: 1, cedeuEm: [1000] });
  });

  it('não pisca: devolver e voltar a apertar na mesma largura assenta', () => {
    let a: Aperto = { nivel: 1, cedeuEm: [900] };
    a = proximoAperto(a, folgada(950)); // devolve...
    a = proximoAperto(a, apertada(950)); // ...não coube, cede de novo em 950
    expect(proximoAperto(a, folgada(950))).toBe(a);
  });
});

describe('a Bancada medida em 04/10/2026', () => {
  // Larguras do navegador: histórico 55, seletor 240 (teto) + as setas ‹ ›
  // 66, Gerar bruto 110,
  // Excluir corte 117, busca/estado/fila/tema 30 cada, canal 94 com nome e 30
  // só o ícone, subtítulo 51, "⋯ Mais" 80, trilha inteira 450; gap 8, padding 24.
  const precisa = (nivel: number) => {
    const p = pecasNoAperto(nivel);
    const pecas = [55, SELETOR_MAX_PX + 66, 30, 30, 30, 30, p.canalComTexto ? 94 : 30];
    if (p.subtitulo) pecas.push(51);
    pecas.push(...(p.acoesNoMais ? [80] : [110, 117]));
    // + trilha e espaçador, que também levam gap
    return 24 + pecas.reduce((s, w) => s + w, 0) + (pecas.length + 1) * 8 + ESPACADOR_MIN_PX;
  };
  const medir = (largura: number, nivel: number): MedidaDaBarra => {
    const sobra = largura - precisa(nivel);
    return {
      largura,
      folga: Math.max(0, sobra - 450),
      trilha: Math.min(450, Math.max(0, sobra)),
      transbordo: Math.max(0, -sobra),
    };
  };
  const assentar = (largura: number) => {
    let a = SEM_APERTO;
    for (let passo = 0; passo < 10; passo++) {
      const b = proximoAperto(a, medir(largura, a.nivel));
      if (b === a) break;
      a = b;
    }
    return { nivel: a.nivel, ...medir(largura, a.nivel) };
  };

  it('a 1100 px de janela (barra 888) vai até o Mais e nada fica fora', () => {
    const r = assentar(888);
    expect(r.nivel).toBe(3);
    expect(r.transbordo).toBe(0);
    expect(r.trilha).toBeGreaterThanOrEqual(TRILHA_MIN_PX);
  });

  // O navegador confirmou os dois: trilha de 178 e 174 px.
  it('a 1240 px (barra 1028) saem o subtítulo e o texto do canal', () => {
    expect(assentar(1028)).toMatchObject({ nivel: 2, transbordo: 0, trilha: 178 });
  });

  it('a 1300 px (barra 1088) só o subtítulo sai', () => {
    expect(assentar(1088)).toMatchObject({ nivel: 1, transbordo: 0, trilha: 174 });
  });

  it('com folga de sobra, nada cede', () => {
    expect(assentar(1600)).toMatchObject({ nivel: 0, transbordo: 0 });
  });
});

describe('pecasNoAperto', () => {
  it('cede na ordem combinada: subtítulo, canal, ações', () => {
    expect([0, 1, 2, 3].map(pecasNoAperto)).toEqual([
      { subtitulo: true, canalComTexto: true, acoesNoMais: false },
      { subtitulo: false, canalComTexto: true, acoesNoMais: false },
      { subtitulo: false, canalComTexto: false, acoesNoMais: false },
      { subtitulo: false, canalComTexto: false, acoesNoMais: true },
    ]);
  });
});

describe('juntarNoMais', () => {
  it('junta as ações simples num "Mais", na ordem, com o clique de cada uma', () => {
    const gerar = vi.fn();
    const excluir = vi.fn();
    const [mais, ...resto] = juntarNoMais([
      { icone: 'scissors', texto: 'Gerar bruto', onClick: gerar },
      { icone: 'trash', texto: 'Excluir corte', onClick: excluir },
    ]);
    expect(resto).toEqual([]);
    expect(mais.texto).toBe('Mais');
    expect(mais.menu?.map((i) => [i.icon, i.label])).toEqual([
      ['scissors', 'Gerar bruto'],
      ['trash', 'Excluir corte'],
    ]);
    mais.menu?.[1].onClick?.();
    expect(excluir).toHaveBeenCalledOnce();
    expect(gerar).not.toHaveBeenCalled();
  });

  it('deixa de fora a ação forte, a de IA e um menu que já exista', () => {
    const forte: ScreenAction = { icone: 'check', texto: 'Aprovar', forte: true };
    const ia: ScreenAction = { icone: 'brain', texto: 'Analisar', ia: { emVoo: null, onGerar: vi.fn() } };
    const menu: ScreenAction = { icone: 'more-horizontal', texto: 'Outras', menu: [] };
    const juntas = juntarNoMais([forte, { icone: 'scissors', texto: 'A' }, ia, { icone: 'trash', texto: 'B' }, menu]);
    expect(juntas.map((a) => a.texto)).toEqual(['Aprovar', 'Analisar', 'Outras', 'Mais']);
    expect(juntas[3].menu?.map((i) => i.label)).toEqual(['A', 'B']);
  });

  it('com uma ação simples só, não junta: o Mais esconderia sem dar espaço', () => {
    const acoes: ScreenAction[] = [{ icone: 'layout-grid', texto: 'Prateleira' }];
    expect(juntarNoMais(acoes)).toBe(acoes);
  });
});
