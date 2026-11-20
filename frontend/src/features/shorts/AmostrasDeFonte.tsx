import type { CSSProperties } from 'react';
import { useFontesDoRender } from '@/lib/fontesDoRender';
import { cn } from '@/lib/utils';
import { FONTES_DA_LEGENDA } from './LegendaPrevia';

// D-563: cada opção de fonte desenhada NA PRÓPRIA FONTE — a diferença entre elas é
// inteiramente visual, e um nome sozinho não decide nada.
//
// D-1139: as cinco fontes do vídeo não vêm mais no `index.html`; este seletor as
// pede ao aparecer (e só então), e as amostras ficam ocultas até elas chegarem.
interface Props {
  /** Família escolhida; vazio = a do canal. */
  valor: string;
  onEscolher: (familia: string) => void;
  /** Início do `aria-label`: "Fonte da legenda" ou "Fonte do gancho". */
  rotulo: string;
  /** Classes da amostra escolhida (cada modal tem a sua cor de seleção). */
  classeDaEscolhida: string;
  desabilitado?: boolean;
}

export function AmostrasDeFonte({ valor, onEscolher, rotulo, classeDaEscolhida, desabilitado }: Props) {
  const prontas = useFontesDoRender(FONTES_DA_LEGENDA.map((opcao) => opcao.familia));
  return (
    <div className={cn('flex flex-wrap items-center gap-1.5', !prontas && 'invisible')}>
      {FONTES_DA_LEGENDA.map((opcao) => {
        const ativa = valor === opcao.familia;
        return (
          <button
            key={opcao.familia || 'padrao'}
            type="button"
            disabled={desabilitado}
            title={opcao.nome}
            aria-label={`${rotulo}: ${opcao.nome}`}
            aria-pressed={ativa}
            onClick={() => onEscolher(opcao.familia)}
            className={cn(
              'rounded-[7px] border px-2 py-1 text-linha font-extrabold leading-none transition-colors [font-family:var(--fonte,inherit)] disabled:opacity-50',
              ativa ? classeDaEscolhida : 'border-fio-2 hover:bg-poco',
            )}
            style={{ '--fonte': opcao.familia } as CSSProperties}
          >
            Aa
          </button>
        );
      })}
    </div>
  );
}
