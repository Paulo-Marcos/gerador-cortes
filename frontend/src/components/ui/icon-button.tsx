import * as React from 'react';
import { botaoDeLuz } from '@/components/ui/button';
import { cn } from '@/lib/utils';

// D-1114 (E-069 H-07): as variantes `vidro`, `fantasma` e `destrutivo` são o botão de
// ícone da Sala escura — círculo de luz de 30/38/46 px. Nelas `aria-label` é obrigatório
// (DIRECAO §5: botão só de ícone precisa de nome para o leitor de tela e para o tooltip).
// As sete variantes antigas seguem como estavam: nenhuma tela muda nesta história.
//
// D-599: na casca nova o botão de ícone é o `.btn.btn-icon` do handoff —
// 30 px quadrados, canto de 4 px. As variantes de COR continuam valendo:
// elas carregam significado, e trocar significado por estética seria
// perder informação.

// O contrato antigo (`ghost`, `outline`…) segue aceito, mas desenhado pelo mesmo botão de luz:
// toda variante antiga cai numa das quatro novas, e todo tamanho vira o círculo de 30 px.
const LUZ_DO_LEGADO: Record<VarianteLegada, 'fantasma' | 'secundario' | 'destrutivo'> = {
  ghost: 'fantasma',
  outline: 'secundario',
  solid: 'secundario',
  accent: 'secundario',
  'err-outline': 'destrutivo',
  inset: 'secundario',
  'toggle-active': 'secundario',
};

type VarianteLegada =
  | 'ghost'
  | 'outline'
  | 'solid'
  | 'accent'
  | 'err-outline'
  | 'inset'
  | 'toggle-active';

type VarianteDeLuz = 'vidro' | 'fantasma' | 'destrutivo';

const LUZ_DA_VARIANTE = {
  vidro: 'secundario',
  fantasma: 'fantasma',
  destrutivo: 'destrutivo',
} as const;

type IconButtonLegadoProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: VarianteLegada;
  size?: 'sm' | 'md' | 'lg' | 'toolbar' | 'toolbar-sm';
};

type IconButtonDeLuzProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant: VarianteDeLuz;
  size?: 'pq' | 'md' | 'gd';
  'aria-label': string;
};

export type IconButtonProps = IconButtonLegadoProps | IconButtonDeLuzProps;

const ehDeLuz = (props: IconButtonProps): props is IconButtonDeLuzProps =>
  props.variant === 'vidro' || props.variant === 'fantasma' || props.variant === 'destrutivo';

export const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>((props, ref) => {
  if (ehDeLuz(props)) {
    const { variant, size = 'md', className, type = 'button', ...resto } = props;
    return (
      <button
        ref={ref}
        type={type}
        data-variant={variant}
        data-sala=""
        className={cn(
          botaoDeLuz({ variante: LUZ_DA_VARIANTE[variant], tamanho: size, soIcone: true }),
          className,
        )}
        {...resto}
      />
    );
  }
  // `size` do contrato antigo não muda nada: todos viram o círculo de 30 px.
  const { className, variant = 'ghost', type = 'button', size: _tamanho, ...resto } = props;
  return (
    <button
      ref={ref}
      type={type}
      className={cn(
        botaoDeLuz({ variante: LUZ_DO_LEGADO[variant], tamanho: 'pq', soIcone: true }),
        variant === 'toggle-active' && 'border-iris-fio bg-iris-suave text-iris',
        className,
      )}
      {...resto}
    />
  );
});

IconButton.displayName = 'IconButton';
