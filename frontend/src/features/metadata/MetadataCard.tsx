import { useEffect, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  BookOpen,
  Check,
  ChevronDown,
  FileText,
  Folder,
  Frame,
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
  type LucideIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AcaoDeIa } from '@/components/ui/acao-de-ia';
import { SeloDeProvider } from '@/components/ui/selo-provider';
import { type ProviderIA } from '@/lib/providerIa';
import { Modal } from '@/components/ui/modal';
import { OverflowMenu } from '@/components/ui/overflow-menu';
import { ThumbnailPlaceholder } from '@/components/ui/thumbnail-placeholder';
import { useToast } from '@/components/ui/toaster';
import { cortesApi } from '@/features/editor/api/cortes';
import { metadadosApi } from './api/metadados';
import { CapaTikTokSlot } from './CapaTikTokSlot';
import { cn } from '@/lib/utils';
import { PromptManualPanel } from '@/components/PromptManualPanel';
import { ThumbnailHintsEditor } from '@/components/ThumbnailHintsEditor';
import { ThumbnailAvaliacaoPanel } from './ThumbnailAvaliacaoPanel';
import { AcoesDoPromptDaCapa } from './AcoesDoPromptDaCapa';
import { CapasDoModal } from './CapasDoModal';
import {
  MODAL_ASIDE_BUTTON,
  ModalActionButton,
  ModalChip,
  ModalFieldLabel,
  SemSugestoes,
  SugestoesRecolhidas,
} from './modalPecas';
import type { Corte, MetadadoCorte, StatusExportCorte } from '@/types/models';
import { useMetadataCard, sanitizeDescription } from './useMetadataCard';

export type PromptModalKind = 'metadata' | 'thumbnail' | 'thumbnail-agent' | 'thumbnail-agent-livre';

function splitTags(tags: string) {
  return tags
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function hueFromCut(cut: Corte) {
  return (cut.numero * 53 + cut.titulo_proposto.length * 7) % 360;
}

export function MetadataCard(props: {
  projetoId: string;
  cut: Corte;
  status?: StatusExportCorte;
  /** Corte em foco na lista: só ele nasce expandido (DE-PARA-v3 §5). */
  active?: boolean;
  innerRef?: (element: HTMLElement | null) => void;
  onMetaLoaded?: (corteId: string, meta: MetadadoCorte) => void;
  /** 'modal' = corpo denso do protótipo (AUDITORIA-v3 §6): sem header próprio,
      labels mono com contador à direita, descrição+tags sempre visíveis. */
  variant?: 'card' | 'modal';
  onRequestClose?: () => void;
}) {
  const {
  projetoId,
  cut,
  
  
  innerRef,
  
  
  onRequestClose,
} = props;
  const card = useMetadataCard(props);
  const { applyFrame, capaAmpliada, compressThumbnail, conferindoCapa, confirmRemoveThumbnail, copiarPromptDaCapa, copy, coverText, description, desfazerIa, expanded, generateMetadataClaude, generatePromptThumbnailClaude, generateThumbnail, generated, handlePasteImage, invalidate, lastSavedAt, manualKind, meta, metaGeradaPor, metaQuery, metadadosEmVoo, modal, promptCapaEmVoo, promptCopiado, promptReady, removeThumbnail, save, saveMutation, setCapaAmpliada, setCoverText, setDescription, setDesfazerIa, setExpanded, setManualKind, setShowDescription, setShowTags, setShowThumbSuggestions, setShowTitleSuggestions, setTagsText, setTitle, showDescription, showTags, showThumbSuggestions, showTitleSuggestions, tagsText, thumbSuggestions, thumbnailReady, thumbnailUrl, title, titleSuggestions, ultimaMeta, uploadThumbnail, withCoverEmojis, withReadingTitlePrefix } = card;


  return (
    <article
      ref={innerRef}
      tabIndex={-1}
      onPaste={handlePasteImage}
      className={cn(
        'outline-none',
        !modal &&
          'scroll-mt-[132px] overflow-visible rounded-[12px] border border-[var(--wb-border-soft)] bg-[color-mix(in_oklch,var(--wb-bg-card)_88%,var(--wb-bg-panel))] shadow-[0_1px_2px_rgba(20,15,10,0.05),0_10px_26px_rgba(20,15,10,0.07)] focus-visible:border-[var(--wb-accent)]',
      )}
    >
      {!modal && (
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
              {/* DE-PARA-v2 §6: PROD mostra o título inteiro; truncate (1
                  linha) cortava mesmo sobrando espaço horizontal. 2 linhas
                  antes de reticências. */}
              <h3 className="line-clamp-2 font-editorial text-[25px] font-medium leading-[1.05] text-[var(--wb-text)]">
                {generated ? title || cut.titulo_proposto : cut.titulo_proposto}
              </h3>
              {generated && (
                <div className="mt-1 flex items-center gap-2 text-xs text-[var(--wb-text-mute)]">
                  <span className="font-code text-[var(--wb-text-dim)]">
                    {coverText || 'Thumbnail'}
                  </span>
                  {promptReady && (
                    <Sparkles size={12} className="text-warning" aria-label="prompt" />
                  )}
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
            {/* DE-PARA-v3 §5: os 5 icon-buttons do header (documento, tags,
                clipboard, upload, pasta) viraram um único ⋯ — o header fica
                com título + status + recolher. */}
            {generated && (
              <OverflowMenu
                label="Mais ações do corte"
                items={[
                  {
                    icon: FileText,
                    label: showDescription ? 'Ocultar descrição' : 'Ver descrição',
                    onClick: () => {
                      setExpanded(true);
                      setShowDescription((current) => !current);
                    },
                  },
                  {
                    icon: Tag,
                    label: showTags ? 'Ocultar tags' : 'Ver tags',
                    onClick: () => {
                      setExpanded(true);
                      setShowTags((current) => !current);
                    },
                  },
                  {
                    icon: UploadCloud,
                    label: 'Subir thumbnail',
                    accept: 'image/*',
                    onFile: (file) => uploadThumbnail.mutate(file),
                  },
                  {
                    icon: Folder,
                    label: 'Copiar pasta da thumbnail',
                    onClick: () =>
                      void copy(meta?.thumbnail_path ?? '', 'Endereco da thumbnail copiado.'),
                  },
                ]}
              />
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
      )}

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
              <AcaoDeIa
                rotulo="Gerar metadados"
                tamanho="md"
                destaque
                emVoo={metadadosEmVoo}
                onGerar={(provider) => generateMetadataClaude.mutate(provider)}
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

      {expanded && generated && desfazerIa && (
        <div className="flex flex-wrap items-center gap-2 border-b border-[var(--wb-border-soft)] bg-[var(--wb-bg-inset)] px-4 py-2 text-[12px] text-[var(--wb-text-dim)]">
          <span className="flex-1">
            A IA reescreveu título, texto da capa, descrição e tags.
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              saveMutation.mutate(desfazerIa);
              setDesfazerIa(null);
            }}
          >
            Desfazer
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => setDesfazerIa(null)}>
            Manter
          </Button>
        </div>
      )}

      {expanded && generated && modal && (
        <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
          <div className="flex min-w-0 flex-col gap-4">
            {/* D-821: "Regerar metadados" reescreve título, texto da capa,
                descrição e tags — mora no cabeçalho do bloco, e não embaixo do
                título, onde parecia regerar só o título. */}
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="mr-auto font-code text-[12px] font-bold uppercase tracking-[0.1em] text-[var(--wb-text-dim)]">
                Textos do YouTube
              </h3>
              <AcaoDeIa
                rotulo="Regerar metadados"
                destaque
                emVoo={metadadosEmVoo}
                onGerar={(provider) => generateMetadataClaude.mutate(provider)}
                className="h-8"
              />
              <ModalActionButton icon={Wand2} onClick={() => setManualKind('metadata')}>
                Manual
              </ModalActionButton>
            </div>

            <div>
              <ModalFieldLabel
                label="Título YouTube"
                counter={`${title.length}/100`}
                over={title.length > 100}
              />
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                onBlur={() => save({ titulo_youtube: title })}
                className="h-11 w-full rounded-[8px] border border-[var(--wb-border)] bg-[var(--wb-bg-panel)] px-3 text-[15px] font-semibold outline-none focus:border-[var(--wb-accent)]"
              />
              <SugestoesRecolhidas
                quantidade={titleSuggestions.length}
                aberto={showTitleSuggestions}
                onAlternar={() => setShowTitleSuggestions((atual) => !atual)}
              >
                {titleSuggestions.map((suggestion) => (
                  <ModalChip
                    key={`${cut.id}-title-${suggestion}`}
                    active={suggestion === title}
                    onClick={() => {
                      const nextTitle = withReadingTitlePrefix(suggestion);
                      setTitle(nextTitle);
                      save({ titulo_youtube: nextTitle });
                    }}
                  >
                    {suggestion}
                  </ModalChip>
                ))}
              </SugestoesRecolhidas>
            </div>

            {/* D-821: a descrição é o texto longo — ganha a largura e a altura que
                sobravam; as tags, curtas, ficam embaixo. */}
            <div className="grid gap-3">
              <div>
                <ModalFieldLabel label="Descrição" />
                <textarea
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  onBlur={() => save({ descricao_youtube: sanitizeDescription(description) })}
                  rows={10}
                  className="min-h-[240px] w-full rounded-[8px] border border-[var(--wb-border)] bg-[var(--wb-bg-panel)] px-3 py-2.5 text-[13px] leading-[1.6] text-[var(--wb-text-mute)] outline-none focus:border-[var(--wb-accent)]"
                />
              </div>
              <div>
                <ModalFieldLabel label="Tags" />
                <textarea
                  value={tagsText}
                  onChange={(event) => setTagsText(event.target.value)}
                  onBlur={() => save({ tags_youtube: splitTags(tagsText) })}
                  rows={3}
                  className="min-h-[76px] w-full rounded-[8px] border border-[var(--wb-border)] bg-[var(--wb-bg-panel)] px-3 py-2.5 font-code text-[13px] leading-[1.6] text-[var(--wb-text-mute)] outline-none focus:border-[var(--wb-accent)]"
                />
              </div>
            </div>
          </div>

          <CapasDoModal card={card} cut={cut} projetoId={projetoId} />

          <footer className="-mx-4 -mb-3.5 mt-0.5 flex items-center gap-2 border-t border-[var(--wb-border-soft)] bg-[var(--wb-bg-inset)] px-4 py-2.5 lg:col-span-2">
            <span className="font-code text-[12px] text-[var(--wb-text-dim)]">
              {lastSavedAt
                ? `salvo há ${relativeMinutes(lastSavedAt)}`
                : 'alterações salvam ao sair do campo'}
            </span>
            <span className="flex-1" />
            <Button
              type="button"
              variant="outline"
              className={MODAL_ASIDE_BUTTON}
              onClick={onRequestClose}
            >
              Fechar
            </Button>
            <Button
              type="button"
              className={MODAL_ASIDE_BUTTON}
              onClick={() =>
                save({
                  titulo_youtube: title,
                  texto_capa: coverText,
                  descricao_youtube: sanitizeDescription(description),
                  tags_youtube: splitTags(tagsText),
                })
              }
              disabled={saveMutation.isPending}
            >
              {saveMutation.isPending && <Loader2 className="animate-spin" />}
              Salvar metadados
            </Button>
          </footer>
        </section>
      )}

      {expanded && generated && !modal && (
        <section className="grid gap-3 bg-[color-mix(in_oklch,var(--wb-bg-card)_72%,var(--wb-bg-panel))] p-3.5 lg:grid-cols-[minmax(0,1fr)_232px]">
          {/* D-746: 232px, como no modal. Em 190px a capa do TikTok não cabia e
              a coluna inteira vazava para fora do card. */}
          <div className="grid gap-3">
            <FieldHeader
              icon={<Youtube size={13} />}
              label="Titulo YouTube"
              expanded={showTitleSuggestions}
              onToggle={() => setShowTitleSuggestions((current) => !current)}
            />
            {showTitleSuggestions && (
              <div className="flex flex-wrap gap-1.5">
                {titleSuggestions.length === 0 && <SemSugestoes />}
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
                {thumbSuggestions.length === 0 && <SemSugestoes />}
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

            {/* DE-PARA-v3 §5: dois segmented compactos no lugar das caixas
                coloridas (que ainda usavam oklch solto, fora dos tokens). O
                lado AI mantém o laranja oficial da Claude — falso positivo
                declarado no hand-off, é cor de marca. */}
            <div className="flex flex-wrap items-end gap-2 pt-1">
              <SegmentedAiManual
                label="Regerar metadados"
                emVoo={metadadosEmVoo}
                aiTitle="Regerar"
                aiDescricao="Regerar metadados"
                onAi={(provider) => generateMetadataClaude.mutate(provider)}
                manualIcon={Wand2}
                onManual={() => setManualKind('metadata')}
              />
              <SegmentedAiManual
                label="Prompt thumbnail"
                emVoo={promptCapaEmVoo}
                aiTitle={promptReady ? 'Regerar' : 'Gerar'}
                aiDescricao={promptReady ? 'Regerar o prompt da capa' : 'Gerar o prompt da capa'}
                onAi={(provider) => generatePromptThumbnailClaude.mutate(provider)}
                manualIcon={Palette}
                onManual={() => setManualKind('thumbnail-agent-livre')}
              />
              {!metadadosEmVoo && generated && (
                <SeloDeProvider
                  provider={metaGeradaPor}
                  modelo={ultimaMeta.data?.model}
                  className="mb-1"
                />
              )}
            </div>

            {/* F-058: influência manual do editor no prompt da thumbnail. */}
            <ThumbnailHintsEditor
              corteId={cut.id}
              initialValue={cut.hints_thumbnail}
              salvar={(hints) => cortesApi.atualizarCorte(cut.id, { hints_thumbnail: hints })}
            />

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
                  <Tag size={13} aria-hidden />
                  Tags (SEO oculto)
                </span>
                <span className="text-[11px] leading-snug text-[var(--wb-text-dim)]">
                  Nomes citados/soletraveis + marca. Nao sao as hashtags — essas ja vao na
                  descricao.
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

          <aside className="grid min-w-0 content-start gap-2.5">
            <button
              type="button"
              title={thumbnailUrl ? 'Ampliar a capa' : 'Sem thumbnail'}
              disabled={!thumbnailUrl}
              onClick={() => setCapaAmpliada(true)}
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
            {/* D-521: a capa vertical do TikTok, irmã da thumbnail acima. */}
            <CapaTikTokSlot
              projetoId={projetoId}
              corteId={cut.id}
              capaPath={meta?.thumbnail_tiktok_path}
              promptArte={meta?.prompt_capa_tiktok}
              etiqueta={meta?.etiqueta_tiktok}
              textoCapa={coverText}
              onAtualizou={invalidate}
            />
            <AcoesDoPromptDaCapa
              corteId={cut.id}
              prompt={meta?.prompt_thumbnail}
              promptReady={promptReady}
              promptCopiado={promptCopiado}
              onCopiar={() => void copiarPromptDaCapa()}
              entregar={uploadThumbnail.mutateAsync}
            />
            {/* DE-PARA-v3 §5: "Trocar thumbnail" é o primário (sólido em
                acento); "Gerar" fica em outline; e as ações raras (copiar
                pasta, comprimir, remover) saem da pilha de botões para um ⋯. */}
            <label className="inline-flex h-9 cursor-pointer items-center justify-center gap-2 rounded-[var(--radius-sm)] bg-[var(--wb-accent)] px-4 text-sm font-bold text-[var(--wb-accent-fg)] shadow-[shadow:var(--wb-shadow-btn)] hover:bg-[var(--wb-accent-strong)]">
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
            <Button
              type="button"
              variant="outline"
              onClick={() => generateThumbnail.mutate()}
              disabled={!promptReady || generateThumbnail.isPending}
            >
              {generateThumbnail.isPending || conferindoCapa ? <Loader2 className="animate-spin" /> : <Image />}
              {conferindoCapa ? 'Gerando capa…' : 'Gerar thumbnail'}
            </Button>
            <div className="flex items-center gap-2">
              <p className="flex-1 font-code text-[10px] uppercase tracking-[0.08em] text-[var(--wb-text-dim)]">
                ou cole com Ctrl+V
              </p>
              {thumbnailUrl && (
                <OverflowMenu
                  compact
                  label="Mais ações da thumbnail"
                  items={[
                    {
                      icon: Folder,
                      label: 'Copiar pasta',
                      onClick: () => void copy(meta?.thumbnail_path ?? '', 'Endereco copiado.'),
                    },
                    {
                      icon: Frame,
                      label: applyFrame.isPending ? 'Aplicando moldura…' : 'Aplicar moldura',
                      title: 'Aplicar a moldura do canal nesta capa',
                      disabled: applyFrame.isPending,
                      onClick: () => applyFrame.mutate(),
                    },
                    {
                      icon: RefreshCw,
                      label: compressThumbnail.isPending ? 'Comprimindo…' : 'Comprimir',
                      disabled: compressThumbnail.isPending,
                      onClick: () => compressThumbnail.mutate(),
                    },
                    {
                      icon: Trash2,
                      label: 'Remover',
                      danger: true,
                      disabled: removeThumbnail.isPending,
                      onClick: confirmRemoveThumbnail,
                    },
                  ]}
                />
              )}
            </div>
            {/* D-066: avaliação do par prompt+imagem (histórico de qualidade). */}
            {promptReady && <ThumbnailAvaliacaoPanel corteId={cut.id} />}
          </aside>
        </section>
      )}

      {/* D-556: conferir a moldura de perto exige ver a capa grande. `contain`
          e não `cover`: aqui o assunto é justamente a borda, e recortá-la para
          preencher a caixa esconderia o que se veio olhar. */}
      <Modal
        open={capaAmpliada && Boolean(thumbnailUrl)}
        onClose={() => setCapaAmpliada(false)}
        title="Capa"
        description={meta?.titulo_youtube || undefined}
        size="2xl"
      >
        {thumbnailUrl ? (
          <img
            src={thumbnailUrl}
            alt={meta?.titulo_youtube ?? 'Capa do corte'}
            className="max-h-[72vh] w-full rounded-[var(--radius-sm)] object-contain"
          />
        ) : null}
      </Modal>

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

function relativeMinutes(from: Date) {
  const min = Math.max(0, Math.round((Date.now() - from.getTime()) / 60000));
  if (min < 1) return 'instantes';
  return `${min} min`;
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
          ? 'border-[var(--wb-accent)] bg-[var(--wb-accent)] text-[var(--wb-accent-fg)]'
          : 'border-[var(--wb-border)] bg-[var(--wb-bg-panel)] text-[var(--wb-text)]',
      )}
    >
      {children}
    </button>
  );
}

/**
 * Par AI | Manual em segmented compacto (DE-PARA-v3 §5). Substitui as
 * caixas `ActionGroup` coloridas: mesma função, um terço do peso visual.
 */
function SegmentedAiManual({
  label,
  emVoo,
  aiTitle,
  aiDescricao,
  onAi,
  manualIcon: ManualIcon,
  onManual,
}: {
  label: string;
  /** Qual provider está gerando agora: só ele gira, o outro fica desabilitado. */
  emVoo: ProviderIA | null;
  aiTitle: string;
  /** A ação completa, para leitor de tela e tooltip. */
  aiDescricao: string;
  onAi: (provider: ProviderIA) => void;
  manualIcon: LucideIcon;
  onManual: () => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="font-code text-[9px] font-bold uppercase tracking-[0.08em] text-[var(--wb-text-dim)]">
        {label}
      </span>
      <div className="inline-flex gap-0.5 rounded-[8px] border border-[var(--wb-border)] bg-[var(--wb-bg-inset)] p-[3px]">
        <AcaoDeIa
          rotulo={aiTitle}
          descricao={aiDescricao}
          emVoo={emVoo}
          onGerar={onAi}
          className="h-[26px] border-0 bg-transparent"
        />
        <button
          type="button"
          onClick={onManual}
          className="inline-flex h-[26px] items-center gap-1.5 rounded-[6px] px-3 text-[10px] font-semibold text-[var(--wb-text-mute)] transition-colors hover:bg-[var(--wb-bg-panel)] hover:text-[var(--wb-text)]"
        >
          <ManualIcon size={12} aria-hidden />
          Manual
        </button>
      </div>
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
      if (kind === 'thumbnail-agent') return metadadosApi.obterPromptThumbnailAgente(corteId);
      if (kind === 'thumbnail-agent-livre') return metadadosApi.obterPromptThumbnailAgenteLivre(corteId);
      if (kind === 'thumbnail') return metadadosApi.obterPromptThumbnail(corteId);
      return metadadosApi.obterPromptMeta(corteId);
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
        ? metadadosApi.importarPromptThumbnail(corteId, body)
        : metadadosApi.importarMeta(corteId, body),
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
