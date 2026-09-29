import { Clipboard, Folder, Frame, Loader2, Palette, RefreshCw, Sparkles, Trash2, UploadCloud } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AcaoDeIa } from '@/components/ui/acao-de-ia';
import { IconButton } from '@/components/ui/icon-button';
import { ThumbnailHintsEditor } from '@/components/ThumbnailHintsEditor';
import { GerarNoChatGPT } from '@/features/capa-chatgpt/GerarNoChatGPT';
import { cortesApi } from '@/features/editor/api/cortes';
import { cn } from '@/lib/utils';
import type { Corte } from '@/types/models';
import { MODAL_ASIDE_BUTTON, ModalActionButton, ModalActionRow } from './modalPecas';
import { ThumbnailAvaliacaoPanel } from './ThumbnailAvaliacaoPanel';
import type { EstadoDoCard } from './useMetadataCard';

// A aba da capa do YouTube no modal (D-821): tudo o que opera ESTA capa, ao
// lado dela, na ordem do trabalho — a prévia, 1. o prompt, 2. a imagem, e as
// ferramentas da capa que já existe.
//
// Antes, os botões desta capa ficavam embaixo do bloco inteiro do TikTok, e o
// prompt dela ficava na outra coluna, junto do título: quem procurava "gerar a
// capa do YouTube" achava a do TikTok (foi como a D-804 esqueceu o botão aqui).

export function CapaYoutubeDoModal({ card, cut }: { card: EstadoDoCard; cut: Corte }) {
  const { meta, promptReady, thumbnailUrl } = card;

  return (
    <div className="grid gap-3">
      {/* D-556: clicar na capa AMPLIA — o endereço continua no ícone de pasta. */}
      <button
        type="button"
        title={thumbnailUrl ? 'Ampliar a capa' : 'Sem thumbnail'}
        disabled={!thumbnailUrl}
        onClick={() => card.setCapaAmpliada(true)}
        className="aspect-video overflow-hidden rounded-[10px] border border-[var(--wb-border)] bg-[var(--wb-bg-panel)]"
      >
        {thumbnailUrl ? (
          <img src={thumbnailUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="grid h-full place-items-center text-sm text-[var(--wb-text-dim)]">
            Sem thumbnail
          </div>
        )}
      </button>

      <Passo titulo="1 · Prompt">
        <ModalActionRow>
          <AcaoDeIa
            rotulo={promptReady ? 'Regerar prompt da capa' : 'Gerar prompt da capa'}
            destaque
            emVoo={card.promptCapaEmVoo}
            onGerar={(provider) => card.generatePromptThumbnailClaude.mutate(provider)}
            className="h-8"
          />
          <ModalActionButton icon={Palette} onClick={() => card.setManualKind('thumbnail-agent-livre')}>
            Manual
          </ModalActionButton>
        </ModalActionRow>
        {/* F-058: influência manual do editor no prompt desta capa. */}
        <ThumbnailHintsEditor
          corteId={cut.id}
          initialValue={cut.hints_thumbnail}
          salvar={(hints) => cortesApi.atualizarCorte(cut.id, { hints_thumbnail: hints })}
        />
      </Passo>

      <Passo titulo="2 · Imagem">
        <GerarNoChatGPT
          prompt={meta?.prompt_thumbnail}
          proporcao="16:9"
          entregar={card.uploadThumbnail.mutateAsync}
        />
        <div className="grid grid-cols-2 gap-2">
          <Button
            type="button"
            variant="outline"
            className={MODAL_ASIDE_BUTTON}
            onClick={() => card.generateThumbnail.mutate()}
            disabled={!promptReady || card.generateThumbnail.isPending}
            title="Gera pela API do Gemini"
          >
            {card.generateThumbnail.isPending || card.conferindoCapa ? (
              <Loader2 className="animate-spin" />
            ) : (
              <Sparkles />
            )}
            {card.conferindoCapa ? 'Gerando…' : 'Gerar no Gemini'}
          </Button>
          <TrocarThumbnail onArquivo={(file) => card.uploadThumbnail.mutate(file)} />
        </div>
        {/* D-413: copiar continua à vista — é o caminho de quem usa outro gerador. */}
        <div className="flex items-center justify-center gap-1.5 font-code text-[11px] uppercase tracking-[0.08em] text-[var(--wb-text-dim)]">
          <span>ou cole com Ctrl+V ·</span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-[11px]"
            onClick={() => void card.copy(meta?.prompt_thumbnail ?? '', 'Prompt da capa copiado.')}
            disabled={!promptReady}
            title={promptReady ? 'Copiar o prompt para outro gerador' : 'Gere o prompt da capa primeiro'}
          >
            <Clipboard />
            Copiar prompt
          </Button>
        </div>
        {!promptReady && (
          <p className="-mt-1 text-[11px] leading-snug text-[var(--wb-warn-ink)]">
            Gere o prompt da capa primeiro — sem ele não há o que gerar.
          </p>
        )}
      </Passo>

      {thumbnailUrl && <FerramentasDaCapa card={card} />}
      {/* D-066: avaliação do par prompt+imagem (histórico de qualidade). */}
      {promptReady && <ThumbnailAvaliacaoPanel corteId={cut.id} />}
    </div>
  );
}

function Passo({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="grid gap-2 border-t border-[var(--wb-border-soft)] pt-2.5">
      <h4 className="font-code text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--wb-text-dim)]">
        {titulo}
      </h4>
      {children}
    </section>
  );
}

function TrocarThumbnail({ onArquivo }: { onArquivo: (arquivo: File) => void }) {
  return (
    <label
      className={cn(
        MODAL_ASIDE_BUTTON,
        'inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-[9px] border border-[var(--wb-border)] bg-[var(--wb-bg-panel)] font-bold text-[var(--wb-text)] hover:border-[var(--wb-text-dim)] hover:bg-[var(--wb-bg-card-elev)]',
      )}
    >
      <UploadCloud size={13} aria-hidden />
      Trocar
      <input
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) onArquivo(file);
          event.currentTarget.value = '';
        }}
      />
    </label>
  );
}

// As ações sobre a capa que já existe. D-555: moram aqui, e não no ⋯ do header,
// porque o header é do card e o modal não o renderiza.
function FerramentasDaCapa({ card }: { card: EstadoDoCard }) {
  return (
    <div className="flex items-center justify-center gap-1.5 border-t border-[var(--wb-border-soft)] pt-2.5">
      <IconButton
        size="sm"
        variant="inset"
        aria-label="Copiar pasta da thumbnail"
        title="Copiar pasta da thumbnail"
        onClick={() => void card.copy(card.meta?.thumbnail_path ?? '', 'Endereco copiado.')}
      >
        <Folder />
      </IconButton>
      <IconButton
        size="sm"
        variant="inset"
        aria-label="Comprimir thumbnail"
        title="Comprimir thumbnail"
        onClick={() => card.compressThumbnail.mutate()}
        disabled={card.compressThumbnail.isPending}
      >
        {card.compressThumbnail.isPending ? <Loader2 className="animate-spin" /> : <RefreshCw />}
      </IconButton>
      <IconButton
        size="sm"
        variant="inset"
        aria-label="Aplicar moldura"
        title="Aplicar a moldura do canal nesta capa"
        onClick={() => card.applyFrame.mutate()}
        disabled={card.applyFrame.isPending}
      >
        {card.applyFrame.isPending ? <Loader2 className="animate-spin" /> : <Frame />}
      </IconButton>
      <IconButton
        size="sm"
        variant="inset"
        aria-label="Remover thumbnail"
        title="Remover thumbnail (apaga o arquivo)"
        onClick={card.confirmRemoveThumbnail}
        disabled={card.removeThumbnail.isPending}
        className="text-[var(--wb-err)] hover:bg-[var(--wb-err-soft)] hover:text-[var(--wb-err)]"
      >
        {card.removeThumbnail.isPending ? <Loader2 className="animate-spin" /> : <Trash2 />}
      </IconButton>
    </div>
  );
}
