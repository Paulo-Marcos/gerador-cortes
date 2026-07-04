import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Loader2 } from 'lucide-react';
import { api } from '@/lib/api';
import type { AppSettings, FiltroExport, LogLevel } from '@/types/models';
import { cn } from '@/lib/utils';
import { Modal } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toaster';

interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
}

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

const API_BASE =
  (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:8000/api';
const DEFAULT_FILTER = 'bypass_dourado_aberto';
const FALLBACK_FILTERS: FiltroExport[] = [
  {
    id: 'cinematic_iii',
    nome: 'Cinematico III',
    descricao: 'Referencia pesada',
    tem_filtro_visual: true,
  },
  {
    id: 'bypass_dourado_aberto',
    nome: 'Bypass Cinematico Dourado',
    descricao: 'Padrao leve',
    tem_filtro_visual: true,
  },
];

async function atualizarFiltroGlobal(filtro: string): Promise<AppSettings> {
  const response = await fetch(`${API_BASE}/settings`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ filtro_global_padrao: filtro }),
  });

  if (!response.ok)
    throw new Error(await response.text().catch(() => 'Erro ao salvar filtro global.'));
  return (await response.json()) as AppSettings;
}

export function SettingsModal({ open, onClose }: SettingsModalProps) {
  const queryClient = useQueryClient();
  const { notify } = useToast();

  const settingsQuery = useQuery({
    queryKey: ['app-settings'],
    queryFn: api.obterSettings,
    enabled: open,
  });
  const filtersQuery = useQuery({
    queryKey: ['export-filtros'],
    queryFn: () => api.listarFiltros(),
    enabled: open,
  });

  const settingsMutation = useMutation({
    mutationFn: (logLevel: AppSettings['log_level']) => api.atualizarSettings(logLevel),
    onMutate: async (logLevel) => {
      await queryClient.cancelQueries({ queryKey: ['app-settings'] });
      const previous = queryClient.getQueryData<AppSettings>(['app-settings']);
      queryClient.setQueryData<AppSettings>(['app-settings'], {
        log_level: logLevel,
        filtro_global_padrao: previous?.filtro_global_padrao ?? DEFAULT_FILTER,
      });
      return { previous };
    },
    onSuccess: (settings) => {
      queryClient.setQueryData(['app-settings'], settings);
      notify('Nivel de logs atualizado.', { tone: 'success', title: 'Ajustes' });
    },
    onError: (_error, _logLevel, context) => {
      if (context?.previous) queryClient.setQueryData(['app-settings'], context.previous);
      notify('Nao foi possivel salvar o nivel de logs.', { tone: 'error', title: 'Ajustes' });
    },
  });
  const filterMutation = useMutation({
    mutationFn: atualizarFiltroGlobal,
    onMutate: async (filtro) => {
      await queryClient.cancelQueries({ queryKey: ['app-settings'] });
      const previous = queryClient.getQueryData<AppSettings>(['app-settings']);
      queryClient.setQueryData<AppSettings>(['app-settings'], {
        log_level: previous?.log_level ?? 'disabled',
        filtro_global_padrao: filtro,
      });
      return { previous };
    },
    onSuccess: (settings) => {
      queryClient.setQueryData(['app-settings'], settings);
      notify('Filtro global atualizado.', { tone: 'success', title: 'Ajustes' });
    },
    onError: (_error, _filtro, context) => {
      if (context?.previous) queryClient.setQueryData(['app-settings'], context.previous);
      notify('Nao foi possivel salvar o filtro global.', { tone: 'error', title: 'Ajustes' });
    },
  });

  const selectedLevel = settingsQuery.data?.log_level ?? 'disabled';
  const filtros = filtersQuery.data?.filtros?.length ? filtersQuery.data.filtros : FALLBACK_FILTERS;
  const selectedFilter = settingsQuery.data?.filtro_global_padrao ?? DEFAULT_FILTER;
  const isBusy = settingsQuery.isLoading || settingsMutation.isPending || filterMutation.isPending;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Ajustes"
      description="Preferencias globais do processamento"
      size="md"
    >
      <div className="grid gap-3">
        {settingsQuery.isError && (
          <p className="rounded-[var(--radius-sm)] border border-error/30 bg-error/10 px-3 py-2 text-sm text-error">
            Nao foi possivel carregar os ajustes.
          </p>
        )}

        <label className="grid gap-1.5">
          <span className="text-xs font-bold uppercase tracking-[0.08em] text-[var(--wb-text-mute)]">
            Filtro global padrao
          </span>
          <select
            value={selectedFilter}
            disabled={isBusy}
            onChange={(event) => filterMutation.mutate(event.target.value)}
            className="h-10 rounded-[var(--radius-sm)] border border-[var(--wb-border)] bg-[var(--wb-bg-card)] px-3 text-sm font-semibold text-[var(--wb-text)] outline-none transition-colors focus:border-[var(--wb-accent)] disabled:cursor-wait disabled:opacity-60"
          >
            {filtros.map((filtro) => (
              <option key={filtro.id} value={filtro.id}>
                {filtro.nome}
              </option>
            ))}
          </select>
        </label>

        <div className="h-px bg-[var(--wb-border)]" />

        <div className="grid gap-2" role="radiogroup" aria-label="Nivel de logs">
          <span className="text-xs font-bold uppercase tracking-[0.08em] text-[var(--wb-text-mute)]">
            Logs
          </span>
          {LOG_OPTIONS.map((option) => {
            const active = selectedLevel === option.value;
            return (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={active}
                disabled={isBusy}
                onClick={() => settingsMutation.mutate(option.value)}
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

        {isBusy && (
          <p className="inline-flex items-center gap-2 text-xs text-[var(--wb-text-mute)]">
            <Loader2 size={14} className="animate-spin" aria-hidden />
            Salvando ajuste...
          </p>
        )}
      </div>
    </Modal>
  );
}
