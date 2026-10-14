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
}: {
  alvo: AlvoDoEstilo;
  estilo: EstiloDoPalco;
  origem: PalcoDoEscopo['origem'] | undefined;
  onEstilo: (estilo: EstiloDoPalco) => void;
}) {
  const nome = ESTILOS.find((e) => e.id === estilo)?.nome ?? estilo;
  return (
    <section
      aria-label="Estilo do palco"
      className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-[var(--wb-border-soft)] bg-[var(--wb-bg-inset)] px-5 py-2"
    >
      <Icon name="layout-template" className="text-[var(--wb-accent)]" />
      <span className="text-[13px] text-[var(--wb-text)]">
        Estilo <strong>{nome}</strong>
        <span className="text-[var(--wb-text-dim)]"> · {origem ? ORIGEM[origem] : 'carregando…'}</span>
      </span>
      <div className="flex-1" />
      {alvo === 'global' ? (
        <Link to="/canais" className="text-[12px] font-semibold text-[var(--wb-accent)] underline-offset-2 hover:underline">
          O estilo global se troca em Canais → Palco do canal
        </Link>
      ) : (
        <div role="radiogroup" aria-label={`Estilo deste ${alvo}`} className="flex items-center gap-1">
          <span className="mr-1 text-[12px] text-[var(--wb-text-dim)]">Usar neste {alvo}:</span>
          {ESTILOS.map((opcao) => (
            <button
              key={opcao.id}
              type="button"
              role="radio"
              aria-checked={estilo === opcao.id}
              title={opcao.descricao}
              onClick={() => onEstilo(opcao.id)}
              className={cn(
                'h-7 rounded-full border px-3 text-[12px] font-semibold transition-colors',
                estilo === opcao.id
                  ? 'border-[var(--wb-accent)] bg-[var(--wb-accent)] text-[var(--wb-accent-fg)]'
                  : 'border-[var(--wb-border)] bg-[var(--wb-bg-card)] text-[var(--wb-text-mute)] hover:text-[var(--wb-text)]',
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
            'h-7 rounded-[var(--radius-xs)] border px-2.5 text-[12px] font-semibold transition-colors disabled:opacity-60',
            fundo === opcao.id
              ? 'border-[var(--wb-accent)] bg-[var(--wb-accent-soft)] text-[var(--wb-accent)]'
              : 'border-[var(--wb-border)] bg-[var(--wb-bg-card)] text-[var(--wb-text-mute)] hover:text-[var(--wb-text)]',
          )}
        >
          {opcao.nome}
        </button>
      ))}
    </div>
  );
}
