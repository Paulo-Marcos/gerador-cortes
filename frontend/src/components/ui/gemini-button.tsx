// Identidade visual do Gemini: a cor da marca e o ícone. O botão de gerar mora
// em `acao-de-ia.tsx`, que oferece os dois provedores na mesma ação.

export const GEMINI_BRAND = '#4285F4';

/**
 * A estrela de quatro pontas do Gemini. Antes era o `Sparkles` do lucide, que
 * é o símbolo genérico de "IA" do app inteiro — ao lado do ícone do Claude, não
 * dizia QUAL provedor o botão chamava.
 */
export function GeminiIcon({ size = 14, className }: { size?: number; className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="currentColor"
      height={size}
      viewBox="0 0 24 24"
      width={size}
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M12 0C12.4 6.4 17.6 11.6 24 12C17.6 12.4 12.4 17.6 12 24C11.6 17.6 6.4 12.4 0 12C6.4 11.6 11.6 6.4 12 0Z" />
    </svg>
  );
}
