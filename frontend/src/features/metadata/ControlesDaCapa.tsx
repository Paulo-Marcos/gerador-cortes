import type { ComponenteDaCapa, EstiloDaCapaTiktok } from '@/types/presets';
import {
  comVisibilidade,
  NOMES_DOS_COMPONENTES,
  NOMES_DOS_ESTILOS,
  podeAparecer,
  type PainelDaCapa,
} from './estiloDaCapa';

// D-933: os controles do modal "Estilizar capa" — estilo, fundo e o que
// aparece. Componente burro: recebe o painel efetivo e devolve o rascunho novo.

const CAMPO =
  'h-8 rounded-[var(--radius-xs)] border border-[var(--wb-border)] bg-[var(--wb-bg-card)] px-2 text-[12px] text-[var(--wb-text)]';

type Props = {
  painel: PainelDaCapa;
  rascunho: EstiloDaCapaTiktok;
  onMudar: (rascunho: EstiloDaCapaTiktok) => void;
};

export function EscolhaDoEstilo({ painel, rascunho, onMudar }: Props) {
  const estilo = rascunho.estilo ?? 'palco';
  return (
    <div className="grid gap-2">
      <div role="radiogroup" aria-label="Estilo da capa" className="flex flex-wrap gap-1">
        {painel.estilos.map((opcao) => (
          <label
            key={opcao}
            className="flex cursor-pointer items-center gap-1.5 rounded-[var(--radius-xs)] border border-[var(--wb-border)] px-2 py-1 text-[12px] text-[var(--wb-text)] has-[:checked]:border-wb-accent has-[:checked]:bg-wb-accent/10"
          >
            <input
              type="radio"
              name="estilo-da-capa"
              value={opcao}
              checked={estilo === opcao}
              onChange={() => onMudar({ ...rascunho, estilo: opcao as EstiloDaCapaTiktok['estilo'] })}
            />
            {NOMES_DOS_ESTILOS[opcao as keyof typeof NOMES_DOS_ESTILOS] ?? opcao}
          </label>
        ))}
      </div>
      {estilo === 'palco' && (
        <p className="text-[11px] text-[var(--wb-text-mute)]">
          O palco deste corte está no estilo <strong>{painel.estilo_do_palco}</strong>.
        </p>
      )}
      {painel.efetivo.estilo === 'limpo' && (
        <label className="grid gap-1 text-[12px] text-[var(--wb-text-mute)]">
          Fundo
          <select
            aria-label="Fundo da capa"
            className={CAMPO}
            value={rascunho.fundo ?? ''}
            onChange={(e) => {
              const { fundo: _antigo, ...resto } = rascunho;
              onMudar(e.target.value ? { ...resto, fundo: e.target.value } : resto);
            }}
          >
            <option value="">O do palco ({painel.efetivo.fundo})</option>
            {painel.fundos.map((fundo) => (
              <option key={fundo} value={fundo}>
                {fundo}
              </option>
            ))}
          </select>
        </label>
      )}
    </div>
  );
}

export function ComponentesDaCapa({ painel, rascunho, onMudar }: Props) {
  return (
    <fieldset className="grid gap-1">
      <legend className="mb-1 text-[12px] font-semibold text-[var(--wb-text)]">O que aparece</legend>
      {(painel.componentes as ComponenteDaCapa[]).map((componente) => {
        const disponivel = podeAparecer(componente, painel.efetivo.estilo);
        return (
          <label
            key={componente}
            className="flex items-center gap-2 text-[12px] text-[var(--wb-text)] aria-disabled:opacity-50"
            aria-disabled={!disponivel}
            title={disponivel ? undefined : 'Só no estilo limpo.'}
          >
            <input
              type="checkbox"
              disabled={!disponivel}
              checked={disponivel && Boolean(painel.efetivo.visiveis[componente])}
              onChange={(e) => onMudar(comVisibilidade(rascunho, componente, e.target.checked))}
            />
            {NOMES_DOS_COMPONENTES[componente]}
            {!disponivel && <span className="text-[11px] text-[var(--wb-text-mute)]">(só no limpo)</span>}
          </label>
        );
      })}
    </fieldset>
  );
}
