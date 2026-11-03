import { hmsParaSeg } from '../timeUtils';
import type { Desvio, TranscricaoLinha } from '@/types/models';

// D-1017: o que se lê para decidir um trecho sem reouvir: a fala que sai e como a
// emenda fica. A transcrição do corte não guarda o tempo de cada palavra, então a
// citação da IA é quem marca o ponto exato; sem ela, o tempo é estimado dentro da
// linha. Funções puras: recebem o trecho e as linhas, devolvem texto.

/** Palavras mostradas de cada lado da emenda. */
const PALAVRAS_NA_EMENDA = 6;
/** Acima disto a fala é mostrada pelo começo e pelo fim: uma tangente de 45 s é um parágrafo. */
const LIMITE_DA_FALA = 30;
const PONTAS_DA_FALA = 12;
/** Folga ao redor do trecho: a citação pode cair uns segundos fora do tempo gravado. */
const FOLGA_SEG = 6;

export interface FalaDoTrecho {
  sai: string;
  antes: string;
  depois: string;
}

interface Palavra {
  texto: string;
  norma: string;
  tempo: number;
}

function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLocaleLowerCase('pt-BR')
    .replace(/[^\p{L}\p{N}]/gu, '');
}

function palavrasDasLinhas(linhas: TranscricaoLinha[], de: number, ate: number): Palavra[] {
  const palavras: Palavra[] = [];
  for (const linha of linhas) {
    if (linha.end < de || linha.start > ate) continue;
    const pedacos = linha.texto.split(/\s+/).filter((p) => normalizar(p));
    const passo = pedacos.length ? (linha.end - linha.start) / pedacos.length : 0;
    pedacos.forEach((texto, i) => {
      palavras.push({ texto, norma: normalizar(texto), tempo: linha.start + i * passo });
    });
  }
  return palavras;
}

/** Índice da ocorrência da citação mais próxima de `tempo`, ou -1. */
function ondeEstaACitacao(palavras: Palavra[], citacao: string | null | undefined, tempo: number): number {
  const alvo = (citacao ?? '').split(/\s+/).map(normalizar).filter(Boolean);
  if (alvo.length === 0) return -1;
  let melhor = -1;
  let menorDistancia = Infinity;
  for (let i = 0; i + alvo.length <= palavras.length; i++) {
    if (!alvo.every((norma, j) => palavras[i + j].norma === norma)) continue;
    const distancia = Math.abs(palavras[i].tempo - tempo);
    if (distancia < menorDistancia) {
      melhor = i;
      menorDistancia = distancia;
    }
  }
  return melhor;
}

function resumir(palavras: Palavra[]): string {
  const textos = palavras.map((p) => p.texto);
  if (textos.length <= LIMITE_DA_FALA) return textos.join(' ');
  return `${textos.slice(0, PONTAS_DA_FALA).join(' ')} … ${textos.slice(-PONTAS_DA_FALA).join(' ')}`;
}

/** A fala do trecho e as palavras em volta da emenda. `null`: a transcrição não cobre o trecho. */
export function falaDoTrecho(desvio: Desvio, linhas: TranscricaoLinha[]): FalaDoTrecho | null {
  const inicio = hmsParaSeg(desvio.inicio_hms);
  const fim = hmsParaSeg(desvio.fim_hms);
  const palavras = palavrasDasLinhas(linhas, inicio - FOLGA_SEG, fim + FOLGA_SEG);

  const noInicio = ondeEstaACitacao(palavras, desvio.inicio_texto, inicio);
  const primeira = noInicio >= 0 ? noInicio : palavras.findIndex((p) => p.tempo >= inicio);
  const citacaoDoFim = (desvio.fim_texto ?? '').split(/\s+/).filter((p) => normalizar(p));
  const noFim = ondeEstaACitacao(palavras, desvio.fim_texto, fim);
  const depoisDoFim = noFim >= 0 ? noFim + citacaoDoFim.length : palavras.findIndex((p) => p.tempo >= fim);
  const fronteira = depoisDoFim === -1 ? palavras.length : depoisDoFim;

  if (primeira === -1 || fronteira <= primeira) return null;
  return {
    sai: resumir(palavras.slice(primeira, fronteira)),
    antes: palavras.slice(Math.max(0, primeira - PALAVRAS_NA_EMENDA), primeira).map((p) => p.texto).join(' '),
    depois: palavras.slice(fronteira, fronteira + PALAVRAS_NA_EMENDA).map((p) => p.texto).join(' '),
  };
}
