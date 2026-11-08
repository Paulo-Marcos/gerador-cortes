import { describe, expect, it } from 'vitest';
import type { CenaRemotion } from '@/types/models';
import {
  ORIGENS,
  contarQuantasFaltam,
  criarCenaManual,
  marcarSeReescrita,
  origemNoPlano,
  origensDoPlano,
  riscarCena,
  trazerCenaDeVolta,
  validarSobreposicoesDoPlano,
} from '../planoDasCenas';

// D-1070: o plano de cenas da Pós. Cada cena diz de onde veio; a riscada fica no plano,
// fora do render; a cena que o operador escreveu vira manual.

const cena = (campos: Partial<CenaRemotion> = {}) =>
  ({ tipo: 'enfase', inicio: 10, fim: 15, texto: 'Tese', ...campos }) as CenaRemotion;

describe('a origem de cada cena no plano', () => {
  it('sem aviso, a cena da IA está conferida', () => {
    expect(origemNoPlano(cena(), [])).toBe('conferida');
  });

  it('com aviso da conferência (D-1018), pede conferência', () => {
    expect(origemNoPlano(cena(), ['Sem fonte.'])).toBe('conferir');
  });

  it('a manual é manual mesmo com aviso: a conferência confere o que a IA afirmou', () => {
    expect(origemNoPlano(cena({ manual: true }), ['Sem fonte.'])).toBe('manual');
  });

  it('a riscada é riscada, mesmo manual e com aviso', () => {
    expect(origemNoPlano(cena({ riscada: true, manual: true }), ['Sem fonte.'])).toBe('riscada');
  });

  it('casa o aviso pela cena gravada (tipo + início), como os avisos de hoje', () => {
    const avisos = [{ tipo: 'enfase', inicio: 10, mensagem: 'desta' }];
    expect(origensDoPlano([cena(), cena({ inicio: 30, fim: 35 })], avisos)).toEqual(['conferir', 'conferida']);
  });
});

describe('quantas faltam conferir', () => {
  it('conta só as que pedem conferência', () => {
    expect(contarQuantasFaltam(['conferida', 'conferir', 'manual', 'riscada', 'conferir'])).toBe(2);
  });

  it('riscar a cena que pedia conferência tira ela da conta', () => {
    const avisos = [{ tipo: 'enfase', inicio: 10, mensagem: 'Sem fonte.' }];
    expect(contarQuantasFaltam(origensDoPlano([riscarCena(cena())], avisos))).toBe(0);
  });
});

describe('a cena vira manual quando o operador reescreve o conteúdo', () => {
  it.each([
    ['texto', { texto: 'Outra tese' }],
    ['tipo', { tipo: 'citacao_autor' as const }],
    ['subtexto', { subtexto: 'novo' }],
    ['contexto', { contexto: 'novo' }],
    ['rotuloA', { rotuloA: 'ANTES' }],
    ['nome curto', { nome_curto: 'Marx' }],
    ['número', { numero: '50x' }],
    ['itens', { itens: [{ titulo: 'um' }] }],
  ])('mudar %s marca', (_campo, mudanca) => {
    expect(marcarSeReescrita(cena(), { ...cena(), ...mudanca }).manual).toBe(true);
  });

  it.each([
    ['o tempo', { inicio: 11, fim: 16 }],
    ['o visual', { sombra_nivel: 'forte' as const, layout_card: 'horizontal' as const, modelo_cena: 'card' as const }],
    ['a posição na tela', { layout_card_zone: { x: 1, y: 2, w: 3, h: 4 } } as Partial<CenaRemotion>],
    ['a fonte (conferir não é reescrever)', { fonte: 'IBGE' }],
    ['o retrato', { retrato_url: '/api/retratos/marx' }],
  ])('mudar %s não marca', (_campo, mudanca) => {
    expect(marcarSeReescrita(cena(), { ...cena(), ...mudanca })).not.toHaveProperty('manual');
  });

  it('nada desmarca: voltar o texto ao original segue manual', () => {
    const manual = marcarSeReescrita(cena(), cena({ texto: 'Outra' }));
    expect(marcarSeReescrita(manual, { ...manual, texto: 'Tese' }).manual).toBe(true);
  });

  it('riscar e trazer de volta não desmarcam a manual', () => {
    const manual = cena({ manual: true });
    expect(riscarCena(manual).manual).toBe(true);
    expect(trazerCenaDeVolta(riscarCena(manual)).manual).toBe(true);
  });
});

describe('o Gerar manual', () => {
  it('cria a cena já manual, depois da última do plano', () => {
    const nova = criarCenaManual([cena({ inicio: 0, fim: 4 }), cena({ inicio: 8, fim: 12 })]);
    expect(nova).toMatchObject({ manual: true, inicio: 12, fim: 17, texto: 'Nova cena' });
    expect(origemNoPlano(nova, [])).toBe('manual');
  });

  it('sem cenas, começa no zero', () => {
    expect(criarCenaManual([])).toMatchObject({ inicio: 0, manual: true });
  });
});

describe('riscar em vez de excluir', () => {
  it('riscar só põe a marca: o resto da cena fica como estava', () => {
    expect(riscarCena(cena())).toEqual({ ...cena(), riscada: true });
  });

  it('trazer de volta tira a marca em vez de gravar false', () => {
    const devolvida = trazerCenaDeVolta(riscarCena(cena()));
    expect(devolvida).toEqual(cena());
    expect(devolvida).not.toHaveProperty('riscada');
  });

  it('a riscada não acusa sobreposição: ela não vai ao vídeo', () => {
    const plano = [cena({ inicio: 0, fim: 10 }), cena({ inicio: 5, fim: 12, riscada: true }), cena({ inicio: 20, fim: 25 })];
    expect([...validarSobreposicoesDoPlano(plano).overlappingIndices]).toEqual([]);
  });

  it('entre as que vão ao vídeo, aponta os índices do plano inteiro', () => {
    const plano = [cena({ inicio: 0, fim: 3, riscada: true }), cena({ inicio: 5, fim: 12 }), cena({ inicio: 10, fim: 14 })];
    expect([...validarSobreposicoesDoPlano(plano).overlappingIndices].sort()).toEqual([1, 2]);
  });
});

describe('o que a tela promete', () => {
  it('o rótulo da manual diz "manual · a IA não mexe": desde a D-1075 a regeração mantém a manual', () => {
    expect(ORIGENS.manual.rotulo).toBe('manual · a IA não mexe');
    expect(JSON.stringify(ORIGENS)).toContain('não mexe');
  });

  it('as quatro origens têm rótulo e legenda', () => {
    expect(Object.values(ORIGENS).map((o) => o.legenda)).toEqual(['da IA, conferida', 'pede conferência', 'manual, a IA não mexe', 'riscada']);
  });
});
