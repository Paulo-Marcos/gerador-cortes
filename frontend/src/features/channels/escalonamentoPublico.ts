/**
 * D-908: a referência do público, do lado da tela.
 *
 * O backend fala em FAIXAS ("segunda, das 15h às 23h, forte"), que é como o
 * operador lê o relatório do Studio. A tela mostra uma GRADE de 7 dias × 24
 * horas, que é como o relatório desenha. Aqui mora a tradução entre as duas —
 * pura, sem React, para o teste provar que ida e volta não perdem hora nenhuma.
 */
import type { FaixaDoPublico } from '@/features/channels/api/escalonamento';

export type Intensidade = 'forte' | 'medio' | 'fraco';

export const DIAS = 7;
export const HORAS = 24;

/** Uma linha por dia (0 = segunda), uma coluna por hora. */
export type GradeDoPublico = Intensidade[][];

/** O que uma hora sem faixa vale — o mesmo "medio" que o domínio assume. */
const SEM_FAIXA: Intensidade = 'medio';

export const ROTULO_DA_INTENSIDADE: Record<Intensidade, string> = {
  forte: 'forte',
  medio: 'médio',
  fraco: 'fraco',
};

function lerIntensidade(texto: string): Intensidade {
  return texto === 'forte' || texto === 'fraco' ? texto : 'medio';
}

export function gradeDasFaixas(faixas: FaixaDoPublico[]): GradeDoPublico {
  const grade: GradeDoPublico = Array.from({ length: DIAS }, () =>
    Array.from({ length: HORAS }, () => SEM_FAIXA),
  );
  for (const faixa of faixas) {
    const linha = grade[faixa.dia];
    if (!linha) continue;
    for (let hora = Math.max(0, faixa.inicio); hora < Math.min(HORAS, faixa.fim); hora += 1) {
      linha[hora] = lerIntensidade(faixa.intensidade);
    }
  }
  return grade;
}

/**
 * Horas vizinhas com a mesma força viram uma faixa só: a grade de 168 células
 * volta como as poucas linhas que o operador leria no relatório.
 */
export function faixasDaGrade(grade: GradeDoPublico): FaixaDoPublico[] {
  const faixas: FaixaDoPublico[] = [];
  grade.forEach((linha, dia) => {
    let inicio = 0;
    for (let hora = 1; hora <= linha.length; hora += 1) {
      if (hora === linha.length || linha[hora] !== linha[inicio]) {
        faixas.push({ dia, inicio, fim: hora, intensidade: linha[inicio] });
        inicio = hora;
      }
    }
  });
  return faixas;
}

/** Um clique na célula: fraco → médio → forte → fraco. */
export function proximaIntensidade(atual: Intensidade): Intensidade {
  if (atual === 'fraco') return 'medio';
  if (atual === 'medio') return 'forte';
  return 'fraco';
}

export function trocarCelula(grade: GradeDoPublico, dia: number, hora: number): GradeDoPublico {
  return grade.map((linha, d) =>
    d === dia ? linha.map((valor, h) => (h === hora ? proximaIntensidade(valor) : valor)) : linha,
  );
}

/** "forte 15h–23h · fraco 0h–9h": o resumo de um dia, para quem não vê cores. */
export function resumoDoDia(linha: Intensidade[]): string {
  const faixas = faixasDaGrade([linha]).filter((f) => f.intensidade !== 'medio');
  if (faixas.length === 0) return 'médio o dia inteiro';
  return faixas
    .map((f) => `${ROTULO_DA_INTENSIDADE[lerIntensidade(f.intensidade)]} ${f.inicio}h–${f.fim}h`)
    .join(' · ');
}

export function gradesIguais(a: GradeDoPublico, b: GradeDoPublico): boolean {
  return a.every((linha, d) => linha.every((valor, h) => valor === b[d]?.[h]));
}
