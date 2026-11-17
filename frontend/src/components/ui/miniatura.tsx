import * as React from 'react';
import clsx from 'clsx';
import { Icon } from '@/components/ui/icon';
import { formatarDuracao } from '@/lib/utils';

// D-1120 (E-069 H-10) · Miniatura: a capa de uma live ou de um corte.
//
// A capa NUNCA distorce. A caixa tem proporção fixa (`aspect-video` para a deitada,
// `aspect-[9/16]` para o short) e a imagem a preenche com `object-cover`: se a arte não
// bate com a caixa, ela é cortada, não esticada. A duração vai queimada no canto, em
// mono (`num`), como o timecode do protótipo. Canto de 10 (miniatura, §3.2); a capa
// grande dentro de cartão usa `capa` (14).
//
// Sem capa (ainda não saiu, ou a rota falhou), a caixa mostra um ícone sobre `vidro-3`:
// o espaço não pula quando a imagem chega. Sem `backdrop-filter` (§3.6): o selo de
// duração é `painel-solido` chapado, que lê bem nos dois temas sem cor fixa.

export const PROPORCOES_DA_MINIATURA = ['16/9', '9/16'] as const;
export type ProporcaoDaMiniatura = (typeof PROPORCOES_DA_MINIATURA)[number];

const CLASSE_DA_PROPORCAO: Record<ProporcaoDaMiniatura, string> = {
  '16/9': 'aspect-video',
  '9/16': 'aspect-[9/16]',
};

export interface MiniaturaProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'children'> {
  /** Ausente = placeholder com ícone. */
  src?: string;
  /** Texto alternativo; vazio quando o título ao lado já diz o que é. */
  alt?: string;
  proporcao?: ProporcaoDaMiniatura;
  /** Em segundos; vira "m:ss" queimado no canto. */
  duracaoSeg?: number;
  /** Número do corte, no canto de cima. */
  numero?: number;
  /** Corte riscado: guarda o trabalho, mas apaga a imagem (RN do Limpar). */
  riscada?: boolean;
  /** Raio da capa grande (14) em vez do de miniatura (10). */
  grande?: boolean;
}

const SELO_DO_CANTO =
  'absolute z-[3] inline-flex h-5 items-center justify-center rounded-pilula border border-fio bg-painel-solido px-1.5 leading-none text-fg';

export const Miniatura = React.forwardRef<HTMLDivElement, MiniaturaProps>(function Miniatura(
  { src, alt = '', proporcao = '16/9', duracaoSeg, numero, riscada = false, grande = false, className, ...props },
  ref,
) {
  return (
    <div
      ref={ref}
      data-proporcao={proporcao}
      className={clsx(
        'relative flex-none overflow-hidden bg-vidro-3 shadow-[inset_0_0_0_1px_var(--cc-fio-2)]',
        grande ? 'rounded-capa' : 'rounded-[10px]',
        CLASSE_DA_PROPORCAO[proporcao],
        riscada && 'opacity-45 grayscale',
        className,
      )}
      {...props}
    >
      {src ? (
        <img
          src={src}
          alt={alt}
          loading="lazy"
          decoding="async"
          draggable={false}
          className="absolute inset-0 z-[1] size-full rounded-[inherit] object-cover"
        />
      ) : (
        <span aria-hidden data-sem-capa className="absolute inset-0 grid place-items-center text-fg-3">
          <Icon name="image-off" className="size-5" />
        </span>
      )}
      {numero !== undefined && (
        <span data-numero className={clsx(SELO_DO_CANTO, 'num left-1.5 top-1.5 min-w-5')}>
          {numero}
        </span>
      )}
      {duracaoSeg !== undefined && (
        <span data-duracao className={clsx(SELO_DO_CANTO, 'num bottom-2 left-2')}>
          {formatarDuracao(duracaoSeg)}
        </span>
      )}
    </div>
  );
});
