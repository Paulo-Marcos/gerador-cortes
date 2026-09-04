import { useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ImagePlus, Loader2, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { resolveThumbUrl } from '@/lib/api';
import { shortsApi } from '@/features/shorts/shortsApi';

// D-521: a capa VERTICAL, ao lado da thumbnail do YouTube.
//
// As duas ficam no mesmo card de propósito. São imagens diferentes para
// trabalhos diferentes — 16:9 é o cartaz que disputa o clique numa lista; 9:16 é
// a vitrine do perfil do TikTok, onde nove capas são vistas juntas — e é
// justamente por serem parecidas no nome que precisam estar lado a lado: separá-
// las de tela esconderia do operador que existem duas, e a errada acabaria
// subindo.
//
// A miniatura é 9:16 mesmo sendo pequena. Um preview 16:9 aqui repetiria em
// miniatura o erro que esta frente inteira corrige.

interface Props {
  projetoId: string;
  corteId: string;
  /** `thumbnail_tiktok_path` do metadado, relativo ao projeto. */
  capaPath?: string;
  /** As 2-3 palavras que a skill escreveu, quando já houve uma geração. */
  etiqueta?: string;
  /** Recarrega o metadado depois de gerar ou subir. */
  onAtualizou: () => void;
}

export function CapaTikTokSlot({ projetoId, corteId, capaPath, etiqueta, onAtualizou }: Props) {
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [erro, setErro] = useState('');
  const capaUrl = resolveThumbUrl(projetoId, capaPath);

  const aoTerminar = () => {
    setErro('');
    onAtualizou();
    void queryClient.invalidateQueries({ queryKey: ['export-status'] });
  };

  const gerar = useMutation({
    mutationFn: () => shortsApi.gerarCapaTiktok(corteId),
    onSuccess: aoTerminar,
    onError: (e: Error) => setErro(e.message),
  });

  const subir = useMutation({
    mutationFn: (arquivo: File) => shortsApi.subirCapaTiktok(corteId, arquivo),
    onSuccess: aoTerminar,
    onError: (e: Error) => setErro(e.message),
  });

  const ocupado = gerar.isPending || subir.isPending;

  return (
    <section className="grid gap-2 rounded-[10px] border border-[var(--wb-border-soft)] bg-[var(--wb-bg-inset)] p-2.5">
      <header className="flex items-baseline justify-between gap-2">
        <h4 className="text-[12px] font-bold text-[var(--wb-text)]">Capa do TikTok</h4>
        <span className="font-code text-[10px] text-[var(--wb-text-dim)]">9:16</span>
      </header>

      <div className="flex items-start gap-2.5">
        <div className="aspect-[9/16] w-[76px] shrink-0 overflow-hidden rounded-[8px] border border-[var(--wb-border)] bg-[var(--wb-bg-panel)]">
          {capaUrl ? (
            <img src={capaUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="grid h-full place-items-center px-1 text-center text-[10px] leading-tight text-[var(--wb-text-dim)]">
              sem capa
            </div>
          )}
        </div>

        <div className="grid min-w-0 flex-1 content-start gap-1.5">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={ocupado}
            onClick={() => gerar.mutate()}
            title="Monta a capa com um frame do vídeo e a etiqueta escrita pela IA."
          >
            {gerar.isPending ? <Loader2 className="animate-spin" /> : <Sparkles />}
            {capaPath ? 'Refazer' : 'Gerar capa'}
          </Button>

          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={ocupado}
            onClick={() => inputRef.current?.click()}
            title="Usar uma imagem 1080x1920 feita por fora."
          >
            {subir.isPending ? <Loader2 className="animate-spin" /> : <ImagePlus />}
            Subir 9:16
          </Button>
          {/* Input próprio, disparado por clique, e não um `<label>` embrulhando
              o botão: o card em volta captura Ctrl+V para a thumbnail do
              YouTube, e um segundo alvo de arquivo no fluxo de foco disputaria
              o mesmo evento. */}
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(event) => {
              const arquivo = event.target.files?.[0];
              if (arquivo) subir.mutate(arquivo);
              event.currentTarget.value = '';
            }}
          />

          {etiqueta && (
            <p className="truncate font-code text-[10px] uppercase text-[var(--wb-text-mute)]">
              {etiqueta}
            </p>
          )}
        </div>
      </div>

      {erro && <p className="text-[11px] leading-snug text-[var(--wb-warn-ink)]">{erro}</p>}
    </section>
  );
}
