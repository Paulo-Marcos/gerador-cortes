import { Button } from '@/components/ui/button';
import { Tooltip } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import type { LayoutPreset } from '@/types/presets';
import { ICONE_DO_CONCEITO, Icon } from '@/upgrade/Icon';
import { FOCO } from '../salaDoEditor';

// D-923: os presets de posição do estilo que vale no modal, como fichas — um
// clique aplica (antes era escolher no select e depois "Aplicar"). Renomear e
// remover agem sobre o preset aplicado.

export function BarraDePresets({
  presets,
  selecionado,
  onAplicar,
  onRenomear,
  onRemover,
  renomeando,
  removendo,
  estilo,
}: {
  presets: LayoutPreset[];
  selecionado: string;
  onAplicar: (id: string) => void;
  onRenomear: () => void;
  onRemover: () => void;
  renomeando: boolean;
  removendo: boolean;
  estilo: 'atual' | 'limpo';
}) {
  return (
    <section aria-label="Presets" className="rounded-campo border border-fio bg-poco p-2">
      <div className="mb-1.5 flex items-center gap-1.5">
        <Icon name="bookmark" className="text-fg-3" />
        <span className="text-micro text-fg-3">
          Presets do estilo {estilo === 'limpo' ? 'Limpo' : 'Atual'}
        </span>
        <div className="flex-1" />
        <Tooltip label="Renomear o preset aplicado" side="top">
          <span>
            <Button
              type="button"
              variant="fantasma"
              size="pq" soIcone
              onClick={onRenomear}
              disabled={!selecionado || renomeando}
              aria-label="Renomear preset selecionado"
            >
              <Icon name={ICONE_DO_CONCEITO.renomear} />
            </Button>
          </span>
        </Tooltip>
        <Tooltip label="Remover o preset aplicado" side="top">
          <span>
            <Button
              type="button"
              variant="fantasma"
              size="pq" soIcone
              onClick={onRemover}
              disabled={!selecionado || removendo}
              aria-label="Remover preset selecionado"
            >
              <Icon name={removendo ? 'loader-2' : 'trash-2'} className={removendo ? 'animate-spin' : undefined} />
            </Button>
          </span>
        </Tooltip>
      </div>
      {presets.length === 0 ? (
        <p className="text-pequeno text-fg-3">
          Nenhum preset neste estilo ainda. Ajuste e use “Salvar como novo”.
        </p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {presets.map((preset) => (
            <button
              key={preset.id}
              type="button"
              data-sala=""
              aria-pressed={selecionado === preset.id}
              onClick={() => onAplicar(preset.id)}
              className={cn(
                'max-w-full truncate rounded-pilula border px-2.5 py-1 text-pequeno transition-colors duration-150 motion-reduce:transition-none',
                FOCO,
                selecionado === preset.id
                  ? 'border-iris-fio bg-iris-suave text-iris-2'
                  : 'border-fio-2 bg-vidro-2 text-fg-2 hover:bg-vidro-3 hover:text-fg',
              )}
            >
              {preset.nome}
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

/**
 * D-928: os presets na faixa do estilo, sempre à vista (não é mais um grupo do
 * menu): escolher na lista já aplica; renomear e remover agem sobre o aplicado.
 */
export function PresetsNaFaixa({
  presets,
  selecionado,
  onAplicar,
  onRenomear,
  onRemover,
  renomeando,
  removendo,
}: Omit<Parameters<typeof BarraDePresets>[0], 'estilo'>) {
  return (
    <div role="group" aria-label="Presets" className="flex items-center gap-1">
      <Icon name="bookmark" className="text-fg-3" />
      <select
        aria-label="Preset do estilo"
        value={selecionado}
        onChange={(e) => e.target.value && onAplicar(e.target.value)}
        data-sala=""
        className={cn('h-7 max-w-[220px] rounded-campo border border-campo bg-poco px-2 text-pequeno text-fg', FOCO)}
      >
        <option value="">{presets.length === 0 ? 'Nenhum preset neste estilo' : 'Aplicar um preset…'}</option>
        {presets.map((preset) => (
          <option key={preset.id} value={preset.id}>
            {preset.nome}
          </option>
        ))}
      </select>
      <Button type="button" variant="fantasma" size="pq" soIcone onClick={onRenomear} disabled={!selecionado || renomeando} aria-label="Renomear preset selecionado">
        <Icon name={ICONE_DO_CONCEITO.renomear} />
      </Button>
      <Button type="button" variant="fantasma" size="pq" soIcone onClick={onRemover} disabled={!selecionado || removendo} aria-label="Remover preset selecionado">
        <Icon name={removendo ? 'loader-2' : 'trash-2'} className={removendo ? 'animate-spin' : undefined} />
      </Button>
    </div>
  );
}
