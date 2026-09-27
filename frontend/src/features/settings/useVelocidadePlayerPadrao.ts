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
import { useQuery } from '@tanstack/react-query';
import { settingsApi } from './api';

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
  const { data } = useQuery({ queryKey: ['app-settings'], queryFn: settingsApi.obterSettings });
  return normalizarVelocidade(data?.velocidade_player_padrao);
}
