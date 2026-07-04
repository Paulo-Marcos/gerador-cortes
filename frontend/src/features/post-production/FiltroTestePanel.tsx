import { useEffect, useMemo, useState } from 'react';
import { Download, Film, Loader2, RefreshCw, SlidersHorizontal } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Tooltip } from '@/components/ui/tooltip';
import { useToast } from '@/components/ui/toaster';
import { api, versaoVideoUrl } from '@/lib/api';
import { cn } from '@/lib/utils';
import type { AppSettings, FiltroExport } from '@/types/models';

// ─────────────────────────────────────────────────────────────
// FiltroTestePanel — aba "Filtros" da Pós-Produção.
//
// I-023: a aba é SÓ para testes. O filtro usado no render final vem
// SEMPRE do Filtro Global Padrão (Ajustes → AppSettings.filtro_global_padrao),
// não daqui. Por isso este painel não tem mais:
//   - card "Padrão do projeto"        (não existe mais filtro por projeto)
//   - botão "Salvar como padrão"      (o padrão se altera só em Ajustes)
//   - badge "padrão" na lista         (idem)
//   - prop `filtroPadraoInicial`      (a seleção inicial vem do global)
//
// Mutations preservadas: previewSelecionado, previewTodos.
// ─────────────────────────────────────────────────────────────

const FALLBACK_FILTERS: FiltroExport[] = [
  {
    id: 'cinematic_iii',
    nome: 'Cinematico III',
    descricao: 'Referencia (curves+vinheta)',
    tem_filtro_visual: true,
  },
  {
    id: 'bypass_dourado_aberto',
    nome: 'Bypass Cinematico Dourado',
    descricao: 'Padrao leve',
    tem_filtro_visual: true,
  },
];

const DEFAULT_FILTER = 'bypass_dourado_aberto';

interface Props {
  corteId: string;
  projetoId: string;
  brutoPronto: boolean;
}

export function FiltroTestePanel({ corteId, projetoId, brutoPronto }: Props) {
  const queryClient = useQueryClient();
  const { notify } = useToast();
  const [previewSeconds, setPreviewSeconds] = useState(15);
  const [selectedFilter, setSelectedFilter] = useState<string | null>(null);

  const filtrosQuery = useQuery({
    queryKey: ['export-filtros'],
    queryFn: () => api.listarFiltros(),
  });
  const versionsQuery = useQuery({
    queryKey: ['export-versoes', corteId],
    queryFn: () => api.listarVersoes(corteId),
    enabled: brutoPronto && Boolean(corteId),
    refetchInterval: 6_000,
  });
  // I-023: usado apenas como sugestão inicial de seleção na aba (UX), NÃO como
  // input do render. O render final lê o global direto do backend em runtime.
  const { data: appSettings } = useQuery<AppSettings>({
    queryKey: ['app-settings'],
    queryFn: () => api.obterSettings(),
    staleTime: 30_000,
  });

  const filtros = filtrosQuery.data?.filtros?.length ? filtrosQuery.data.filtros : FALLBACK_FILTERS;
  const versoes = useMemo(() => versionsQuery.data?.versoes ?? [], [versionsQuery.data]);
  const globalPadraoId = appSettings?.filtro_global_padrao ?? DEFAULT_FILTER;

  useEffect(() => {
    if (selectedFilter !== null) return;
    const inicial = filtros.some((f) => f.id === globalPadraoId) ? globalPadraoId : DEFAULT_FILTER;
    setSelectedFilter(inicial);
  }, [selectedFilter, filtros, globalPadraoId]);

  useEffect(() => {
    if (selectedFilter && !filtros.some((f) => f.id === selectedFilter)) {
      setSelectedFilter(DEFAULT_FILTER);
    }
  }, [filtros, selectedFilter]);

  const filtroSelecionado = selectedFilter ?? globalPadraoId;

  const invalidateVersoes = () => {
    void queryClient.invalidateQueries({ queryKey: ['export-versoes', corteId] });
  };

  const previewSelecionado = useMutation({
    mutationFn: () => api.processarMultiversion(corteId, true, previewSeconds, [filtroSelecionado]),
    onSuccess: () => {
      notify(`Preview "${filtroSelecionado}" (${previewSeconds}s) enfileirada.`, {
        tone: 'success',
      });
      window.setTimeout(invalidateVersoes, 8_000);
    },
    onError: (error) =>
      notify(error instanceof Error ? error.message : 'Erro ao gerar preview.', { tone: 'error' }),
  });

  const previewTodos = useMutation({
    mutationFn: () => api.processarMultiversion(corteId, true, previewSeconds, null),
    onSuccess: () => {
      notify(`Previews de todos os filtros (${previewSeconds}s) enfileiradas.`, {
        tone: 'success',
      });
      window.setTimeout(invalidateVersoes, 8_000);
    },
    onError: (error) =>
      notify(error instanceof Error ? error.message : 'Erro ao gerar previews.', { tone: 'error' }),
  });

  const busy = previewSelecionado.isPending || previewTodos.isPending;

  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden bg-[var(--wb-bg-card)]">
      <header className="border-b border-[var(--wb-border-soft)] bg-[var(--wb-bg)] p-3">
        <div className="mb-2 flex items-center gap-2">
          <SlidersHorizontal size={14} className="text-[var(--wb-text-mute)]" aria-hidden />
          <strong className="font-editorial text-[17px] font-medium text-[var(--wb-ink)]">
            Teste de filtros
          </strong>
        </div>

        <p className="mb-2.5 text-[11px] leading-snug text-[var(--wb-text-mute)]">
          Gera trechos curtos com cada filtro pra você comparar. O render final usa sempre o
          <strong className="font-semibold text-[var(--wb-text)]"> Filtro Global Padrão </strong>
          definido em Ajustes.
        </p>

        <label className="mb-2.5 flex items-center gap-2.5">
          <span className="font-code text-[9.5px] font-bold uppercase tracking-[0.08em] text-[var(--wb-text-dim)]">
            Duração
          </span>
          <input
            type="range"
            min={5}
            max={20}
            step={1}
            value={previewSeconds}
            onChange={(event) => setPreviewSeconds(Number(event.target.value) || 15)}
            disabled={!brutoPronto}
            className="flex-1 accent-[var(--wb-accent)] disabled:opacity-50"
            aria-label="Duração do preview em segundos"
          />
          <span
            className="w-9 text-right font-code text-[12px] font-bold text-[var(--wb-text)]"
            style={{ fontVariantNumeric: 'tabular-nums' }}
          >
            {previewSeconds}s
          </span>
        </label>

        <div className="flex gap-1.5">
          <Tooltip
            label={brutoPronto ? `Gerar preview de ${filtroSelecionado}` : 'Gere o bruto primeiro'}
            side="bottom"
          >
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => previewSelecionado.mutate()}
              disabled={!brutoPronto || busy}
            >
              {previewSelecionado.isPending ? <Loader2 className="animate-spin" /> : <Film />}
              Preview {previewSeconds}s
            </Button>
          </Tooltip>
          <Tooltip label="Gerar previews de TODOS os filtros disponíveis" side="bottom">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => previewTodos.mutate()}
              disabled={!brutoPronto || busy}
            >
              {previewTodos.isPending ? <Loader2 className="animate-spin" /> : <RefreshCw />}
              Todos
            </Button>
          </Tooltip>
        </div>

        {!brutoPronto && (
          <p className="mt-2 rounded-[var(--radius-xs)] border border-[var(--wb-warn)]/40 bg-[var(--wb-warn-soft)] px-2 py-1.5 text-[11px] text-[var(--wb-warn)]">
            Gere o recorte bruto primeiro pra testar filtros.
          </p>
        )}
      </header>

      <div className="min-h-0 flex-1 overflow-auto p-3">
        <div className="mb-2 flex items-center gap-2">
          <span className="font-code text-[9.5px] font-bold uppercase tracking-[0.08em] text-[var(--wb-text-dim)]">
            Filtros disponíveis
          </span>
          <span className="font-code text-[10px] text-[var(--wb-text-mute)]">{filtros.length}</span>
        </div>

        <div className="flex flex-col gap-1.5">
          {filtros.map((filtro) => {
            const versaoExistente = versoes.find((v) => v.filtro === filtro.id);
            const ativo = filtroSelecionado === filtro.id;
            return (
              <FiltroItem
                key={filtro.id}
                filtro={filtro}
                ativo={ativo}
                versao={versaoExistente}
                onSelect={() => setSelectedFilter(filtro.id)}
                downloadUrl={
                  versaoExistente
                    ? versaoVideoUrl(projetoId, corteId, filtro.id, versaoExistente.e_preview)
                    : null
                }
              />
            );
          })}
        </div>

        {versionsQuery.isFetching && (
          <div className="mt-3 flex items-center justify-center gap-2 text-[11px] text-[var(--wb-text-dim)]">
            <Loader2 size={12} className="animate-spin" />
            Atualizando previews...
          </div>
        )}
      </div>
    </section>
  );
}

function FiltroItem({
  filtro,
  ativo,
  versao,
  onSelect,
  downloadUrl,
}: {
  filtro: FiltroExport;
  ativo: boolean;
  versao?: { filtro: string; e_preview: boolean; tamanho_mb?: number };
  onSelect: () => void;
  downloadUrl: string | null;
}) {
  const filterStyle =
    filtro.id === 'noir_bypass'
      ? 'saturate(0.5)'
      : filtro.id === 'veludo' || filtro.id.includes('veludo')
        ? 'hue-rotate(-12deg)'
        : 'none';

  return (
    <div
      role="button"
      tabIndex={0}
      aria-pressed={ativo}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect();
        }
      }}
      className={cn(
        'flex w-full cursor-pointer items-center gap-2.5 rounded-[var(--radius-sm)] border p-2.5 transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--wb-focus)]',
        ativo
          ? 'border-[var(--wb-accent)] bg-[var(--wb-accent-soft)]'
          : 'border-[var(--wb-border)] bg-[var(--wb-bg-card)] hover:border-[var(--wb-text-dim)]',
      )}
    >
      <div
        className="h-9 w-16 flex-shrink-0 rounded-[4px] bg-gradient-to-br from-[oklch(0.45_0.05_60)] via-[oklch(0.35_0.04_60)] to-[oklch(0.25_0.03_60)]"
        style={{ filter: filterStyle }}
        aria-hidden
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span
            className={cn(
              'truncate text-[12px] font-bold',
              ativo ? 'text-[var(--wb-accent)]' : 'text-[var(--wb-text)]',
            )}
          >
            {filtro.nome}
          </span>
          {versao && (
            <span
              className={cn(
                'rounded-[3px] px-1.5 py-px font-code text-[9px] font-bold uppercase',
                versao.e_preview
                  ? 'bg-[var(--wb-warn-soft)] text-[var(--wb-warn)]'
                  : 'bg-[var(--wb-ok-soft)] text-[var(--wb-ok)]',
              )}
            >
              {versao.e_preview ? 'preview' : 'completo'}
            </span>
          )}
        </div>
        {filtro.descricao && (
          <span className="block truncate text-[10.5px] text-[var(--wb-text-mute)]">
            {filtro.descricao}
          </span>
        )}
      </div>
      {downloadUrl && (
        <Tooltip label="Abrir preview" side="left">
          <a
            href={downloadUrl}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="inline-flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-[var(--radius-xs)] border border-[var(--wb-border)] bg-[var(--wb-bg-card)] text-[var(--wb-text-mute)] transition-colors hover:text-[var(--wb-text)]"
          >
            <Download size={12} aria-hidden />
          </a>
        </Tooltip>
      )}
    </div>
  );
}
