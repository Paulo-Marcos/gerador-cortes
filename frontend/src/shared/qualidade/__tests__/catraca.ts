// Motor das catracas de design da Sala escura (D-1115, E-069 H-06). As regras
// são as das outras catracas do projeto (cor solta D-849, piso de fonte D-859):
//
// - arquivo fora da linha de base que tenha ocorrência falha (nasce com teto 0);
// - arquivo da linha de base que ganha ocorrência além do teto falha;
// - arquivo que perdeu ocorrência falha até o teto ser baixado — e sai da
//   linha de base quando chegar a zero.
//
// A linha de base de cada catraca mora em `linhasDeBase/<nome>.json`: o
// caminho do arquivo e o teto de ocorrências. Só se enxerga o que o git
// rastreia (`git ls-files`): arquivo novo precisa de `git add` para ser medido.

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Gerado a partir do openapi.json; ninguém o edita à mão.
const GERADOS = new Set(['src/shared/api/contract.ts']);
const TESTES = /(__tests__\/|\.test\.tsx?$)/;

export type Contagem = Record<string, number>;

export interface Definicao {
  /** Nome do arquivo de linha de base e do `describe`. */
  nome: string;
  /** Uma frase: o que a catraca impede e o que usar no lugar. */
  porque: string;
  /** Arquivos que entram na medição (pelo caminho, relativo a `frontend/`). */
  alvo: RegExp;
  /** Conta as ocorrências de um arquivo. */
  contar: (texto: string, caminho: string) => number;
  /** Arquivos que o desenho do vídeo ou a definição do token isenta. Nomeados, e a lista não cresce. */
  isentos?: RegExp[];
  /** Entradas de prova do contador: texto e quantas ocorrências ele deve ver. */
  exemplos: [texto: string, esperado: number][];
}

export function arquivosRastreados(): string[] {
  const saida = execFileSync('git', ['ls-files', 'src', 'index.html'], { encoding: 'utf8', timeout: 60_000 });
  return saida.split('\n').filter((c) => c && !GERADOS.has(c) && !TESTES.test(c));
}

export function medir(def: Definicao): Contagem {
  const contagem: Contagem = {};
  for (const caminho of arquivosRastreados()) {
    if (!def.alvo.test(caminho) || def.isentos?.some((i) => i.test(caminho))) continue;
    const n = def.contar(readFileSync(caminho, 'utf8'), caminho);
    if (n > 0) contagem[caminho] = n;
  }
  return contagem;
}

export function lerLinhaDeBase(nome: string): Contagem {
  const arquivo = join(__dirname, 'linhasDeBase', `${nome}.json`);
  return JSON.parse(readFileSync(arquivo, 'utf8')) as Contagem;
}

export interface Veredito {
  novos: Contagem;
  cresceram: string[];
  desatualizadas: string[];
}

export function comparar(atual: Contagem, base: Contagem): Veredito {
  const novos = Object.fromEntries(Object.entries(atual).filter(([c]) => !(c in base)));
  const cresceram = Object.entries(base)
    .filter(([c, teto]) => (atual[c] ?? 0) > teto)
    .map(([c, teto]) => `${c}: ${atual[c]} > teto ${teto}`);
  const desatualizadas = Object.entries(base).flatMap(([c, teto]) => {
    const n = atual[c];
    if (n === undefined) return [`${c}: chegou a zero, mudou de nome ou sumiu — remova da linha de base`];
    if (n < teto) return [`${c}: caiu para ${n} — baixe o teto`];
    return [];
  });
  return { novos, cresceram, desatualizadas };
}

/** Registra os testes de uma catraca; cada arquivo `<nome>.test.ts` chama só isto. */
export function registrarCatraca(def: Definicao): void {
  describe(`catraca de design: ${def.nome}`, () => {
    const atual = medir(def);
    const base = lerLinhaDeBase(def.nome);
    const veredito = comparar(atual, base);

    it.each(def.exemplos)('o contador vê %j como %i', (texto, esperado) => {
      expect(def.contar(texto, 'src/exemplo.tsx')).toBe(esperado);
    });

    it('arquivo novo não tem ocorrência', () => {
      expect(veredito.novos, `${def.porque} (não acrescente à linha de base)`).toEqual({});
    });

    it('arquivo da linha de base não ganha ocorrência', () => {
      expect(veredito.cresceram).toEqual([]);
    });

    it('linha de base só diminui', () => {
      expect(veredito.desatualizadas).toEqual([]);
    });
  });
}
