import * as React from 'react';
import { cn } from '@/lib/utils';
import type { LuzDoCanal } from '@/lib/luzDoCanal';

// D-1127 (E-069 H-11c) · Avatar do canal: a imagem (ou as iniciais) dentro do anel da luz.
//
// Único lugar da UI onde a cor do canal aparece (DIRECAO §4.2). As cores chegam de
// `lib/luzDoCanal` (já com a luminosidade travada para o tema) e viram variáveis NO PRÓPRIO
// ELEMENTO, nunca no elemento raiz do documento: dois avatares de canais diferentes convivem na mesma tela.
// Sem luz (`null`) o anel é neutro, `cc-vidro-3`. Não é interativo: quem o embrulha num
// botão é a ficha do canal, e é ela que leva o foco.

export interface AvatarDoCanalProps extends Omit<React.HTMLAttributes<HTMLSpanElement>, 'children'> {
  /** Nome do canal: vira o `aria-label` e, sem imagem, as iniciais. */
  nome: string;
  imagem?: string | null;
  luz?: LuzDoCanal | null;
  /** Diâmetro externo, em px. */
  tamanho?: number;
}

export function iniciaisDoCanal(nome: string): string {
  const palavras = nome.trim().split(/\s+/).filter(Boolean);
  if (palavras.length === 0) return '?';
  if (palavras.length === 1) return [...palavras[0]].slice(0, 2).join('').toUpperCase();
  return (([...palavras[0]][0] ?? '') + ([...palavras[palavras.length - 1]][0] ?? '')).toUpperCase();
}

export const AvatarDoCanal = React.forwardRef<HTMLSpanElement, AvatarDoCanalProps>(function AvatarDoCanal(
  { nome, imagem, luz = null, tamanho = 36, className, ...props },
  ref,
) {
  const variaveis = {
    '--d': `${tamanho}px`,
    ...(luz ? { '--luz-a': luz.a, '--luz-b': luz.b } : {}),
  } as React.CSSProperties;
  return (
    <span
      ref={ref}
      role="img"
      aria-label={nome}
      data-luz={luz ? 'canal' : 'neutra'}
      style={variaveis}
      className={cn(
        'inline-grid size-[var(--d)] flex-none place-items-center rounded-full p-[2px]',
        luz ? '[background:linear-gradient(135deg,var(--luz-a),var(--luz-b))]' : 'bg-vidro-3',
        className,
      )}
      {...props}
    >
      <span
        aria-hidden
        className="grid size-full place-items-center overflow-hidden rounded-full bg-painel-solido text-micro font-bold text-fg-2"
      >
        {imagem ? <img src={imagem} alt="" className="size-full object-cover" /> : iniciaisDoCanal(nome)}
      </span>
    </span>
  );
});
