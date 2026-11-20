import { FOCO } from '@/features/editor/salaDoEditor';
import { cn } from '@/lib/utils';
import { Icon } from '@/upgrade/Icon';

// D-314: abertura editorial do corte — contextualização (frase que situa o
// assunto, que a D-295 leva para a 1ª cena) + frase-gancho (ponto de entrada
// mais forte, com o timestamp na live). Fica no topo do painel de Cenas, junto
// de onde a 1ª cena é editada. Só renderiza o que tem conteúdo; nada preenchido
// (corte antigo/manual) → não ocupa espaço.
//
// D-1086: fechada, ela é uma linha só, com o começo da contextualização; os dois
// blocos abertos tomavam ~127 px da coluna e deixavam a lista com duas cenas.
// É consulta: quem precisa dela abre num clique, e o resto do tempo a altura é
// da lista. `<details>` nativo: abre no teclado e no leitor de tela sem estado.

export interface AberturaEditorialProps {
  fraseGancho?: string;
  fraseGanchoHms?: string;
  contextualizacao?: string;
}

const ROTULO = 'text-micro text-fg-3';

export function AberturaEditorial({ fraseGancho, fraseGanchoHms, contextualizacao }: AberturaEditorialProps) {
  const contexto = contextualizacao?.trim();
  const gancho = fraseGancho?.trim();
  const ganchoHms = fraseGanchoHms?.trim();
  if (!contexto && !gancho) return null;

  return (
    <details
      className="group shrink-0 border-b border-fio bg-poco"
      aria-label="Abertura editorial do corte"
      data-testid="abertura-editorial"
    >
      <summary
        data-sala=""
        className={cn('flex cursor-pointer list-none items-center gap-2 px-3 py-1.5 transition-colors hover:bg-vidro-2 motion-reduce:transition-none [&::-webkit-details-marker]:hidden', FOCO)}
      >
        <Icon name="chevron-right" className="shrink-0 text-fg-2 transition-transform group-open:rotate-90 motion-reduce:transition-none" />
        <span className={cn(ROTULO, 'shrink-0')}>Abertura</span>
        {/* Fechada, o começo do texto basta para lembrar do que se trata. */}
        <span className="min-w-0 truncate text-pequeno text-fg-2 group-open:hidden">
          {contexto ?? `“${gancho}”`}
        </span>
      </summary>
      <div className="px-3 pb-2.5">
        {contexto && (
          <div className="flex items-start gap-2">
            <Icon name="sparkles" className="mt-0.5 shrink-0 text-iris" />
            <div className="min-w-0">
              <div className={ROTULO}>Contextualização · 1ª cena</div>
              <p className="mt-0.5 text-corpo leading-snug text-fg">{contexto}</p>
            </div>
          </div>
        )}
        {gancho && (
          <div className={cn('flex items-start gap-2', contexto && 'mt-2')}>
            <Icon name="quote" className="mt-0.5 shrink-0 text-fg-2" />
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className={ROTULO}>Gancho</span>
                {ganchoHms && (
                  <span className="num text-micro text-fg-3">{ganchoHms}</span>
                )}
              </div>
              <p className="mt-0.5 text-pequeno italic leading-snug text-fg-2">“{gancho}”</p>
            </div>
          </div>
        )}
      </div>
    </details>
  );
}
