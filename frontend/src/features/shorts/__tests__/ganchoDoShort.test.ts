import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  contarPalavras,
  DURACAO_MAX_SEG,
  DURACAO_MIN_SEG,
  DURACAO_PADRAO_SEG,
  duracaoEfetiva,
  duracaoNoShort,
  ganchoVisivelEm,
  MAX_CARACTERES,
  MAX_VARIACOES,
  PALAVRAS_MAX,
  PALAVRAS_MIN,
  recadoDoTom,
  REALCE_PADRAO,
  REALCES_DO_GANCHO,
  estiloDoRealce,
  realceValido,
  TAMANHO_MAX,
  TAMANHO_MIN,
  TAMANHO_PADRAO,
  tamanhoEfetivo,
  tomDoGancho,
  resumoDaAparenciaPadrao,
  temAparenciaPropria,
  LARGURA_MAX,
  LARGURA_MIN,
  LARGURA_PADRAO,
  lugarArrastado,
  lugarEfetivo,
  POSICAO_X_MAX,
  POSICAO_X_MIN,
  POSICAO_X_PADRAO,
  POSICAO_Y_MAX,
  POSICAO_Y_PADRAO,
} from '../ganchoDoShort';

// D-600: a cascata do LUGAR — o trecho decide, senão o padrão do corte, senão o
// ponto fixo que o renderer usava antes desta demanda.
describe('lugarEfetivo', () => {
  it('sem nada decidido, é o lugar de sempre', () => {
    expect(lugarEfetivo(null, null)).toEqual({
      x: POSICAO_X_PADRAO,
      y: POSICAO_Y_PADRAO,
      largura: LARGURA_PADRAO,
    });
  });

  it('o do trecho vence o do padrão, campo a campo', () => {
    const lugar = lugarEfetivo({ y: 62 }, { x: 30, y: 18, largura: 50 });
    expect(lugar).toEqual({ x: 30, y: 62, largura: 50 });
  });

  it('zero é herança, e não o topo do quadro', () => {
    expect(lugarEfetivo({ x: 0, y: 0, largura: 0 }, { y: 70 }).y).toBe(70);
  });
});

describe('lugarArrastado', () => {
  const partida = { x: 50, y: 40, largura: 86 };

  it('soma o deslocamento em pontos percentuais do quadro', () => {
    expect(lugarArrastado(partida, 10, -15)).toEqual({ x: 60, y: 25, largura: 86 });
  });

  it('não deixa a caixa sair do quadro', () => {
    expect(lugarArrastado(partida, 999, 999)).toEqual({
      x: POSICAO_X_MAX,
      y: POSICAO_Y_MAX,
      largura: 86,
    });
    expect(lugarArrastado(partida, -999, 0).x).toBe(POSICAO_X_MIN);
  });

  it('arrastar até o topo não vira o padrão no meio do gesto', () => {
    // Zero é herança em todo o resto da tela, mas aqui seria a caixa pulando de
    // volta para os 18% na mão do operador.
    expect(lugarArrastado(partida, 0, -999).y).toBeGreaterThan(0);
    expect(lugarArrastado(partida, 0, -999).y).toBeLessThan(1);
  });
});

describe('temAparenciaPropria', () => {
  it('tudo vazio é herança do corte — as opções ficam escondidas', () => {
    expect(temAparenciaPropria({ gancho_cor: '', gancho_realce: '', gancho_ate_seg: 0 })).toBe(false);
    expect(temAparenciaPropria({})).toBe(false);
  });

  it('um campo próprio basta para abrir as opções', () => {
    expect(temAparenciaPropria({ gancho_cor: '#facc15' })).toBe(true);
    expect(temAparenciaPropria({ gancho_realce: 'caixa' })).toBe(true);
    expect(temAparenciaPropria({ gancho_ate_seg: 3 })).toBe(true);
  });
});

describe('resumoDaAparenciaPadrao', () => {
  it('sem padrão no corte, descreve o default do render', () => {
    expect(resumoDaAparenciaPadrao(null)).toBe(
      `branco (padrão) · Véu · ${DURACAO_PADRAO_SEG.toFixed(1)}s`,
    );
  });

  it('com padrão, usa os nomes do catálogo', () => {
    expect(resumoDaAparenciaPadrao({ cor: '#facc15', realce: 'caixa', duracao: 3 })).toBe(
      'amarelo · Caixa · 3.0s',
    );
  });
});

describe('tamanhoEfetivo (D-594)', () => {
  it('ausente ou zero é o corpo de sempre', () => {
    expect(tamanhoEfetivo(undefined)).toBe(TAMANHO_PADRAO);
    expect(tamanhoEfetivo(0)).toBe(TAMANHO_PADRAO);
  });

  it('fica na faixa em que a frase ainda se lê', () => {
    expect(tamanhoEfetivo(9)).toBe(TAMANHO_MAX);
    expect(tamanhoEfetivo(0.2)).toBe(TAMANHO_MIN);
    expect(tamanhoEfetivo(1.2)).toBe(1.2);
  });
});

const DOMINIO_DO_BACKEND = resolve(
  __dirname,
  '../../../../../backend/app/domain/short/gancho_short.py',
);

// A tela só pode prometer o que o render entrega. Como os projetos não
// compartilham módulo, as constantes são cópias — e é este bloco que impede que
// uma ponta mude sozinha e a prévia passe a mentir sobre o resultado.
describe('acordo com o domínio do backend', () => {
  const fonte = readFileSync(DOMINIO_DO_BACKEND, 'utf-8');

  function numeroDoDominio(nome: string): number {
    const encontrado = new RegExp(`^${nome}\\s*=\\s*([\\d.]+)`, 'm').exec(fonte);
    expect(encontrado, `${nome} sumiu do domínio do backend`).not.toBeNull();
    return Number(encontrado?.[1]);
  }

  it.each([
    ['PALAVRAS_MIN', PALAVRAS_MIN],
    ['PALAVRAS_MAX', PALAVRAS_MAX],
    ['MAX_CARACTERES', MAX_CARACTERES],
    ['DURACAO_PADRAO_SEG', DURACAO_PADRAO_SEG],
    ['DURACAO_MIN_SEG', DURACAO_MIN_SEG],
    ['DURACAO_MAX_SEG', DURACAO_MAX_SEG],
    ['MAX_VARIACOES', MAX_VARIACOES],
    ['TAMANHO_PADRAO', TAMANHO_PADRAO],
    ['TAMANHO_MIN', TAMANHO_MIN],
    ['TAMANHO_MAX', TAMANHO_MAX],
    // D-600: o lugar do gancho é a terceira cópia que precisa concordar — a
    // prévia é onde o operador ARRASTA, e ela só vale como prova se os limites
    // do arraste forem os mesmos que o backend aceita.
    ['POSICAO_X_PADRAO', POSICAO_X_PADRAO],
    ['POSICAO_Y_PADRAO', POSICAO_Y_PADRAO],
    ['LARGURA_PADRAO', LARGURA_PADRAO],
    ['POSICAO_X_MIN', POSICAO_X_MIN],
    ['POSICAO_X_MAX', POSICAO_X_MAX],
    ['POSICAO_Y_MAX', POSICAO_Y_MAX],
    ['LARGURA_MIN', LARGURA_MIN],
    ['LARGURA_MAX', LARGURA_MAX],
  ])('%s é o mesmo dos dois lados', (nome, naTela) => {
    expect(numeroDoDominio(nome)).toBe(naTela);
  });

  // D-581: o catálogo de realces também é cópia. Se o backend ganhar ou perder
  // um, a tela precisa cair aqui em vez de oferecer um destaque que o render
  // não sabe desenhar — ou esconder um que ele sabe.
  //
  // Compara como CONJUNTO, e não como sequência: a ordem do backend é uma
  // tupla de validade, e a da tela é a ordem em que os realces são OFERECIDOS
  // (do mais seguro ao mais arriscado). Exigir a mesma sequência amarraria uma
  // decisão de apresentação a uma de domínio.
  it('os realces são os mesmos dos dois lados', () => {
    const bloco = /^REALCES\s*=\s*\(([^)]*)\)/m.exec(fonte);
    expect(bloco, 'REALCES sumiu do domínio do backend').not.toBeNull();
    const noBackend = [...(bloco?.[1] ?? '').matchAll(/REALCE_([A-Z]+)/g)].map((m) =>
      m[1].toLowerCase(),
    );
    expect(noBackend.slice().sort()).toEqual(
      REALCES_DO_GANCHO.map((r) => r.id)
        .slice()
        .sort(),
    );
  });

  it('o realce padrão é o mesmo dos dois lados', () => {
    const encontrado = /^REALCE_PADRAO\s*=\s*REALCE_([A-Z]+)/m.exec(fonte);
    expect(encontrado?.[1].toLowerCase()).toBe(REALCE_PADRAO);
  });
});

describe('realceValido', () => {
  it('aceita os do catálogo', () => {
    expect(realceValido('caixa')).toBe('caixa');
    expect(realceValido('CONTORNO')).toBe('contorno');
  });

  it('degrada em vez de quebrar', () => {
    // Um short gravado com um realce que saiu do catálogo cai no padrão — como
    // o backend faz. Levantar aqui derrubaria a tela por causa de uma linha
    // antiga do banco.
    expect(realceValido('roxo-neon')).toBe(REALCE_PADRAO);
    expect(realceValido('')).toBe(REALCE_PADRAO);
    expect(realceValido(null)).toBe(REALCE_PADRAO);
  });
});

describe('estiloDoRealce', () => {
  it('só o véu desenha o degradê de topo', () => {
    expect(estiloDoRealce('veu', 40).veu).toBe(true);
    for (const id of ['caixa', 'contorno', 'sombra', 'nenhum']) {
      expect(estiloDoRealce(id, 40).veu).toBe(false);
    }
  });

  it('a espessura do contorno sai do corpo, não de um pixel fixo', () => {
    // Um contorno de 6px é halo num quadro de 1920 e mancha numa prévia de
    // 300px — foi por não derivar do corpo que a legenda mostrou anos um
    // tamanho que o arquivo não tinha (D-568).
    const pequeno = estiloDoRealce('contorno', 20).texto.WebkitTextStroke;
    const grande = estiloDoRealce('contorno', 96).texto.WebkitTextStroke;
    expect(pequeno).not.toBe(grande);
  });

  it('"nenhum" não desenha nada — a cor é que separa', () => {
    expect(estiloDoRealce('nenhum', 40).texto).toEqual({});
  });
});

describe('contarPalavras', () => {
  it('ignora espaço extra', () => {
    expect(contarPalavras('  ninguem   te  conta  isso ')).toBe(4);
  });

  it('texto em branco não tem palavra', () => {
    expect(contarPalavras('   ')).toBe(0);
  });
});

describe('tomDoGancho', () => {
  it('sem texto é vazio, não erro — short sem gancho é o caso comum', () => {
    expect(tomDoGancho('')).toBe('vazio');
    expect(tomDoGancho('  ')).toBe('vazio');
  });

  it('abaixo da faixa é curto', () => {
    expect(tomDoGancho('o erro')).toBe('curto');
  });

  it('dentro da faixa é ideal', () => {
    expect(tomDoGancho('o erro que todo mundo comete')).toBe('ideal');
  });

  it('acima da faixa é longo — mas continua salvável', () => {
    expect(tomDoGancho('uma dois tres quatro cinco seis sete oito')).toBe('longo');
  });

  it('todo tom tem um recado escrito', () => {
    for (const tom of ['vazio', 'curto', 'ideal', 'longo'] as const) {
      expect(recadoDoTom(tom).length).toBeGreaterThan(0);
    }
  });
});

describe('duracaoEfetiva', () => {
  it('valor útil passa intacto', () => {
    expect(duracaoEfetiva(3)).toBe(3);
  });

  it('curto demais sobe para o mínimo', () => {
    expect(duracaoEfetiva(0.2)).toBe(DURACAO_MIN_SEG);
  });

  it('longo demais desce para o máximo', () => {
    expect(duracaoEfetiva(30)).toBe(DURACAO_MAX_SEG);
  });

  it.each([null, undefined, 0, Number.NaN])('valor ilegível (%s) cai no padrão', (torto) => {
    expect(duracaoEfetiva(torto as number | null | undefined)).toBe(DURACAO_PADRAO_SEG);
  });
});

describe('duracaoNoShort', () => {
  it('não ultrapassa a duração do trecho', () => {
    expect(duracaoNoShort(5, 3)).toBe(3);
  });

  it('trecho longo não estica o gancho', () => {
    expect(duracaoNoShort(2.5, 40)).toBe(2.5);
  });

  it('sem duração conhecida mantém a pedida', () => {
    expect(duracaoNoShort(2.5, 0)).toBe(2.5);
  });
});

describe('ganchoVisivelEm', () => {
  it('está em tela na abertura', () => {
    expect(ganchoVisivelEm(0, 2.5, 30)).toBe(true);
    expect(ganchoVisivelEm(2.4, 2.5, 30)).toBe(true);
  });

  it('some quando o tempo acaba', () => {
    expect(ganchoVisivelEm(2.5, 2.5, 30)).toBe(false);
    expect(ganchoVisivelEm(10, 2.5, 30)).toBe(false);
  });

  it('antes do início do trecho não há gancho', () => {
    expect(ganchoVisivelEm(-1, 2.5, 30)).toBe(false);
  });
});
