// D-905: onde o corte já está INTEIRO — os três ícones de rede da linha do Fire.
//
// Mesmo desenho dos chips da central de prontos (D-611), para o operador ler
// as duas telas com o mesmo vocabulário: aceso é "já está", apagado é "falta".
// A diferença é a pergunta: lá é por short, aqui é pelo corte inteiro.
// D-1168: tokens da sala; o estado é dito também pela FORMA (visto × anel tracejado).
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
            'inline-flex items-center gap-0.5 rounded-etiqueta px-1.5 py-0.5 text-micro',
            rede.ativa ? 'bg-vidro-3 text-ok' : 'text-fg-3',
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
