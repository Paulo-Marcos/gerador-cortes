// D-451: respiro que o editor mostra ao redor do corte.
//
// A timeline do Bruto nunca mostra so o intervalo do corte: o backend gera um
// proxy de audio de uma janela MAIOR — um tanto antes do inicio e um tanto
// depois do fim — e e esse excedente que da ao operador o que analisar e a
// margem para esticar a borda quando o corte ficou incompreensivel.
//
// Os dois numeros eram fixos (60s / 300s) e agora vivem em `app_settings`.
// Este hook e o unico ponto de leitura deles no frontend.
//
// IMPORTANTE: o backend gera o proxy com a SUA leitura do ajuste. O frontend
// so precisa do mesmo `antes` para saber onde a onda comeca (o offset que casa
// tempo de audio com tempo de video). Divergir os dois numeros nao quebra o
// arquivo gerado — desloca a onda em relacao a imagem, que e pior porque e
// silencioso.
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

// Mesma faixa do clamp do backend (`CONTEXTO_*` em app_settings.py). O teto
// existe porque a janela vira um proxy FLAC por ffmpeg a cada corte aberto.
export const CONTEXTO_MIN_SEG = 0;
export const CONTEXTO_ANTES_MAX_SEG = 600;
export const CONTEXTO_DEPOIS_MAX_SEG = 1800;

export const CONTEXTO_ANTES_PADRAO_SEG = 60;
export const CONTEXTO_DEPOIS_PADRAO_SEG = 300;

export type ContextoCorte = {
  antesSeg: number;
  depoisSeg: number;
};

function normalizar(bruto: number | undefined | null, padrao: number, maximo: number): number {
  if (typeof bruto !== 'number' || !Number.isFinite(bruto)) return padrao;
  return Math.max(CONTEXTO_MIN_SEG, Math.min(maximo, Math.round(bruto)));
}

export function normalizarContextoCorte(
  antes: number | undefined | null,
  depois: number | undefined | null,
): ContextoCorte {
  return {
    antesSeg: normalizar(antes, CONTEXTO_ANTES_PADRAO_SEG, CONTEXTO_ANTES_MAX_SEG),
    depoisSeg: normalizar(depois, CONTEXTO_DEPOIS_PADRAO_SEG, CONTEXTO_DEPOIS_MAX_SEG),
  };
}

/**
 * Janela de contexto configurada em Ajustes. Enquanto a query nao resolve,
 * devolve os padroes historicos (60s / 300s) — o editor abre normal e a janela
 * se corrige sozinha assim que o ajuste chega, porque os dois valores entram na
 * identidade da janela da onda (ver `resolveWaveformWindow`).
 *
 * Compartilha a queryKey `app-settings` com o painel de Ajustes, entao o React
 * Query deduplica e salvar um novo valor se propaga para os editores abertos.
 */
export function useContextoCorte(): ContextoCorte {
  const { data } = useQuery({ queryKey: ['app-settings'], queryFn: api.obterSettings });
  return normalizarContextoCorte(data?.contexto_antes_seg, data?.contexto_depois_seg);
}
