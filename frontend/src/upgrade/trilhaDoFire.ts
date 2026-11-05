import { plataformasJaPublicadas, shortsPublicaveis } from '@/features/shorts/selecaoDoLote';
import type { FireComBruto, PublicacaoRegistrada, ShortSugerido } from '@/features/shorts/shortsApi';
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

/** O que a faixa lê de um Fire: as contagens e a declaração de finalizado. */
type FireDaTrilha = Pick<FireComBruto, 'shorts' | 'finalizado_em'> & {
  redes: { plataforma: string; publicados: number }[];
};

function casaCurar(fire: FireDaTrilha | undefined) {
  if (!fire) return { contagem: '—', feita: false };
  const { sugerido, aprovado, total, rejeitado } = fire.shorts;
  if (total - rejeitado === 0) return { contagem: 'sem shorts', feita: false };
  return {
    contagem: `${contar(sugerido, 'sugerido', 'sugeridos')}, ${contar(aprovado, 'aprovado', 'aprovados')}`,
    feita: sugerido === 0,
  };
}

function casaPrateleira(fire: FireDaTrilha | undefined) {
  if (!fire) return { contagem: '—', feita: false };
  const publicados = (plataforma: string) =>
    fire.redes.find((r) => r.plataforma === plataforma)?.publicados ?? 0;
  const redes = REDES.map(([sigla, plataforma]) => `${sigla} ${publicados(plataforma)}`).join(' · ');
  return {
    contagem: `${contar(fire.shorts.renderizado, 'pronto', 'prontos')}, ${redes}`,
    feita: Boolean(fire.finalizado_em),
  };
}

type ShortDaTrilha = Pick<ShortSugerido, 'id' | 'status' | 'arquivo_short_path'>;

/**
 * As contagens pelas mesmas consultas que os cartões da tela leem. A lista dos Fires fica
 * em cache e nem todo gesto a relê (o fim do render, por exemplo): por ela, a faixa dizia
 * "0 prontos" ao lado de um short pronto. Ela só preenche o que ainda não chegou.
 */
export function comOQueATelaVe(
  fire: FireDaTrilha,
  shorts: ShortDaTrilha[] | undefined,
  publicacoes: PublicacaoRegistrada[] | undefined,
): FireDaTrilha {
  if (!shorts) return fire;
  const quantos = (status: ShortDaTrilha['status']) => shorts.filter((s) => s.status === status).length;
  const redes = publicacoes
    ? REDES.map(([, plataforma]) => ({
        plataforma,
        publicados: shorts.filter((s) => plataformasJaPublicadas(publicacoes, s.id).has(plataforma)).length,
      }))
    : fire.redes;
  return {
    ...fire,
    redes,
    shorts: {
      total: shorts.length,
      sugerido: quantos('sugerido'),
      aprovado: quantos('aprovado'),
      rejeitado: quantos('rejeitado'),
      renderizado: shortsPublicaveis(shorts).length,
    },
  };
}

export function trilhaDoFire(
  tela: TelaId,
  corteId: string | null,
  fire: FireDaTrilha | undefined,
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
