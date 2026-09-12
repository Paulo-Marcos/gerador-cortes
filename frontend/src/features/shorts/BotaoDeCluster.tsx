import { cn } from '@/lib/utils';

/**
 * D-581: um botão dentro de um cluster do cabeçalho.
 *
 * Existe para que os controles do MESMO assunto pareçam um controle só. Como
 * `Button` variant/size, cada um trazia borda e fundo próprios — e seis caixas
 * iguais em fila são exatamente o que faz o olho parar de distinguir grupos.
 * Aqui a caixa é do cluster; os botões só se acendem.
 */
export function BotaoDeCluster({
  ativo,
  onClick,
  titulo,
  rotulo,
  desabilitado = false,
  soIcone = false,
  children,
}: {
  ativo: boolean;
  onClick: () => void;
  titulo: string;
  rotulo: string;
  desabilitado?: boolean;
  soIcone?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={desabilitado}
      title={titulo}
      aria-label={rotulo}
      aria-pressed={ativo}
      className={cn(
        'inline-flex h-7 items-center gap-1.5 rounded-[6px] px-2 text-[12px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-35',
        ativo
          ? 'bg-[var(--wb-bg-panel)] text-[var(--wb-text)] shadow-[var(--wb-shadow)]'
          : 'text-[var(--wb-text-mute)] hover:bg-[var(--wb-bg-panel)] hover:text-[var(--wb-text)]',
      )}
    >
      {children}
      {!soIcone && rotulo}
    </button>
  );
}
