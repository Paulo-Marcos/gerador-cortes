import { Miniatura } from '@/components/ui/miniatura';
import { cn } from '@/lib/utils';

// D-1167 (E-069 H-19, DIRECAO §7.5): "Como aparece no YouTube", no pé do formulário.
//
// É o teste que o operador faz de cabeça antes de publicar: a capa e o título, lado a lado,
// do jeito que o espectador os vê numa lista — capa 16:9, título em até duas linhas, o nome do
// canal. Lê o que está NA TELA (o campo ainda não salvo também), e não o último gravado:
// quem digita um título vê na hora se ele passa de duas linhas.
//
// Em YouTube o título é cortado perto dos 70 caracteres na lista; o aviso diz isso quando passa,
// porque o campo aceita 100.

/** Onde o YouTube costuma cortar o título numa lista (o campo aceita até 100). */
export const LIMITE_DO_TITULO_NA_LISTA = 70;

export function ComoApareceNoYouTube({
  capaUrl,
  titulo,
  canal,
  className,
}: {
  capaUrl?: string | null;
  titulo: string;
  /** O nome do canal ativo; sem ele a linha some, em vez de inventar um. */
  canal?: string;
  className?: string;
}) {
  const texto = titulo.trim();
  const cortado = texto.length > LIMITE_DO_TITULO_NA_LISTA;
  return (
    <section
      aria-label="Como aparece no YouTube"
      className={cn('grid gap-2 rounded-bloco border border-fio bg-vidro p-3', className)}
    >
      <h3 className="text-pequeno text-fg-2">Como aparece no YouTube</h3>
      <div className="flex items-start gap-3">
        <Miniatura src={capaUrl ?? undefined} alt="" proporcao="16/9" className="w-[168px] flex-none" />
        <div className="min-w-0 flex-1">
          <p
            className={cn('line-clamp-2 text-linha', texto ? 'text-fg' : 'text-fg-3')}
            title={texto || undefined}
          >
            {texto || 'O título aparece aqui.'}
          </p>
          {canal && <p className="mt-1 truncate text-pequeno text-fg-3">{canal}</p>}
        </div>
      </div>
      {cortado && (
        <p className="text-micro text-aviso" role="status">
          Na lista o YouTube corta perto dos {LIMITE_DO_TITULO_NA_LISTA} caracteres.
        </p>
      )}
    </section>
  );
}
