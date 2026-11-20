// D-987: onde os cortes HORIZONTAIS da live já estão inteiros — os dois
// ícones de rede do card da Biblioteca.
//
// Mesmo desenho e mesmo vocabulário dos chips do cartão do Fire (D-905), para
// o operador ler as duas telas do mesmo jeito: aceso é "já está", apagado é
// "falta". A diferença é a altura da pergunta — lá o corte, aqui a live.
// D-1148 (E-069 H-15): a roupa da Sala escura — `Etiqueta` (ladrilho de 6), sem caixa-alta;
// aceso leva o visto e o texto cheio, apagado leva o círculo tracejado e o texto em fg-3.
import { Etiqueta } from '@/components/ui/etiqueta';
import { Icon } from '@/components/ui/icon';
import { cn } from '@/lib/utils';
import { sinaisDasRedesDoProjeto } from '@/features/projetos/sinaisDasRedesDoProjeto';
import type { Projeto } from '@/types/models';

export function RedesDoProjeto({ projeto }: { projeto: Projeto }) {
  // Live sem corte pronto não tem o que dizer: dois chips mortos em todo card
  // recém-baixado seriam ruído.
  if (projeto.total_video_pronto === 0) return null;

  return (
    <div className="flex flex-wrap gap-1" aria-label="Redes onde todos os cortes prontos já estão">
      {sinaisDasRedesDoProjeto(projeto).map((rede) => (
        <Etiqueta
          key={rede.id}
          data-rede={rede.id}
          data-ativa={rede.ativa ? 'sim' : 'nao'}
          title={rede.titulo}
          className={cn('gap-1', rede.ativa ? 'text-fg' : 'text-fg-3')}
        >
          <Icon name={rede.ativa ? 'check' : 'circle-dashed'} className="size-3" />
          {rede.rotulo}
        </Etiqueta>
      ))}
    </div>
  );
}
