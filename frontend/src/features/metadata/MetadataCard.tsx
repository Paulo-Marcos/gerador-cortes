import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  BookOpen,
  Check,
  ChevronDown,
  Clipboard,
  FileText,
  Folder,
  Hash,
  Image,
  Loader2,
  Palette,
  RefreshCw,
  Sparkles,
  Tag,
  Trash2,
  UploadCloud,
  Wand2,
  Youtube,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ClaudeAiButton } from '@/components/ui/claude-button';
import { Modal } from '@/components/ui/modal';
import { ThumbnailPlaceholder } from '@/components/ui/thumbnail-placeholder';
import { useToast } from '@/components/ui/toaster';
import { api, resolveThumbUrl } from '@/lib/api';
import { applyCoverEmojis, applyReadingTitlePrefix } from '@/lib/readingMetadata';
import { cn } from '@/lib/utils';
import { PromptManualPanel } from '@/components/PromptManualPanel';
import { ThumbnailHintsEditor } from '@/components/ThumbnailHintsEditor';
import { ThumbnailAvaliacaoPanel } from './ThumbnailAvaliacaoPanel';
import type { Corte, MetadadoCorte, MetadadoPatch, StatusExportCorte } from '@/types/models';

export const metadataKey = (corteId: string) => ['metadado', corteId] as const;

type PromptModalKind = 'metadata' | 'thumbnail' | 'thumbnail-agent' | 'thumbnail-agent-livre';

export function sanitizeDescription(text: string) {
  return text ? text.replace(/#{2,}/g, '#') : text;
}

function splitTags(tags: string) {
  return tags
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function hueFromCut(cut: Corte) {
  return (cut.numero * 53 + cut.titulo_proposto.length * 7) % 360;
}

export function MetadataCard({
  projetoId,
  cut,
  status,
  innerRef,
  onMetaLoaded,
}: {
  projetoId: string;
  cut: Corte;
  status?: StatusExportCorte;
  innerRef?: (element: HTMLElement | null) => void;
  onMetaLoaded?: (corteId: string, meta: MetadadoCorte) => void;
}) {
  const { notify } = useToast();
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState(cut.numero <= 2);
  const [showTitleSuggestions, setShowTitleSuggestions] = useState(false);
  const [showThumbSuggestions, setShowThumbSuggestions] = useState(false);
  const [showDescription, setShowDescription] = useState(false);
  const [showTags, setShowTags] = useState(false);
  const [manualKind, setManualKind] = useState<PromptModalKind | null>(null);
  const [title, setTitle] = useState('');
  const [coverText, setCoverText] = useState('');
  const [description, setDescription] = useState('');
  const [tagsText, setTagsText] = useState('');

  const metaQuery = useQuery({
    queryKey: metadataKey(cut.id),
    queryFn: () => api.obterMetadado(cut.id),
  });
  const meta = metaQuery.data;
  const generated = Boolean(meta?.titulo_youtube);
  const promptReady = Boolean(meta?.prompt_thumbnail);
  const thumbnailUrl = resolveThumbUrl(projetoId, meta?.thumbnail_path);
  const thumbnailReady = Boolean(status?.thumbnail_pronta || thumbnailUrl);

  useEffect(() => {
    if (!meta) return;
    onMetaLoaded?.(cut.id, meta);
    setTitle(meta.titulo_youtube);
    setCoverText(meta.texto_capa);
    setDescription(sanitizeDescription(meta.descricao_youtube));
    setTagsText((meta.tags_youtube ?? []).join(', '));
  }, [cut.id, meta, onMetaLoaded]);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: metadataKey(cut.id) });
  };

  const saveMutation = useMutation({
    mutationFn: (patch: MetadadoPatch) => api.atualizarMetadado(cut.id, patch),
    onSuccess: () => {
      invalidate();
      notify('Metadados salvos.', { tone: 'success' });
    },
    onError: (error) =>
      notify(error instanceof Error ? error.message : 'Erro ao salvar metadados.', {
        tone: 'error',
      }),
  });

  const withReadingTitlePrefix = (value: string) =>
    cut.is_leitura
      ? applyReadingTitlePrefix(value, cut.autor_leitura ?? '', cut.parte_leitura)
      : value;

  const withCoverEmojis = (value: string) =>
    applyCoverEmojis(value, Boolean(meta?.is_fire), Boolean(cut.is_leitura));

  // F-038 - geracao automatica por IA: invalida na hora.
  const generateMetadataClaude = useMutation({
    mutationFn: () => api.gerarMetadadosClaude(cut.id),
    onSuccess: () => {
      notify('Metadados gerados por IA.', { tone: 'success' });
      invalidate();
    },
    onError: (error) =>
      notify(error instanceof Error ? error.message : 'Erro ao gerar metadados por IA.', {
        tone: 'error',
      }),
  });

  // F-038 - prompt de thumbnail por IA: invalida na hora.
  const generatePromptThumbnailClaude = useMutation({
    mutationFn: () => api.gerarPromptThumbnailClaude(cut.id),
    onSuccess: () => {
      notify('Prompt de thumbnail gerado por IA.', { tone: 'success' });
      invalidate();
    },
    onError: (error) =>
      notify(error instanceof Error ? error.message : 'Erro ao gerar por IA.', { tone: 'error' }),
  });

  const generateThumbnail = useMutation({
    mutationFn: () => api.gerarThumbnail(cut.id),
    onSuccess: () => {
      notify('Geracao de thumbnail iniciada.', { tone: 'success' });
      window.setTimeout(invalidate, 15_000);
    },
    onError: (error) =>
      notify(error instanceof Error ? error.message : 'Erro ao gerar thumbnail.', {
        tone: 'error',
      }),
  });

  const uploadThumbnail = useMutation({
    mutationFn: (file: File) => api.uploadThumbnail(cut.id, file),
    onSuccess: () => {
      invalidate();
      notify('Thumbnail enviada.', { tone: 'success' });
    },
    onError: (error) =>
      notify(error instanceof Error ? error.message : 'Erro ao enviar thumbnail.', {
        tone: 'error',
      }),
  });

  const compressThumbnail = useMutation({
    mutationFn: () => api.comprimirThumbnail(cut.id),
    onSuccess: (res) => {
      invalidate();
      notify(res.message || 'Thumbnail comprimida.', { tone: 'success' });
    },
    onError: (error) =>
      notify(error instanceof Error ? error.message : 'Erro ao comprimir thumbnail.', {
        tone: 'error',
      }),
  });

  const removeThumbnail = useMutation({
    mutationFn: () => api.removerThumbnail(cut.id),
    onSuccess: (res) => {
      invalidate();
      notify(res.arquivo_removido ? 'Thumbnail removida.' : 'Thumbnail desvinculada.', {
        tone: 'success',
      });
    },
    onError: (error) =>
      notify(error instanceof Error ? error.message : 'Erro ao remover thumbnail.', {
        tone: 'error',
      }),
  });

  const confirmRemoveThumbnail = () => {
    if (removeThumbnail.isPending) return;
    if (
      !window.confirm('Remover a thumbnail atual deste corte? Esta acao apaga o arquivo do disco.')
    )
      return;
    removeThumbnail.mutate();
  };

  const titleSuggestions = meta?.opcoes_titulo?.length
    ? meta.opcoes_titulo
    : [
        title || cut.titulo_proposto,
        'A ideia central que muda a leitura',
        'O argumento que organiza todo o debate',
      ];

  const thumbSuggestions = meta?.opcoes_texto_capa?.length
    ? meta.opcoes_texto_capa
    : [coverText || 'Thumbnail', 'JUSTICA EM SI', 'O MITO', 'VIRTUDE REAL'];

  const copy = async (text: string, message: string) => {
    if (!text) {
      notify('Nada para copiar ainda.', { tone: 'warning' });
      return;
    }
    await navigator.clipboard.writeText(text);
    notify(message, { tone: 'success' });
  };

  const save = (patch: MetadadoPatch) => {
    if (!generated) return;
    saveMutation.mutate(patch);
  };

  // Aceita Ctrl+V de imagem para subir como thumbnail. O paste so dispara
  // se o foco estiver dentro deste card (article com tabIndex permite
  // bubbling do evento via React tree). Cola em input/textarea segue
  // funcionando normalmente para texto.
  const handlePasteImage = (event: React.ClipboardEvent<HTMLElement>) => {
    const target = event.target as HTMLElement | null;
    if (target?.closest?.('input, textarea, [contenteditable=""], [contenteditable="true"]')) {
      return;
    }
    const items = event.clipboardData?.items;
    if (!items) return;
    for (const item of Array.from(items)) {
      if (item.kind === 'file' && item.type.startsWith('image/')) {
        event.preventDefault();
        const file = item.getAsFile();
        if (file) {
          uploadThumbnail.mutate(file);
          notify('Imagem colada. Enviando como thumbnail...', { tone: 'info' });
        }
        return;
      }
    }
  };

  return (
    <article
      ref={innerRef}
      tabIndex={-1}
      onPaste={handlePasteImage}
      className="scroll-mt-[132px] overflow-visible rounded-[12px] border border-[var(--wb-border-soft)] bg-[color-mix(in_oklch,var(--wb-bg-card)_88%,var(--wb-bg-panel))] shadow-[0_1px_2px_rgba(20,15,10,0.05),0_10px_26px_rgba(20,15,10,0.07)] outline-none focus-visible:border-[var(--wb-accent)]"
    >
      <header
        onClick={() => setExpanded((current) => !current)}
        className={cn(
          'grid cursor-pointer grid-cols-[minmax(0,1fr)_auto] items-center gap-3 bg-[color-mix(in_oklch,var(--wb-bg-inset)_52%,var(--wb-bg-card))] px-4 py-3',
          expanded && 'border-b border-[var(--wb-border-soft)]',
        )}
      >
        <div className="flex min-w-0 items-center gap-3">
          <span className="shrink-0 font-code font-bold text-[var(--wb-text-dim)]">
            #{cut.numero}
          </span>
          {generated && (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                void copy(meta?.thumbnail_path ?? '', 'Endereco da thumbnail copiado.');
              }}
              className="aspect-video w-[74px] shrink-0 overflow-hidden rounded-[var(--radius-xs)] border border-[var(--wb-border)] bg-[var(--wb-bg-panel)]"
            >
              {thumbnailUrl ? (
                <img src={thumbnailUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                <ThumbnailPlaceholder hue={hueFromCut(cut)} />
              )}
            </button>
          )}
          <div className="min-w-0">
            <h3 className="truncate font-editorial text-[25px] font-medium leading-[1.05] text-[var(--wb-text)]">
              {generated ? title || cut.titulo_proposto : cut.titulo_proposto}
            </h3>
            {generated && (
              <div className="mt-1 flex items-center gap-2 text-xs text-[var(--wb-text-mute)]">
                <span className="font-code text-[var(--wb-text-dim)]">
                  {coverText || 'Thumbnail'}
                </span>
                {promptReady && <Sparkles size={12} className="text-warning" aria-label="prompt" />}
                {thumbnailReady && (
                  <Check size={12} className="text-success" aria-label="thumbnail" />
                )}
                {Boolean(cut.is_leitura) && (
                  <BookOpen size={12} className="text-info" aria-label="leitura" />
                )}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          {generated && (
            <>
              <IconAction
                title="Descricao"
                active={showDescription}
                tone="oklch(0.55 0.12 245)"
                onClick={(event) => {
                  event.stopPropagation();
                  setExpanded(true);
                  setShowDescription((current) => !current);
                }}
              >
                <FileText />
              </IconAction>
              <IconAction
                title="Tags"
                active={showTags}
                tone="oklch(0.48 0.10 145)"
                onClick={(event) => {
                  event.stopPropagation();
                  setExpanded(true);
                  setShowTags((current) => !current);
                }}
              >
                <Tag />
              </IconAction>
              <IconAction
                title="Copiar prompt thumbnail"
                active={promptReady}
                tone="oklch(0.62 0.18 38)"
                onClick={(event) => {
                  event.stopPropagation();
                  void copy(meta?.prompt_thumbnail ?? '', 'Prompt copiado.');
                }}
              >
                <Clipboard />
              </IconAction>
              <label
                title="Subir thumbnail"
                onClick={(event) => event.stopPropagation()}
                className={cn(
                  'flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-[var(--radius-sm)] border bg-[var(--wb-bg-panel)] text-[var(--wb-text-mute)]',
                  thumbnailReady && 'border-info text-info',
                )}
              >
                <UploadCloud size={14} aria-hidden />
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) uploadThumbnail.mutate(file);
                    event.currentTarget.value = '';
                  }}
                />
              </label>
              <IconAction
                title="Copiar pasta da thumbnail"
                tone="oklch(0.53 0.12 55)"
                onClick={(event) => {
                  event.stopPropagation();
                  void copy(meta?.thumbnail_path ?? '', 'Endereco da thumbnail copiado.');
                }}
              >
                <Folder />
              </IconAction>
            </>
          )}
          <span
            className={cn(
              'inline-flex h-6 items-center gap-1.5 rounded-full border px-2 text-[11px] font-bold',
              generated
                ? 'border-[var(--wb-accent)] bg-[var(--wb-accent-soft)] text-[var(--wb-accent)]'
                : 'border-[var(--wb-border)] bg-[var(--wb-bg-panel)] text-[var(--wb-text-dim)]',
            )}
          >
            <span
              className={cn(
                'h-1.5 w-1.5 rounded-full',
                generated ? 'bg-[var(--wb-accent)]' : 'bg-[var(--wb-text-dim)]',
              )}
            />
            {generated ? 'metadados' : 'pendente'}
          </span>
          <IconAction title={expanded ? 'Recolher' : 'Expandir'} active={expanded}>
            <ChevronDown className={expanded ? 'rotate-180' : ''} />
          </IconAction>
        </div>
      </header>

      {expanded && metaQuery.isLoading && (
        <div className="grid min-h-[180px] place-items-center">
          <Loader2 className="animate-spin text-[var(--wb-text-dim)]" />
        </div>
      )}

      {expanded && !metaQuery.isLoading && !generated && (
        <section className="grid min-h-[190px] place-items-center bg-[color-mix(in_oklch,var(--wb-bg-card)_72%,var(--wb-bg-panel))] p-5">
          <div className="grid w-[min(520px,100%)] gap-3 rounded-[var(--radius)] border border-[var(--wb-border-soft)] bg-[var(--wb-bg-panel)] p-5 text-center">
            <div className="font-editorial text-[30px] font-medium leading-none">
              Metadados ainda nao gerados
            </div>
            <div className="text-sm text-[var(--wb-text-mute)]">
              Comece pela geracao automatica ou abra o fluxo manual com IA.
            </div>
            <div className="flex flex-wrap items-center justify-center gap-2">
              <ClaudeAiButton
                size="md"
                pending={generateMetadataClaude.isPending}
                onClick={() => generateMetadataClaude.mutate()}
                title="Gerar metadados via Claude"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setManualKind('metadata')}
              >
                <Wand2 />
                Manual
              </Button>
            </div>
          </div>
        </section>
      )}

      {expanded && generated && (
        <section className="grid gap-3 bg-[color-mix(in_oklch,var(--wb-bg-card)_72%,var(--wb-bg-panel))] p-3.5 lg:grid-cols-[minmax(0,1fr)_190px]">
          <div className="grid gap-3">
            <FieldHeader
              icon={<Youtube size={13} />}
              label="Titulo YouTube"
              expanded={showTitleSuggestions}
              onToggle={() => setShowTitleSuggestions((current) => !current)}
            />
            {showTitleSuggestions && (
              <div className="flex flex-wrap gap-1.5">
                {titleSuggestions.map((suggestion) => (
                  <SuggestionButton
                    key={`${cut.id}-title-${suggestion}`}
                    active={suggestion === title}
                    onClick={() => {
                      const nextTitle = withReadingTitlePrefix(suggestion);
                      setTitle(nextTitle);
                      save({ titulo_youtube: nextTitle });
                    }}
                  >
                    {suggestion}
                  </SuggestionButton>
                ))}
              </div>
            )}
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              onBlur={() => save({ titulo_youtube: title })}
              className="h-10 rounded-[var(--radius-sm)] border border-[var(--wb-border)] bg-[var(--wb-bg-panel)] px-3 text-sm font-semibold outline-none focus:border-[var(--wb-accent)]"
            />
            <div
              className={cn(
                'text-xs text-[var(--wb-text-dim)]',
                title.length > 100 && 'text-error',
              )}
            >
              {title.length}/100
            </div>

            <FieldHeader
              icon={<Image size={13} />}
              label="Texto thumbnail"
              expanded={showThumbSuggestions}
              onToggle={() => setShowThumbSuggestions((current) => !current)}
            />
            {showThumbSuggestions && (
              <div className="flex flex-wrap gap-1.5">
                {thumbSuggestions.map((suggestion) => (
                  <SuggestionButton
                    key={`${cut.id}-thumb-${suggestion}`}
                    active={suggestion === coverText}
                    onClick={() => {
                      const nextCoverText = withCoverEmojis(suggestion);
                      setCoverText(nextCoverText);
                      save({ texto_capa: nextCoverText });
                    }}
                  >
                    {suggestion}
                  </SuggestionButton>
                ))}
              </div>
            )}
            <input
              value={coverText}
              onChange={(event) => setCoverText(event.target.value)}
              onBlur={() => save({ texto_capa: coverText })}
              placeholder="Ex: JUSTICA EM SI"
              className="h-10 rounded-[var(--radius-sm)] border border-[var(--wb-border)] bg-[var(--wb-bg-panel)] px-3 text-sm font-extrabold outline-none focus:border-[var(--wb-accent)]"
            />

            <div className="grid gap-2 pt-1 md:grid-cols-[minmax(220px,0.8fr)_minmax(260px,1fr)]">
              <ActionGroup title="Regerar metadados" tone="oklch(0.54 0.16 32)">
                <ClaudeAiButton
                  pending={generateMetadataClaude.isPending}
                  onClick={() => generateMetadataClaude.mutate()}
                  title="Regerar metadados via Claude"
                />
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setManualKind('metadata')}
                >
                  <Wand2 />
                  Manual
                </Button>
              </ActionGroup>
              <ActionGroup title="Prompt thumbnail" tone="oklch(0.55 0.14 285)">
                <ClaudeAiButton
                  pending={generatePromptThumbnailClaude.isPending}
                  onClick={() => generatePromptThumbnailClaude.mutate()}
                  title={promptReady ? 'Regerar prompt via Claude' : 'Gerar prompt via Claude'}
                />
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setManualKind('thumbnail-agent-livre')}
                >
                  <Palette />
                  Manual
                </Button>
              </ActionGroup>
            </div>

            {/* F-058: influência manual do editor no prompt da thumbnail. */}
            <ThumbnailHintsEditor corteId={cut.id} initialValue={cut.hints_thumbnail} />

            {showDescription && (
              <textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                onBlur={() => save({ descricao_youtube: sanitizeDescription(description) })}
                rows={5}
                className="rounded-[var(--radius-sm)] border border-[var(--wb-border-soft)] bg-[var(--wb-bg-panel)] p-3 text-sm leading-relaxed text-[var(--wb-text-mute)] outline-none focus:border-[var(--wb-accent)]"
              />
            )}

            {showTags && (
              <label className="grid gap-2">
                <span className="flex items-center gap-1.5 font-code text-[10.5px] font-bold uppercase tracking-[0.1em] text-[var(--wb-text-dim)]">
                  <Hash size={13} aria-hidden />
                  Tags
                </span>
                <textarea
                  value={tagsText}
                  onChange={(event) => setTagsText(event.target.value)}
                  onBlur={() => save({ tags_youtube: splitTags(tagsText) })}
                  rows={3}
                  className="rounded-[var(--radius-sm)] border border-[var(--wb-border-soft)] bg-[var(--wb-bg-panel)] p-3 font-code text-xs text-[var(--wb-text-mute)] outline-none focus:border-[var(--wb-accent)]"
                />
              </label>
            )}
          </div>

          <aside className="grid content-start gap-2.5">
            <button
              type="button"
              onClick={() =>
                void copy(meta?.thumbnail_path ?? '', 'Endereco da thumbnail copiado.')
              }
              className="aspect-video overflow-hidden rounded-[var(--radius)] border border-[var(--wb-border)] bg-[var(--wb-bg-panel)]"
            >
              {thumbnailUrl ? (
                <img src={thumbnailUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                <div className="grid h-full place-items-center text-xs text-[var(--wb-text-dim)]">
                  Sem thumbnail
                </div>
              )}
            </button>
            <Button
              type="button"
              variant="outline"
              onClick={() => generateThumbnail.mutate()}
              disabled={!promptReady || generateThumbnail.isPending}
            >
              {generateThumbnail.isPending ? <Loader2 className="animate-spin" /> : <Image />}
              Gerar thumbnail
            </Button>
            <label className="inline-flex h-9 cursor-pointer items-center justify-center gap-2 rounded-[var(--radius-sm)] border border-[var(--wb-border)] bg-[var(--wb-bg-card)] px-4 text-sm font-semibold text-[var(--wb-text)] hover:border-[var(--wb-text-dim)]">
              <UploadCloud size={16} aria-hidden />
              Trocar thumbnail
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) uploadThumbnail.mutate(file);
                  event.currentTarget.value = '';
                }}
              />
            </label>
            <p className="text-center font-code text-[10px] uppercase tracking-[0.08em] text-[var(--wb-text-dim)]">
              ou cole com Ctrl+V
            </p>
            {thumbnailUrl && (
              <>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void copy(meta?.thumbnail_path ?? '', 'Endereco copiado.')}
                >
                  <Folder />
                  Copiar pasta
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => compressThumbnail.mutate()}
                  disabled={compressThumbnail.isPending}
                >
                  {compressThumbnail.isPending ? (
                    <Loader2 className="animate-spin" />
                  ) : (
                    <RefreshCw />
                  )}
                  Comprimir
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={confirmRemoveThumbnail}
                  disabled={removeThumbnail.isPending}
                  title="Remover thumbnail (apaga o arquivo)"
                  className="text-error hover:border-error"
                >
                  {removeThumbnail.isPending ? <Loader2 className="animate-spin" /> : <Trash2 />}
                  Remover
                </Button>
              </>
            )}
            {/* D-066: avaliação do par prompt+imagem (histórico de qualidade). */}
            {promptReady && <ThumbnailAvaliacaoPanel corteId={cut.id} />}
          </aside>
        </section>
      )}

      <PromptImportModal
        corteId={cut.id}
        kind={manualKind}
        onClose={() => setManualKind(null)}
        onImported={() => {
          setManualKind(null);
          invalidate();
        }}
      />
    </article>
  );
}

function IconAction({
  title,
  active,
  tone,
  onClick,
  children,
}: {
  title: string;
  active?: boolean;
  tone?: string;
  onClick?: React.MouseEventHandler<HTMLButtonElement>;
  children: React.ReactElement;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--radius-sm)] border border-[var(--wb-border)] bg-[var(--wb-bg-panel)] text-[var(--wb-text-mute)] [&_svg]:size-3.5"
      style={
        active
          ? { borderColor: tone ?? 'var(--wb-accent)', color: tone ?? 'var(--wb-accent)' }
          : undefined
      }
    >
      {children}
    </button>
  );
}

function FieldHeader({
  icon,
  label,
  expanded,
  onToggle,
}: {
  icon: React.ReactNode;
  label: string;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="flex items-center gap-1.5 text-[var(--wb-text-dim)]">
      {icon}
      <span className="font-code text-[10.5px] font-bold uppercase tracking-[0.1em]">{label}</span>
      <button
        type="button"
        title="Ver sugestoes"
        onClick={onToggle}
        className={cn(
          'flex h-6 w-6 items-center justify-center rounded-[var(--radius-xs)] border',
          expanded
            ? 'border-[var(--wb-accent)] bg-[var(--wb-accent-soft)] text-[var(--wb-accent)]'
            : 'border-[var(--wb-border)] bg-[var(--wb-bg-panel)] text-[var(--wb-text-mute)]',
        )}
      >
        <ChevronDown size={12} className={expanded ? 'rotate-180' : ''} aria-hidden />
      </button>
    </div>
  );
}

function SuggestionButton({
  active,
  onClick,
  children,
}: {
  active?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'min-h-[31px] rounded-[var(--radius-sm)] border px-2.5 text-left text-xs font-bold',
        active
          ? 'border-[var(--wb-accent)] bg-[var(--wb-accent)] text-white'
          : 'border-[var(--wb-border)] bg-[var(--wb-bg-panel)] text-[var(--wb-text)]',
      )}
    >
      {children}
    </button>
  );
}

function ActionGroup({
  title,
  tone,
  children,
}: {
  title: string;
  tone: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className="grid gap-2 rounded-[var(--radius)] border p-2.5"
      style={{
        borderColor: `color-mix(in oklch, ${tone} 26%, var(--wb-border))`,
        background: `color-mix(in oklch, ${tone} 7%, var(--wb-bg-card))`,
      }}
    >
      <div
        className="font-code text-[10.5px] font-extrabold uppercase tracking-[0.08em]"
        style={{ color: tone }}
      >
        {title}
      </div>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

function PromptImportModal({
  corteId,
  kind,
  onClose,
  onImported,
}: {
  corteId: string;
  kind: PromptModalKind | null;
  onClose: () => void;
  onImported: () => void;
}) {
  const { notify } = useToast();
  const [jsonPorParte, setJsonPorParte] = useState<Record<number, string>>({});
  const [erro, setErro] = useState<string | null>(null);
  const open = kind !== null;
  const isAgentPrompt = kind === 'thumbnail-agent' || kind === 'thumbnail-agent-livre';
  const promptQuery = useQuery({
    queryKey: ['manual-prompt', kind, corteId],
    queryFn: () => {
      if (kind === 'thumbnail-agent') return api.obterPromptThumbnailAgente(corteId);
      if (kind === 'thumbnail-agent-livre') return api.obterPromptThumbnailAgenteLivre(corteId);
      if (kind === 'thumbnail') return api.obterPromptThumbnail(corteId);
      return api.obterPromptMeta(corteId);
    },
    enabled: open,
  });

  useEffect(() => {
    if (open) {
      setJsonPorParte({});
      setErro(null);
    }
  }, [open, kind, corteId]);

  const importMutation = useMutation({
    mutationFn: (body: unknown) =>
      kind === 'thumbnail'
        ? api.importarPromptThumbnail(corteId, body)
        : api.importarMeta(corteId, body),
    onSuccess: () => {
      notify('Resultado importado com sucesso.', { tone: 'success' });
      onImported();
    },
    onError: (error) =>
      notify(error instanceof Error ? error.message : 'Erro ao importar resultado.', {
        tone: 'error',
      }),
  });

  const importPayload = () => {
    if (isAgentPrompt) return;
    const payload = jsonPorParte[0]?.trim() ?? '';
    if (!payload) {
      setErro('Cole o resultado da IA antes de importar.');
      return;
    }
    try {
      const parsed = JSON.parse(payload);
      importMutation.mutate(parsed);
    } catch {
      if (kind === 'thumbnail') {
        importMutation.mutate({ prompt_thumbnail: payload });
        return;
      }
      setErro('Para metadados, cole um JSON valido retornado pela IA.');
    }
  };

  const colado = Boolean(jsonPorParte[0]?.trim());

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={
        kind === 'thumbnail-agent-livre'
          ? 'Prompt para Agente (livre)'
          : isAgentPrompt
            ? 'Prompt para Agente'
            : kind === 'thumbnail'
              ? 'Prompt de Thumbnail'
              : 'Gerar Metadados'
      }
      description={
        kind === 'thumbnail-agent-livre'
          ? 'Versao mais permissiva: o agente tem liberdade de composicao e texto, mas mantem o mesmo Sapo.'
          : isAgentPrompt
            ? 'Copie este bloco e envie ao GPT capista para gerar as imagens diretamente.'
            : 'Copie o prompt, gere fora da aplicacao e cole o JSON de volta aqui.'
      }
      size="lg"
      footer={
        isAgentPrompt ? (
          <Button type="button" variant="outline" onClick={onClose}>
            Fechar
          </Button>
        ) : (
          <>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={importPayload}
              disabled={!colado || importMutation.isPending}
            >
              {importMutation.isPending ? <Loader2 className="animate-spin" /> : <UploadCloud />}
              Importar
            </Button>
          </>
        )
      }
    >
      <PromptManualPanel
        prompt={promptQuery}
        jsonPorParte={jsonPorParte}
        onChangeJsonPorParte={setJsonPorParte}
        jsonErro={erro}
        onErrorChange={setErro}
        hideRetorno={isAgentPrompt}
        jsonPlaceholder={
          kind === 'thumbnail'
            ? 'Cole o prompt_thumbnail ou JSON...'
            : 'Cole o JSON de metadados...'
        }
      />
    </Modal>
  );
}
