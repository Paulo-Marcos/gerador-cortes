// D-987: onde os cortes HORIZONTAIS da live já estão inteiros — os dois
// ícones de rede do card da Biblioteca.
//
// Mesmo desenho e mesmo vocabulário dos chips do cartão do Fire (D-905), para
// o operador ler as duas telas do mesmo jeito: aceso é "já está", apagado é
// "falta". A diferença é a altura da pergunta — lá o corte, aqui a live.
import { cn } from '@/lib/utils';
import { sinaisDasRedesDoProjeto } from '@/features/projetos/sinaisDasRedesDoProjeto';
import type { Projeto } from '@/types/models';
import { Icon } from '@/upgrade/Icon';

export function RedesDoProjeto({ projeto }: { projeto: Projeto }) {
  // Live sem corte pronto não tem o que dizer: dois chips mortos em todo card
  // recém-baixado seriam ruído, e a fita de etapas já conta que a publicação
  // nem começou. O cartão do Fire mostra sempre porque todo Fire tem shorts.
  if (projeto.total_video_pronto === 0) return null;

  return (
    <div className="flex flex-wrap gap-1" aria-label="Redes onde todos os cortes prontos já estão">
      {sinaisDasRedesDoProjeto(projeto).map((rede) => (
        <span
          key={rede.id}
          data-rede={rede.id}
          data-ativa={rede.ativa ? 'sim' : 'nao'}
          className={cn(
            'inline-flex items-center gap-0.5 rounded-[4px] px-1.5 py-0.5 font-code text-[11px] uppercase tracking-wide',
            rede.ativa
              ? 'bg-[var(--wb-ok-soft)] text-[var(--wb-ok-ink)]'
              : 'bg-[var(--wb-bg-inset)] text-[var(--wb-text-mute)] opacity-60',
          )}
          title={rede.titulo}
        >
          <Icon name={rede.ativa ? 'check' : 'circle-dashed'} />
          {rede.rotulo}
        </span>
      ))}
    </div>
  );
}
