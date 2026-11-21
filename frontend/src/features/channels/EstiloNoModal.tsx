import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';
import type { EstiloDoPalco } from '@/shared/palco/presetsPorEstilo';
import { Icon } from '@/upgrade/Icon';
import type { PalcoDoEscopo } from './api/canais';
import type { AlvoDoEstilo } from './palcoDoEscopo';
import { ESTILOS, FUNDOS } from './PalcoComponentesSection';

// D-923: as peças de tela do estilo por projeto/corte nos modais de posição
// (o do pós e o do short). A regra e os dados moram em `palcoDoEscopo.tsx`.

const ORIGEM: Record<PalcoDoEscopo['origem'], string> = {
  canal: 'o palco global do canal',
  projeto: 'ajustado para este projeto',
  corte: 'ajustado para este corte',
};

/**
 * A faixa do topo do modal: qual estilo está valendo, de onde ele vem e a troca
 * — que vale só para o corte ou o projeto do modal, nunca para o canal.
 */
export function EstiloNoModal({
  alvo,
  estilo,
  origem,
  onEstilo,
  acoes,
}: {
  alvo: AlvoDoEstilo;
  estilo: EstiloDoPalco;
  origem: PalcoDoEscopo['origem'] | undefined;
  onEstilo: (estilo: EstiloDoPalco) => void;
  /** D-928: o que mais fica sempre à vista na faixa (os presets do estilo). */
  acoes?: ReactNode;
}) {
  const nome = ESTILOS.find((e) => e.id === estilo)?.nome ?? estilo;
  return (
    <section
      aria-label="Estilo do palco"
      className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-fio bg-poco px-5 py-2"
    >
      <Icon name="layout-template" className="text-iris" />
      <span className="text-corpo text-fg">
        Estilo <strong>{nome}</strong>
        <span className="text-fg-3"> · {origem ? ORIGEM[origem] : 'carregando…'}</span>
      </span>
      {acoes}
      <div className="flex-1" />
      {alvo === 'global' ? (
        <Link to="/canais" className="text-pequeno font-semibold text-iris underline-offset-2 hover:underline">
          O estilo global se troca em Canais → Palco do canal
        </Link>
      ) : (
        <div role="radiogroup" aria-label={`Estilo deste ${alvo}`} className="flex items-center gap-1">
          <span className="mr-1 text-pequeno text-fg-3">Usar neste {alvo}:</span>
          {ESTILOS.map((opcao) => (
            <button
              key={opcao.id}
              type="button"
              role="radio"
              aria-checked={estilo === opcao.id}
              title={opcao.descricao}
              onClick={() => onEstilo(opcao.id)}
              className={cn(
                'h-7 rounded-full border px-3 text-pequeno font-semibold transition-colors',
                estilo === opcao.id
                  ? 'border-iris bg-iris-suave text-iris'
                  : 'border-fio-2 bg-painel-solido text-fg-2 hover:text-fg',
              )}
            >
              {opcao.nome}
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

/** Os fundos do estilo limpo, para o modal (a escolha vale para o corte ou o projeto). */
export function FundosDoLimpo({ fundo, onFundo, desabilitado }: { fundo: string; onFundo: (f: string) => void; desabilitado?: boolean }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {FUNDOS.map((opcao) => (
        <button
          key={opcao.id}
          type="button"
          aria-pressed={fundo === opcao.id}
          disabled={desabilitado}
          onClick={() => onFundo(opcao.id)}
          className={cn(
            'h-7 rounded-full border px-2.5 text-pequeno font-semibold transition-colors disabled:opacity-60',
            fundo === opcao.id
              ? 'border-iris bg-iris-suave text-iris'
              : 'border-fio-2 bg-painel-solido text-fg-2 hover:text-fg',
          )}
        >
          {opcao.nome}
        </button>
      ))}
    </div>
  );
}
