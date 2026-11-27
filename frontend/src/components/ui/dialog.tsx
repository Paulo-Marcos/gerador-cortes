import * as React from 'react';
import * as RD from '@radix-ui/react-dialog';
import { cva } from 'class-variance-authority';
import { cn } from '@/lib/utils';
import { Icon } from '@/components/ui/icon';
import { PELE_FLUTUANTE } from '@/components/ui/superficie-flutuante';

// D-1122 (E-069 H-11b): o diálogo da Sala escura e a gaveta (`tamanho="lateral"`, 432 px),
// sobre o Dialog do Radix. O Radix traz o que a acessibilidade pede e que o `Modal` antigo
// só fazia pela metade: foco PRESO dentro do diálogo, Esc fecha, o resto da página fica
// `aria-hidden` e sem rolagem. Aqui entra a roupa e o que o Radix não faz sem gatilho:
// DEVOLVER o foco a quem abriu (ver `lembrarOrigem`).
//
// Sem portal, de propósito: as telas (e os seus testes) já esperam o diálogo no lugar em
// que foi desenhado, e dentro da casca `.ap` ele herda o tema sem ajuda.
// Sem `backdrop-filter`: o fundo é o `bg-pop` quase sólido (DIRECAO §3.6).

/**
 * Larguras do diálogo (DIRECAO §6): 460 · 560 · 880 · 1152 e a gaveta de 432. O diálogo
 * centraliza por `translate`, e a gaveta encosta à direita com 12 px de folga.
 */
export const caixaDoDialogo = cva('fixed z-50 flex flex-col overflow-hidden outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-foco focus-visible:-outline-offset-2 ' + PELE_FLUTUANTE, {
  variants: {
    tamanho: {
      sm: 'w-[460px]',
      md: 'w-[560px]',
      lg: 'w-[880px]',
      xl: 'w-[1152px]',
      lateral: 'bottom-3 right-3 top-3 w-[432px] max-w-[calc(100vw-24px)] rounded-dialogo',
    },
  },
  defaultVariants: { tamanho: 'sm' },
});

/** O diálogo comum, centrado e com no máximo a altura da janela menos 48 px. */
const CENTRADO =
  'left-1/2 top-1/2 max-h-[calc(100dvh-48px)] max-w-[calc(100vw-32px)] -translate-x-1/2 -translate-y-1/2 rounded-dialogo';

const MOVIMENTO_DA_CAIXA =
  'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:duration-[240ms] data-[state=closed]:duration-200 ' +
  'data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0 motion-reduce:animate-none';

export type TamanhoDoDialogo = 'sm' | 'md' | 'lg' | 'xl' | 'lateral';

/** Quem tinha o foco quando o diálogo abriu, e se ainda dá para devolvê-lo. */
export interface OrigemDoFoco {
  isConnected: boolean;
  focus: () => void;
}

/**
 * O Radix só devolve o foco a um `Trigger`; o app abre o diálogo por estado, sem gatilho,
 * e o foco ia para o `<body>`. Quem abriu é lembrado ao abrir (o foco ainda está nele) e
 * recebe o foco de volta ao fechar — se ele sumiu da página no meio do caminho, nada.
 */
export function lembrarOrigem(ativo: unknown): OrigemDoFoco | null {
  const el = ativo as Partial<OrigemDoFoco> | null;
  return el && typeof el.focus === 'function' && 'isConnected' in el ? (el as OrigemDoFoco) : null;
}

/**
 * A origem é a de QUANDO O DIÁLOGO ABRIU: enquanto há uma guardada, o foco novo (que já pode
 * estar dentro do diálogo, num campo com `autoFocus`) não a troca.
 */
export function guardarOrigem(atual: OrigemDoFoco | null, ativo: unknown): OrigemDoFoco | null {
  return atual ?? lembrarOrigem(ativo);
}

export function devolverFoco(origem: OrigemDoFoco | null): void {
  if (origem?.isConnected) origem.focus();
}

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  children?: React.ReactNode;
  /** Barra de ações no pé; quem chama passa o `Button` que quiser. */
  footer?: React.ReactNode;
  tamanho?: TamanhoDoDialogo;
}

export function Dialog({ open, onClose, title, description, children, footer, tamanho = 'sm' }: DialogProps) {
  const origem = React.useRef<OrigemDoFoco | null>(null);
  const caixa = React.useRef<HTMLDivElement>(null);
  const lateral = tamanho === 'lateral';

  // Quem abriu é guardado ANTES de o miolo montar: um campo com `autoFocus` toma o foco no
  // commit, e o gancho de abertura do Radix nem chega a rodar (o foco já está dentro). No
  // desenho, o foco ainda está no botão que abriu. A origem só se zera ao devolver o foco
  // (depois da saída animada), por isso fechar não a apaga.
  if (open && typeof document !== 'undefined') origem.current = guardarOrigem(origem.current, document.activeElement);

  return (
    <RD.Root open={open} onOpenChange={(aberto) => !aberto && onClose()}>
      <RD.Overlay
        className={cn('fixed inset-0 z-50 bg-veu', MOVIMENTO_DA_CAIXA)}
      />
      <RD.Content
        ref={caixa}
        data-sala=""
        className={cn(
          caixaDoDialogo({ tamanho }),
          lateral ? 'data-[state=open]:slide-in-from-right-8' : CENTRADO,
          MOVIMENTO_DA_CAIXA,
          !lateral && 'data-[state=open]:zoom-in-95 data-[state=closed]:zoom-out-95',
        )}
        // Sem descrição, o Radix não deve apontar para uma que não existe.
        {...(description ? {} : { 'aria-describedby': undefined })}
        onOpenAutoFocus={(evento) => {
          // Quem pede um foco inicial (o "Cancelar" do diálogo destrutivo, DIRECAO §7.10)
          // marca o elemento com `data-autofocus`; sem marca, o foco vai para o próprio
          // diálogo — o leitor de tela lê o título primeiro, sem cair num botão.
          evento.preventDefault();
          (caixa.current?.querySelector<HTMLElement>('[data-autofocus]') ?? caixa.current)?.focus();
        }}
        onCloseAutoFocus={(evento) => {
          evento.preventDefault();
          devolverFoco(origem.current);
          origem.current = null;
        }}
      >
        <header className="flex items-start justify-between gap-3 px-[26px] pb-3 pt-[26px]">
          <div className="min-w-0 flex-1">
            <RD.Title className="text-secao text-fg">{title}</RD.Title>
            {description && <RD.Description className="mt-1 text-pequeno text-fg-2">{description}</RD.Description>}
          </div>
          {/* Botão próprio, e não o `IconButton`: as variantes de luz levam `aria-pressed:`
              nas classes, e o teste travado do `ConfirmDialog` (D-993) exige que o HTML sem
              escolha não tenha a palavra. Mesma pele do fantasma, 30 px. */}
          <RD.Close
            data-sala=""
            aria-label="Fechar"
            className="inline-flex size-[30px] shrink-0 items-center justify-center rounded-pilula text-fg-2 transition-colors duration-150 hover:bg-vidro-2 hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foco motion-reduce:transition-none"
          >
            <Icon name="x" />
          </RD.Close>
        </header>
        {/* D-1195: `overscroll-contain` — chegar ao fim do miolo não rola a tela atrás do véu (§8.2). */}
        <div className="flex-1 overflow-y-auto overscroll-contain px-[26px] py-2">{children}</div>
        {footer && (
          <footer className="flex flex-wrap items-center justify-end gap-2 px-[26px] pb-[26px] pt-4">{footer}</footer>
        )}
        {!footer && <div className="h-[18px] shrink-0" />}
      </RD.Content>
    </RD.Root>
  );
}
