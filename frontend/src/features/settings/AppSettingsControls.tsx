// D-191: controles reutilizáveis das configurações GLOBAIS (app_settings do
// settings.db): filtro global, logs, render.* e o status do layout YouTube
// padrão global. Componente autocontido (faz suas próprias queries/mutations) —
// usado tanto no modal "Ajustes" quanto na página de Configurações, para que a
// mesma config apareça e seja editável nos dois lugares sem duplicar lógica.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Loader2 } from 'lucide-react';
import { api } from '@/lib/api';
import type { FiltroExport, LogLevel, RenderSettings } from '@/types/models';
import { cn } from '@/lib/utils';
import { useToast } from '@/components/ui/toaster';

export const LOG_OPTIONS: Array<{ value: LogLevel; label: string; description: string }> = [
  {
    value: 'disabled',
    label: 'Desabilitado',
    description: 'Oculta logs operacionais durante o processamento.',
  },
  {
    value: 'info',
    label: 'Informativo',
    description: 'Mostra inicio, etapas, conclusao, erros e tempo decorrido.',
  },
  {
    value: 'debug',
    label: 'Debug',
    description: 'Mostra detalhes completos para investigar problemas.',
  },
];

const DEFAULT_FILTER = 'bypass_dourado_aberto';
const DEFAULT_RENDER: RenderSettings = {
  cooldown_sec: 0,
  overlay_concurrency: 4,
  bundle_cache_enabled: true,
  overlay_codec: 'prores_4444',
  overlay_max_attempts: 3,
  grade_global_quality: 30,
};
const FALLBACK_FILTERS: FiltroExport[] = [
  { id: 'cinematic_iii', nome: 'Cinematico III', descricao: 'Referencia pesada', tem_filtro_visual: true },
  {
    id: 'bypass_dourado_aberto',
    nome: 'Bypass Cinematico Dourado',
    descricao: 'Padrao leve',
    tem_filtro_visual: true,
  },
];

type UpdateBody = Exclude<Parameters<typeof api.atualizarSettings>[0], LogLevel>;

const controlCls =
  'h-10 rounded-[var(--radius-sm)] border border-[var(--wb-border)] bg-[var(--wb-bg-card)] px-3 text-sm font-semibold text-[var(--wb-text)] outline-none transition-colors focus:border-[var(--wb-accent)] disabled:cursor-wait disabled:opacity-60';
const labelCls = 'grid gap-1.5 text-xs font-semibold text-[var(--wb-text-mute)]';
const sectionLabelCls =
  'text-xs font-bold uppercase tracking-[0.08em] text-[var(--wb-text-mute)]';

export function AppSettingsControls() {
  const queryClient = useQueryClient();
  const { notify } = useToast();

  const settingsQuery = useQuery({ queryKey: ['app-settings'], queryFn: api.obterSettings });
  const filtersQuery = useQuery({ queryKey: ['export-filtros'], queryFn: () => api.listarFiltros() });

  const updateMutation = useMutation({
    mutationFn: (body: UpdateBody) => api.atualizarSettings(body),
    onSuccess: (settings) => {
      queryClient.setQueryData(['app-settings'], settings);
      notify('Ajustes atualizados.', { tone: 'success', title: 'Ajustes' });
    },
    onError: () => notify('Nao foi possivel salvar o ajuste.', { tone: 'error', title: 'Ajustes' }),
  });

  const data = settingsQuery.data;
  const selectedLevel = data?.log_level ?? 'disabled';
  const filtros = filtersQuery.data?.filtros?.length ? filtersQuery.data.filtros : FALLBACK_FILTERS;
  const selectedFilter = data?.filtro_global_padrao ?? DEFAULT_FILTER;
  const render = data?.render ?? DEFAULT_RENDER;
  const layoutGlobal = data?.youtube_layout_padrao_global ?? '{}';
  const temLayoutGlobal = layoutGlobal.trim() !== '' && layoutGlobal.trim() !== '{}';
  const isBusy = settingsQuery.isLoading || updateMutation.isPending;

  const patchRender = (patch: Partial<RenderSettings>) =>
    updateMutation.mutate({ render: { ...render, ...patch } });
  const onBlurNumber =
    (campo: keyof RenderSettings, atual: number) => (e: React.FocusEvent<HTMLInputElement>) => {
      const valor = Number(e.target.value);
      if (Number.isFinite(valor) && valor !== atual) patchRender({ [campo]: valor });
    };

  return (
    <div className="grid gap-3">
      {settingsQuery.isError && (
        <p className="rounded-[var(--radius-sm)] border border-error/30 bg-error/10 px-3 py-2 text-sm text-error">
          Nao foi possivel carregar os ajustes.
        </p>
      )}

      <label className="grid gap-1.5">
        <span className={sectionLabelCls}>Filtro global padrao</span>
        <select
          value={selectedFilter}
          disabled={isBusy}
          onChange={(event) => updateMutation.mutate({ filtro_global_padrao: event.target.value })}
          className={controlCls}
        >
          {filtros.map((filtro) => (
            <option key={filtro.id} value={filtro.id}>
              {filtro.nome}
            </option>
          ))}
        </select>
      </label>

      <div className="grid gap-1.5">
        <span className={sectionLabelCls}>Layout YouTube padrao global</span>
        <div className="flex items-center justify-between gap-3 rounded-[var(--radius-sm)] border border-[var(--wb-border)] bg-[var(--wb-bg-card)] px-3 py-2 text-sm">
          <span className="text-[var(--wb-text)]">
            {temLayoutGlobal ? 'Definido' : 'Nenhum'}
            <span className="ml-2 text-xs text-[var(--wb-text-mute)]">
              (edite pelo editor, em Layout YouTube → “Definir como padrao global”)
            </span>
          </span>
          {temLayoutGlobal && (
            <button
              type="button"
              disabled={isBusy}
              onClick={() => updateMutation.mutate({ youtube_layout_padrao_global: '{}' })}
              className="shrink-0 rounded-[var(--radius-sm)] border border-[var(--wb-border)] px-2 py-1 text-xs font-semibold text-[var(--wb-text)] hover:bg-[var(--wb-bg-card-elev)] disabled:opacity-60"
            >
              Limpar
            </button>
          )}
        </div>
      </div>

      <div className="h-px bg-[var(--wb-border)]" />

      <div className="grid gap-2" role="radiogroup" aria-label="Nivel de logs">
        <span className={sectionLabelCls}>Logs</span>
        {LOG_OPTIONS.map((option) => {
          const active = selectedLevel === option.value;
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={active}
              disabled={isBusy}
              onClick={() => updateMutation.mutate({ log_level: option.value })}
              className={cn(
                'grid grid-cols-[1fr_20px] gap-3 rounded-[var(--radius)] border p-3 text-left transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--wb-focus)] disabled:cursor-wait disabled:opacity-60',
                active
                  ? 'border-[var(--wb-accent)] bg-[var(--wb-accent-soft)]'
                  : 'border-[var(--wb-border)] bg-[var(--wb-bg-card)] hover:bg-[var(--wb-bg-card-elev)]',
              )}
            >
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-[var(--wb-text)]">
                  {option.label}
                </span>
                <span className="mt-1 block text-xs leading-5 text-[var(--wb-text-mute)]">
                  {option.description}
                </span>
              </span>
              <span
                className={cn(
                  'mt-0.5 flex h-5 w-5 items-center justify-center rounded-full border',
                  active
                    ? 'border-[var(--wb-accent)] bg-[var(--wb-accent)] text-white'
                    : 'border-[var(--wb-border)] text-transparent',
                )}
                aria-hidden
              >
                <Check size={13} />
              </span>
            </button>
          );
        })}
      </div>

      <div className="h-px bg-[var(--wb-border)]" />

      <div className="grid gap-2">
        <span className={sectionLabelCls}>Renderizacao</span>
        <div className="grid grid-cols-2 gap-3">
          <label className={labelCls}>
            Concorrencia de overlay
            <input
              type="number"
              min={1}
              key={`conc-${render.overlay_concurrency}`}
              defaultValue={render.overlay_concurrency}
              disabled={isBusy}
              onBlur={onBlurNumber('overlay_concurrency', render.overlay_concurrency)}
              className={controlCls}
            />
          </label>
          <label className={labelCls}>
            Tentativas por overlay
            <input
              type="number"
              min={1}
              key={`att-${render.overlay_max_attempts}`}
              defaultValue={render.overlay_max_attempts}
              disabled={isBusy}
              onBlur={onBlurNumber('overlay_max_attempts', render.overlay_max_attempts)}
              className={controlCls}
            />
          </label>
          <label className={labelCls}>
            Cooldown entre renders (s)
            <input
              type="number"
              min={0}
              key={`cd-${render.cooldown_sec}`}
              defaultValue={render.cooldown_sec}
              disabled={isBusy}
              onBlur={onBlurNumber('cooldown_sec', render.cooldown_sec)}
              className={controlCls}
            />
          </label>
          <label className={labelCls}>
            Qualidade do grade (QSV, 1-51)
            <input
              type="number"
              min={1}
              max={51}
              key={`gq-${render.grade_global_quality}`}
              defaultValue={render.grade_global_quality}
              disabled={isBusy}
              onBlur={onBlurNumber('grade_global_quality', render.grade_global_quality)}
              className={controlCls}
            />
          </label>
          <label className={labelCls}>
            Codec do overlay
            <select
              value={render.overlay_codec}
              disabled={isBusy}
              onChange={(event) =>
                patchRender({ overlay_codec: event.target.value as RenderSettings['overlay_codec'] })
              }
              className={controlCls}
            >
              <option value="prores_4444">ProRes 4444</option>
              <option value="vp9">VP9 (.webm)</option>
            </select>
          </label>
          <label className="flex items-center gap-2 self-end pb-2 text-sm font-semibold text-[var(--wb-text)]">
            <input
              type="checkbox"
              checked={render.bundle_cache_enabled}
              disabled={isBusy}
              onChange={(event) => patchRender({ bundle_cache_enabled: event.target.checked })}
            />
            Cache de bundle Remotion
          </label>
        </div>
      </div>

      {isBusy && (
        <p className="inline-flex items-center gap-2 text-xs text-[var(--wb-text-mute)]">
          <Loader2 size={14} className="animate-spin" aria-hidden />
          Salvando ajuste...
        </p>
      )}
    </div>
  );
}
