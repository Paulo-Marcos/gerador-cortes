// D-905: onde o corte já está INTEIRO — os três ícones de rede do cartão.
//
// Mesmo desenho dos chips da central de prontos (D-611), para o operador ler
// as duas telas com o mesmo vocabulário: aceso é "já está", apagado é "falta".
// A diferença é a pergunta: lá é por short, aqui é pelo corte inteiro.
import { cn } from '@/lib/utils';
import { Icon } from '@/upgrade/Icon';
import { sinaisDasRedes } from './sinaisDasRedes';
import type { FireComBruto } from './shortsApi';

export function RedesDoFire({ fire }: { fire: FireComBruto }) {
  return (
    <div className="flex flex-wrap gap-1" aria-label="Redes onde todos os shorts prontos já estão">
      {sinaisDasRedes(fire).map((rede) => (
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
