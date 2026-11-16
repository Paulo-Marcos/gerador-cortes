import * as React from 'react';
import { cn } from '@/lib/utils';
import { CLASSES_DO_CAMPO, useLigacaoDoCampo } from './field';

// D-1116 (E-069 H-08): área de texto da Sala escura. Mesma pele do `Input`, canto de 12
// e altura mínima de três linhas; só o `resize` vertical, para não quebrar a grade.
export type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement> & {
  invalido?: boolean;
  carregando?: boolean | string;
};

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, invalido, carregando, id, placeholder, disabled, ...props }, ref) => {
    const campo = useLigacaoDoCampo();
    const frase = typeof carregando === 'string' ? carregando : 'Carregando…';
    return (
      <textarea
        ref={ref}
        id={id ?? campo?.id}
        placeholder={carregando ? frase : placeholder}
        disabled={disabled || Boolean(carregando)}
        aria-busy={carregando ? true : undefined}
        aria-invalid={invalido ?? campo?.invalido ? true : undefined}
        aria-describedby={props['aria-describedby'] ?? campo?.describedBy}
        required={props.required ?? campo?.obrigatorio}
        className={cn(CLASSES_DO_CAMPO, 'min-h-[88px] resize-y px-3.5 py-2.5 leading-5', className)}
        {...props}
      />
    );
  },
);
Textarea.displayName = 'Textarea';
