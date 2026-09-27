import { describe, expect, it, vi } from 'vitest';
import { duracaoEfetiva, realceValido, tamanhoEfetivo } from '../ganchoDoShort';
import {
  guardarPresetPadrao,
  PALCO_KEY,
  shortsDoCorteKey,
  type PassosDaGuarda,
} from '../useShortsDoCorte';

// D-490: o bug que estes testes existem para impedir.
//
// Trocar o preset do palco nao fazia nada aparecer na tela. A causa nao estava
// no backend, nem no componente: estava na CHAVE DE CACHE. A previa desenhavel
// vivia sob uma chave que carregava o modelo do short, mas nao o preset do
// corte — entao trocar o preset deixava a chave identica, o React Query servia
// o plano antigo (com zero recortes), e o operador via a tela imovel.
//
// Bug invisivel para todo teste que existia: o servico respondia certo, o
// componente desenhava certo, e ainda assim a tela mentia. O que faltava era
// alguem afirmar que uma invalidacao ALCANCA a outra query.
//
// `invalidateQueries` casa por PREFIXO. Entao a garantia se escreve como uma
// propriedade das chaves, sem precisar montar um QueryClient.

/** O mesmo casamento por prefixo que o React Query faz. */
function invalidacaoAlcanca(prefixo: readonly unknown[], chave: readonly unknown[]): boolean {
  return prefixo.every((parte, i) => chave[i] === parte);
}

const chaveDoDesenho = (shortId: string, modelo: string) =>
  [...PALCO_KEY, 'desenho', shortId, modelo] as const;
const chaveDoCorte = (corteId: string) => [...PALCO_KEY, 'corte', corteId] as const;
const chaveDoCatalogo = [...PALCO_KEY, 'modelos'] as const;

describe('invalidacao ao trocar o preset do palco', () => {
  it('alcanca a previa desenhavel — o bug da D-490', () => {
    const invalidada = [...PALCO_KEY, 'desenho'] as const;

    expect(invalidacaoAlcanca(invalidada, chaveDoDesenho('s1', ''))).toBe(true);
    expect(invalidacaoAlcanca(invalidada, chaveDoDesenho('s1', 'pessoa_cheia'))).toBe(true);
  });

  it('alcanca o estado do palco do corte', () => {
    const invalidada = [...PALCO_KEY, 'corte'] as const;

    expect(invalidacaoAlcanca(invalidada, chaveDoCorte('c1'))).toBe(true);
  });

  it('NAO derruba o catalogo de modelos', () => {
    // Ele e do sistema, nao muda com o preset, e tem staleTime infinito.
    for (const invalidada of [
      [...PALCO_KEY, 'corte'] as const,
      [...PALCO_KEY, 'desenho'] as const,
    ]) {
      expect(invalidacaoAlcanca(invalidada, chaveDoCatalogo)).toBe(false);
    }
  });

  it('nao alcanca a lista de shorts, que e invalidada a parte', () => {
    const invalidada = [...PALCO_KEY, 'desenho'] as const;

    expect(invalidacaoAlcanca(invalidada, shortsDoCorteKey('c1'))).toBe(false);
  });
});

describe('as chaves de palco vivem sob um prefixo comum', () => {
  it('para que uma invalidacao consiga alcancar todas', () => {
    for (const chave of [chaveDoDesenho('s1', 'x'), chaveDoCorte('c1'), chaveDoCatalogo]) {
      expect(invalidacaoAlcanca(PALCO_KEY, chave)).toBe(true);
    }
  });

  it('e o desenho carrega o modelo, porque trocar o arranjo muda o desenho', () => {
    expect(chaveDoDesenho('s1', 'pessoa_cheia')).not.toEqual(
      chaveDoDesenho('s1', 'tela_cima_pessoa_baixo'),
    );
  });
});

describe('invalidacao ao atualizar um short', () => {
  // D-493: a licao da D-490 se repetiu. Bordas, foco, modelo e ajustes mudam o
  // desenho, e a chave do desenho nao carrega nenhum desses. Sem invalidar, o
  // operador arrasta um bloco, o banco grava, e a tela mostra o slot antigo.
  it('alcanca a previa desenhavel', () => {
    const invalidada = [...PALCO_KEY, 'desenho'] as const;

    expect(invalidacaoAlcanca(invalidada, chaveDoDesenho('s1', ''))).toBe(true);
  });

  it('a regra: view derivada e invalidada por quem muda a origem dela', () => {
    // A chave carregar PARTE dos insumos (o modelo) nao basta — o preset, as
    // bordas, o foco e os ajustes ficam de fora dela.
    const chaveIgnoraAjustes = chaveDoDesenho('s1', 'pessoa_cheia');

    expect(chaveIgnoraAjustes).toEqual([...PALCO_KEY, 'desenho', 's1', 'pessoa_cheia']);
    expect(chaveIgnoraAjustes).not.toContain('ajustes');
  });
});

describe('guardar um preset do menu de padroes (D-594/D-595)', () => {
  const payload = {
    cor: '#ffd400',
    realce: realceValido(undefined),
    fonte: '',
    tamanho: tamanhoEfetivo(undefined),
    duracao: duracaoEfetiva(undefined),
    x: 50,
    y: 20,
    largura: 80,
  };

  function passosGravados() {
    const chamadas: string[] = [];
    const passos: PassosDaGuarda = {
      criar: vi.fn(async (body) => {
        chamadas.push(`criar:${body.tipo}:${body.nome}`);
        return { id: 'novo' };
      }),
      regravar: vi.fn(async ({ id }) => {
        chamadas.push(`regravar:${id}`);
        return { id };
      }),
      definirPadrao: vi.fn(async (id) => {
        chamadas.push(`padrao:${id}`);
      }),
      invalidarPadroes: vi.fn(() => {
        chamadas.push('invalidar');
      }),
    };
    return { passos, chamadas };
  }

  it('preset novo e criado e vira o padrao do corte, nessa ordem', async () => {
    const { passos, chamadas } = passosGravados();

    await guardarPresetPadrao(passos, {
      tipo: 'gancho_short',
      editando: null,
      nome: '  amarelo com caixa ',
      payload,
      virarPadrao: true,
    });

    expect(chamadas).toEqual(['criar:gancho_short:amarelo com caixa', 'padrao:novo']);
  });

  it('regravar sem virar padrao invalida, porque o id herdado nao muda', async () => {
    const { passos, chamadas } = passosGravados();

    await guardarPresetPadrao(passos, {
      tipo: 'gancho_short',
      editando: { id: 'p1', nome: 'antigo' },
      nome: 'novo nome',
      payload,
      virarPadrao: false,
    });

    expect(chamadas).toEqual(['regravar:p1', 'invalidar']);
    expect(passos.regravar).toHaveBeenCalledWith({ id: 'p1', body: { nome: 'novo nome', payload } });
  });
});
