import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { providerEmVoo } from '@/lib/providerIa';
import { geracaoIaApi, useUltimaGeracao } from '@/features/ia';
import { copyTextToClipboard } from '@/lib/clipboard';
import { useToast } from '@/components/ui/toaster';
import { resolveThumbUrl } from '@/lib/api';
import { metadadosApi, type MetadadoPatch } from './api/metadados';
import { applyCoverEmojis, applyReadingTitlePrefix } from '@/lib/readingMetadata';
import type { Corte, MetadadoCorte, StatusExportCorte } from '@/types/models';
import type { PromptModalKind } from './MetadataCard';


export const metadataKey = (corteId: string) => ['metadado', corteId] as const;

export function sanitizeDescription(text: string) {
  return text ? text.replace(/#{2,}/g, '#') : text;
}

// D-729: o container de MetadataCard — estado, efeitos e ações. A view, em
// MetadataCard.tsx, só desenha o que este hook devolve.
export function useMetadataCard({
  projetoId,
  cut,
  status,
  active = false,
  
  onMetaLoaded,
  variant = 'card',
  
}: {
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
  const modal = variant === 'modal';
  const { notify } = useToast();
  const queryClient = useQueryClient();
  // DE-PARA-v3 §5: "cards não-focados ficam recolhidos (só header)" — o card
  // em foco na lista é o expandido; trocar o foco recolhe o anterior. O clique
  // no header continua alternando manualmente.
  const [expanded, setExpanded] = useState(modal || active);
  const [showTitleSuggestions, setShowTitleSuggestions] = useState(false);
  const [showThumbSuggestions, setShowThumbSuggestions] = useState(false);
  const [showDescription, setShowDescription] = useState(modal);
  const [showTags, setShowTags] = useState(modal);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [manualKind, setManualKind] = useState<PromptModalKind | null>(null);
  const [title, setTitle] = useState('');
  const [coverText, setCoverText] = useState('');
  const [description, setDescription] = useState('');
  const [tagsText, setTagsText] = useState('');

  const metaQuery = useQuery({
    queryKey: metadataKey(cut.id),
    queryFn: () => metadadosApi.obterMetadado(cut.id),
  });
  const meta = metaQuery.data;
  const generated = Boolean(meta?.titulo_youtube);
  const promptReady = Boolean(meta?.prompt_thumbnail);
  // Emoldurar, comprimir e trocar gravam por cima do MESMO nome de arquivo.
  // Sem trocar a URL, o navegador serve a imagem antiga do cache e a tela passa
  // a mentir sobre o que existe em disco — foi o que aconteceu ao aplicar a
  // moldura e nada parecer mudar (D-556).
  const [versaoDaCapa, setVersaoDaCapa] = useState(0);
  // D-746: a capa era relida UMA vez, 15 s depois — se demorasse mais, o
  // operador via a antiga e achava que não tinha gerado. Agora confere a cada
  // 5 s por até 90 s, com o aviso "gerando capa…" enquanto isso.
  const [conferindoCapa, setConferindoCapa] = useState(false);
  useEffect(() => {
    if (!conferindoCapa) return;
    const tique = window.setInterval(() => {
      void queryClient.invalidateQueries({ queryKey: metadataKey(cut.id) });
      setVersaoDaCapa((atual) => atual + 1);
    }, 5_000);
    const fim = window.setTimeout(() => setConferindoCapa(false), 90_000);
    return () => {
      window.clearInterval(tique);
      window.clearTimeout(fim);
    };
  }, [conferindoCapa, cut.id, queryClient]);
  const thumbnailUrl = useMemo(() => {
    const arquivo = resolveThumbUrl(projetoId, meta?.thumbnail_path);
    if (!arquivo || versaoDaCapa === 0) return arquivo;
    return `${arquivo}${arquivo.includes('?') ? '&' : '?'}v=${versaoDaCapa}`;
  }, [projetoId, meta?.thumbnail_path, versaoDaCapa]);
  const [capaAmpliada, setCapaAmpliada] = useState(false);
  const thumbnailReady = Boolean(status?.thumbnail_pronta || thumbnailUrl);

  // Foco da lista manda no expandido: seleciona outro corte → este recolhe.
  useEffect(() => {
    if (modal) return;
    setExpanded(active);
  }, [active, modal]);

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
    mutationFn: (patch: MetadadoPatch) => metadadosApi.atualizarMetadado(cut.id, patch),
    onSuccess: () => {
      invalidate();
      setLastSavedAt(new Date());
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

  // D-746: regerar reescrevia título, capa, descrição e tags sem volta — um
  // título ajustado à mão se perdia. A versão anterior fica guardada até o
  // operador desfazer ou dispensar.
  const versaoAntesDaIa = useRef<MetadadoPatch | null>(null);
  const [desfazerIa, setDesfazerIa] = useState<MetadadoPatch | null>(null);

  // F-038 - geracao automatica por IA: invalida na hora.
  const generateMetadataClaude = useMutation({
    mutationFn: (provider: 'claude' | 'gemini' = 'claude') => geracaoIaApi.gerarMetadadosClaude(cut.id, provider),
    onMutate: () => {
      versaoAntesDaIa.current =
        meta && (meta.titulo_youtube || meta.descricao_youtube)
          ? {
              titulo_youtube: meta.titulo_youtube,
              texto_capa: meta.texto_capa,
              descricao_youtube: meta.descricao_youtube,
              tags_youtube: meta.tags_youtube,
            }
          : null;
    },
    onSuccess: () => {
      notify('Metadados gerados por IA.', { tone: 'success' });
      setDesfazerIa(versaoAntesDaIa.current);
      invalidate();
    },
    onError: (error) =>
      notify(error instanceof Error ? error.message : 'Erro ao gerar metadados por IA.', {
        tone: 'error',
      }),
  });

  // F-038 - prompt de thumbnail por IA: invalida na hora.
  const generatePromptThumbnailClaude = useMutation({
    mutationFn: (provider: 'claude' | 'gemini' = 'claude') => geracaoIaApi.gerarPromptThumbnailClaude(cut.id, provider),
    onSuccess: () => {
      notify('Prompt de thumbnail gerado por IA.', { tone: 'success' });
      invalidate();
    },
    onError: (error) =>
      notify(error instanceof Error ? error.message : 'Erro ao gerar por IA.', { tone: 'error' }),
  });

  // Uma mutation serve aos dois providers: o `variables` diz quem disparou,
  // para só o botão dele girar e o outro não abrir uma segunda geração.
  const metadadosEmVoo = providerEmVoo(generateMetadataClaude);
  const promptCapaEmVoo = providerEmVoo(generatePromptThumbnailClaude);
  const ultimaMeta = useUltimaGeracao('metadados-expert', { corteId: cut.id });
  const metaGeradaPor =
    generateMetadataClaude.variables ?? ultimaMeta.data?.provider ?? null;

  const generateThumbnail = useMutation({
    mutationFn: () => metadadosApi.gerarThumbnail(cut.id),
    onSuccess: () => {
      notify('Geracao de thumbnail iniciada.', { tone: 'success' });
      setConferindoCapa(true);
    },
    onError: (error) =>
      notify(error instanceof Error ? error.message : 'Erro ao gerar thumbnail.', {
        tone: 'error',
      }),
  });

  const uploadThumbnail = useMutation({
    mutationFn: (file: File) => metadadosApi.uploadThumbnail(cut.id, file),
    onSuccess: () => {
      invalidate();
      setVersaoDaCapa((atual) => atual + 1);
      notify('Thumbnail enviada.', { tone: 'success' });
    },
    onError: (error) =>
      notify(error instanceof Error ? error.message : 'Erro ao enviar thumbnail.', {
        tone: 'error',
      }),
  });

  // Capa nova já sai emoldurada. Este botão é para as do acervo, para as que
  // entraram antes da moldura existir, e para reaplicar depois de trocar o PNG
  // da moldura do canal. Clicar duas vezes não empilha moldura.
  const applyFrame = useMutation({
    mutationFn: () => metadadosApi.aplicarMolduraThumbnail(cut.id),
    onSuccess: (res) => {
      invalidate();
      setVersaoDaCapa((atual) => atual + 1);
      notify(res.message || 'Moldura aplicada.', { tone: 'success' });
    },
    onError: (error) =>
      notify(error instanceof Error ? error.message : 'Erro ao aplicar a moldura.', {
        tone: 'error',
      }),
  });

  const compressThumbnail = useMutation({
    mutationFn: () => metadadosApi.comprimirThumbnail(cut.id),
    onSuccess: (res) => {
      invalidate();
      setVersaoDaCapa((atual) => atual + 1);
      notify(res.message || 'Thumbnail comprimida.', { tone: 'success' });
    },
    onError: (error) =>
      notify(error instanceof Error ? error.message : 'Erro ao comprimir thumbnail.', {
        tone: 'error',
      }),
  });

  const removeThumbnail = useMutation({
    mutationFn: () => metadadosApi.removerThumbnail(cut.id),
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

  // D-746: sem sugestão da IA, nenhuma sugestão. As de antes eram frases
  // fixas no código ("O MITO", "VIRTUDE REAL") que pareciam vir da IA.
  const titleSuggestions = meta?.opcoes_titulo ?? [];
  const thumbSuggestions = meta?.opcoes_texto_capa ?? [];

  const copy = async (text: string, message: string) => {
    if (!text) {
      notify('Nada para copiar ainda.', { tone: 'warning' });
      return;
    }
    await navigator.clipboard.writeText(text);
    notify(message, { tone: 'success' });
  };

  // D-746: o clique dá retorno visível — ícone e texto mudam por ~1,4 s.
  const [promptCopiado, setPromptCopiado] = useState(false);
  // `copyTextToClipboard` tem o plano B do textarea: com a janela sem foco
  // o `navigator.clipboard` recusa, e o clique falhava sem dizer nada.
  const copiarPromptDaCapa = async () => {
    const copiou = await copyTextToClipboard(meta?.prompt_thumbnail ?? '');
    if (!copiou) {
      notify('Não consegui copiar o prompt — tente de novo com a janela em foco.', {
        tone: 'warning',
      });
      return;
    }
    setPromptCopiado(true);
    window.setTimeout(() => setPromptCopiado(false), 1400);
  };

  // D-746: sair de um campo sem mexer nele salvava e mostrava "Metadados
  // salvos" do mesmo jeito. Só vai ao servidor o que difere do gravado.
  const save = (patch: MetadadoPatch) => {
    if (!generated) return;
    const gravado = meta as Record<string, unknown> | undefined;
    const mudou = Object.entries(patch).some(
      ([campo, valor]) => JSON.stringify(gravado?.[campo] ?? null) !== JSON.stringify(valor ?? null),
    );
    if (!mudou) return;
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

  return { applyFrame, capaAmpliada, compressThumbnail, conferindoCapa, confirmRemoveThumbnail, copiarPromptDaCapa, copy, coverText, description, desfazerIa, expanded, generateMetadataClaude, generatePromptThumbnailClaude, generateThumbnail, generated, handlePasteImage, invalidate, lastSavedAt, manualKind, meta, metaGeradaPor, metaQuery, metadadosEmVoo, modal, promptCapaEmVoo, promptCopiado, promptReady, removeThumbnail, save, saveMutation, setCapaAmpliada, setCoverText, setDescription, setDesfazerIa, setExpanded, setManualKind, setShowDescription, setShowTags, setShowThumbSuggestions, setShowTitleSuggestions, setTagsText, setTitle, showDescription, showTags, showThumbSuggestions, showTitleSuggestions, tagsText, thumbSuggestions, thumbnailReady, thumbnailUrl, title, titleSuggestions, ultimaMeta, uploadThumbnail, withCoverEmojis, withReadingTitlePrefix };
}
