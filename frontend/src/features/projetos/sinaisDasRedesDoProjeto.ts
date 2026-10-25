// D-987: a regra dos ícones de rede no card da Biblioteca, fora do JSX.
//
// Espelho de `features/shorts/sinaisDasRedes.ts` (D-905) uma altura acima: lá
// a pergunta é por corte, sobre os shorts verticais; aqui é pela LIVE, sobre o
// MP4 16:9. O backend diz, por rede, se TODOS os cortes com vídeo pronto já
// subiram (`completa`); aqui isso vira o que a tela mostra e o que o tooltip
// conta. A cópia é deliberada: as duas features não se importam (D-663), e
// repetir sete linhas custa menos que uma dependência entre telas.
import type { Projeto } from '@/types/models';

export const REDES_DO_HORIZONTAL = [
  { id: 'youtube', rotulo: 'YouTube' },
  { id: 'tiktok_horizontal', rotulo: 'TikTok' },
] as const;

export interface SinalDaRedeDoProjeto {
  id: (typeof REDES_DO_HORIZONTAL)[number]['id'];
  rotulo: string;
  /** Aceso: todos os cortes com vídeo pronto da live já estão nesta rede. */
  ativa: boolean;
  titulo: string;
}

/** As duas redes do horizontal, sempre, na ordem da tela — apagadas quando falta alguém. */
export function sinaisDasRedesDoProjeto(projeto: Projeto): SinalDaRedeDoProjeto[] {
  const prontos = projeto.total_video_pronto;
  // Backend antigo, sem `redes_do_horizontal`: nada acende, como na D-905.
  const redes = Array.isArray(projeto.redes_do_horizontal) ? projeto.redes_do_horizontal : [];

  return REDES_DO_HORIZONTAL.map((rede) => {
    const dado = redes.find((r) => r.plataforma === rede.id);
    const ativa = dado?.completa ?? false;
    return {
      id: rede.id,
      rotulo: rede.rotulo,
      ativa,
      titulo: tituloDaRede(rede.rotulo, prontos, dado?.publicados ?? 0, ativa),
    };
  });
}

function tituloDaRede(rotulo: string, prontos: number, publicados: number, ativa: boolean): string {
  if (prontos === 0) return `Nenhum corte pronto para subir no ${rotulo}`;
  if (ativa) {
    return prontos === 1
      ? `O corte pronto já está no ${rotulo}`
      : `Os ${prontos} cortes prontos já estão no ${rotulo}`;
  }
  return `${publicados} de ${prontos} cortes prontos no ${rotulo}`;
}
