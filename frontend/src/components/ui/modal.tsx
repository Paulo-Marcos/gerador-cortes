import type { ReactNode } from 'react';
import { Dialog, type TamanhoDoDialogo } from '@/components/ui/dialog';

// D-1122 (E-069 H-11b): o `Modal` é o contrato antigo de pé — `open`, `onClose`, `title`,
// `description`, `footer`, `size` — sobre o `Dialog` da Sala escura. As telas não mudam:
// quem chama continua escrevendo `<Modal size="lg">`; o miolo (foco preso, Esc, véu,
// foco de volta a quem abriu) vem do Radix, pelo `Dialog`.
//
// As cinco larguras antigas (448 · 512 · 672 · 896 · 1152) caem nas quatro novas
// (460 · 560 · 880 · 1152): cada uma vira a mais próxima que NÃO aperta o conteúdo.
// O `2xl` (D-542, o modal de marcar um quadro de vídeo) segue no degrau mais largo.

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl';
}

export const TAMANHO_DO_MODAL: Record<NonNullable<ModalProps['size']>, TamanhoDoDialogo> = {
  sm: 'sm',
  md: 'md',
  lg: 'lg',
  xl: 'lg',
  '2xl': 'xl',
};

export function Modal({ size = 'md', ...props }: ModalProps) {
  return <Dialog {...props} tamanho={TAMANHO_DO_MODAL[size]} />;
}
