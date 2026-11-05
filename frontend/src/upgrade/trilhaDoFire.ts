import type { FireComBruto } from '@/features/shorts/shortsApi';
import type { EtapaDaTrilha } from './trilhaDaLive';
import type { TelaId } from './upgradeRoutes';

// D-1051: fora da live, o Fire só tinha migalhas. A trilha mostra as duas telas da D-581,
// nas URLs de hoje, com o que cada uma tem de aberto. "Prateleira" só conta como feita
// quando o operador declara o Fire finalizado (RN-17), e não pelas publicações.

const REDES = [
  ['YT', 'youtube_shorts'],
  ['TT', 'tiktok'],
  ['IG', 'instagram_reels'],
] as const;

const contar = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

function casaCurar(fire: FireComBruto | undefined) {
  if (!fire) return { contagem: '—', feita: false };
  const { sugerido, aprovado, total, rejeitado } = fire.shorts;
  if (total - rejeitado === 0) return { contagem: 'sem shorts', feita: false };
  return {
    contagem: `${contar(sugerido, 'sugerido', 'sugeridos')}, ${contar(aprovado, 'aprovado', 'aprovados')}`,
    feita: sugerido === 0,
  };
}

function casaPrateleira(fire: FireComBruto | undefined) {
  if (!fire) return { contagem: '—', feita: false };
  const publicados = (plataforma: string) =>
    fire.redes.find((r) => r.plataforma === plataforma)?.publicados ?? 0;
  const redes = REDES.map(([sigla, plataforma]) => `${sigla} ${publicados(plataforma)}`).join(' · ');
  return {
    contagem: `${contar(fire.shorts.renderizado, 'pronto', 'prontos')}, ${redes}`,
    feita: Boolean(fire.finalizado_em),
  };
}

export function trilhaDoFire(
  tela: TelaId,
  corteId: string | null,
  fire: FireComBruto | undefined,
): EtapaDaTrilha[] {
  if (!corteId || (tela !== 'fire' && tela !== 'prateleira')) return [];
  return [
    { id: 'curar', texto: 'Curar', agora: tela === 'fire', to: `/shorts/${corteId}`, ...casaCurar(fire) },
    {
      id: 'prateleira',
      texto: 'Prateleira',
      agora: tela === 'prateleira',
      to: `/shorts/${corteId}/workspace`,
      ...casaPrateleira(fire),
    },
  ];
}
