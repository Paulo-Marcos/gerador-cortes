// D-450: velocidade com que os players de preview ABREM.
//
// Antes os tres players (Editor, Revisao Final, Pos-producao) nasciam em
// 1,00x e o Editor ainda voltava para 1,00x a cada troca de corte — quem
// revisa numa velocidade fixa tinha de subir a mao o tempo todo. A
// preferencia agora vive em `app_settings` (settings.db), editavel no modal
// Ajustes, e estes hooks sao o unico ponto de leitura dela no frontend.
//
// E preferencia de LEITURA: nao entra no render. O clipe exportado sai
// sempre em 1x, independente do que estiver aqui.
import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

// Mesma faixa dos atalhos de velocidade das telas (Ctrl+J/K) e do clamp do
// backend. Duplicar o limite aqui e barato e evita que um valor gravado fora
// de faixa por outra via chegue ao <video> como playbackRate invalido.
const VELOCIDADE_MIN = 0.25;
const VELOCIDADE_MAX = 4;
const VELOCIDADE_PADRAO = 1;

export function normalizarVelocidade(bruta: number | undefined | null): number {
  if (typeof bruta !== 'number' || !Number.isFinite(bruta)) return VELOCIDADE_PADRAO;
  return Math.max(VELOCIDADE_MIN, Math.min(VELOCIDADE_MAX, bruta));
}

/**
 * Velocidade padrao configurada em Ajustes. Enquanto a query nao resolve,
 * devolve 1 — o player abre normal e sobe assim que o ajuste chega.
 *
 * Compartilha a queryKey `app-settings` com o painel de Ajustes, entao o
 * React Query deduplica: chamar em varias telas nao gera requisicao extra, e
 * salvar um novo valor no painel se propaga sozinho para os players abertos.
 */
export function useVelocidadePlayerPadrao(): number {
  const { data } = useQuery({ queryKey: ['app-settings'], queryFn: api.obterSettings });
  return normalizarVelocidade(data?.velocidade_player_padrao);
}

/**
 * Aplica uma velocidade a um <video> nativo. Chame do componente que RENDERIZA
 * o <video>: fora dele a ref ainda pode estar nula quando o efeito roda — foi
 * assim que o Editor chegou a anunciar 1,50x com o video rodando em 1,00x.
 *
 * Grava tambem `defaultPlaybackRate` porque o `playbackRate` de um elemento de
 * midia e RESETADO para o default a cada carga — e por isso que trocar de corte
 * devolvia o player para 1,00x. Passe `chaveDaMidia` (o src) para reaplicar
 * quando a fonte muda.
 */
export function useVelocidadeNoVideo(
  videoRef: React.RefObject<HTMLVideoElement | null>,
  velocidade: number,
  chaveDaMidia?: string,
): void {
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.defaultPlaybackRate = velocidade;
    video.playbackRate = velocidade;
  }, [videoRef, velocidade, chaveDaMidia]);
}
