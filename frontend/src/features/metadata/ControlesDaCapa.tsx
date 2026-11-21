import { CLASSES_DO_CAMPO } from '@/components/ui/field';
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

const CAMPO = `${CLASSES_DO_CAMPO} h-10 px-3`;

type Props = {
  painel: PainelDaCapa;
  rascunho: EstiloDaCapaTiktok;
  onMudar: (rascunho: EstiloDaCapaTiktok) => void;
};

/** `semCorte`: aberto pela tela de Canais (D-947), o palco seguido é o do canal. */
export function EscolhaDoEstilo({ painel, rascunho, onMudar, semCorte = false }: Props & { semCorte?: boolean }) {
  const estilo = rascunho.estilo ?? 'palco';
  return (
    <div className="grid gap-2">
      <div role="radiogroup" aria-label="Estilo da capa" className="flex flex-wrap gap-1">
        {painel.estilos.map((opcao) => (
          <label
            key={opcao}
            data-sala=""
            className="flex min-h-[30px] cursor-pointer items-center gap-1.5 rounded-pilula border border-fio-2 px-3 text-pequeno text-fg transition-colors duration-150 hover:bg-vidro-2 has-[:checked]:border-iris-fio has-[:checked]:bg-iris-suave has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-foco motion-reduce:transition-none"
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
        <p className="text-pequeno text-fg-3">
          O palco {semCorte ? 'do canal' : 'deste corte'} está no estilo <strong>{painel.estilo_do_palco}</strong>.
        </p>
      )}
      {painel.efetivo.estilo === 'limpo' && (
        <label className="grid gap-1 text-pequeno text-fg-2">
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
      <legend className="mb-1 text-pequeno text-fg">O que aparece</legend>
      {(painel.componentes as ComponenteDaCapa[]).map((componente) => {
        const disponivel = podeAparecer(componente, painel.efetivo.estilo);
        return (
          <label
            key={componente}
            className="flex items-center gap-2 text-pequeno text-fg aria-disabled:text-fg-off"
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
            {!disponivel && <span className="text-micro text-fg-3">(só no limpo)</span>}
          </label>
        );
      })}
    </fieldset>
  );
}
