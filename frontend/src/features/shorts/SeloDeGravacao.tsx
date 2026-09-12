import { Check, Loader2, TriangleAlert } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { EstadoDaGravacao } from './useEdicaoDoShort';

/**
 * D-581: a prova de que gravou.
 *
 * Com auto-save, o silêncio é ambíguo: "não mudou nada" e "mudou e salvou" têm
 * a mesma cara. O selo é o que separa os dois — e é também o que torna o Ctrl+Z
 * honesto, porque quem vê "salvo" sabe que há o que desfazer.
 *
 * Some sozinho depois de uns segundos: um selo permanente vira decoração, e
 * decoração que pisca no canto do olho é ruído numa tela que já estava cheia.
 */
export function SeloDeGravacao({ estado }: { estado: EstadoDaGravacao }) {
  if (estado === 'parado') return null;

  const aparencia = {
    gravando: { icone: <Loader2 size={11} className="animate-spin" />, texto: 'salvando…', classe: 'text-[var(--wb-text-mute)]' },
    gravado: { icone: <Check size={11} />, texto: 'salvo', classe: 'text-[var(--wb-ok-ink)]' },
    falhou: { icone: <TriangleAlert size={11} />, texto: 'não salvou', classe: 'text-[var(--wb-warn-ink)]' },
  }[estado];

  return (
    <span
      role="status"
      className={cn('inline-flex items-center gap-1 text-[11.5px] font-semibold', aparencia.classe)}
    >
      {aparencia.icone}
      {aparencia.texto}
    </span>
  );
}
