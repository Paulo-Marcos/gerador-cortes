import { useRef } from 'react';
import { Button } from '@/components/ui/button';
import { AcaoDeIa } from '@/components/ui/acao-de-ia';
import { Icon } from '@/components/ui/icon';
import { IconButton } from '@/components/ui/icon-button';
import { ThumbnailHintsEditor } from '@/components/ThumbnailHintsEditor';
import { AvisoDeClaridade } from '@/features/capa-chatgpt/AvisoDeClaridade';
import { GerarNoChatGPT } from '@/features/capa-chatgpt/GerarNoChatGPT';
import { cortesApi } from '@/features/editor/api/cortes';
import type { Corte } from '@/types/models';
import { MODAL_ASIDE_BUTTON, ModalActionButton, ModalActionRow } from './modalPecas';
import { ThumbnailAvaliacaoPanel } from './ThumbnailAvaliacaoPanel';
import type { EstadoDoCard } from './useMetadataCard';
import { ICONE_DO_CONCEITO } from '@/upgrade/Icon';

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
        className="aspect-video overflow-hidden rounded-capa border border-fio-2 bg-vidro-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foco disabled:cursor-default"
      >
        {thumbnailUrl ? (
          <img src={thumbnailUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="grid h-full place-items-center text-corpo text-fg-3">
            Sem thumbnail
          </div>
        )}
      </button>
      {/* D-909: capa abaixo da meta de claridade do canal ganha um aviso discreto. */}
      <AvisoDeClaridade corteId={cut.id} capaUrl={thumbnailUrl ?? undefined} />

      <Passo titulo="1 · Prompt">
        <ModalActionRow>
          <AcaoDeIa
            rotulo={promptReady ? 'Regerar prompt da capa' : 'Gerar prompt da capa'}
            emVoo={card.promptCapaEmVoo}
            onGerar={(provider) => card.generatePromptThumbnailClaude.mutate(provider)}
            aparencia="sala-escura"
          />
          <ModalActionButton icon="palette" onClick={() => card.setManualKind('thumbnail-agent-livre')}>
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
          destino="youtube"
          alvoId={cut.id}
          aoConcluir={card.capaChegou}
        />
        <div className="grid grid-cols-2 gap-2">
          <Button
            type="button"
            variant="secundario"
            className={MODAL_ASIDE_BUTTON}
            onClick={() => card.generateThumbnail.mutate()}
            disabled={!promptReady}
            carregando={card.generateThumbnail.isPending || card.conferindoCapa}
            title="Gera pela API do Gemini"
          >
            <Icon name={ICONE_DO_CONCEITO.iaGera} />
            {card.conferindoCapa ? 'Gerando…' : 'Gerar no Gemini'}
          </Button>
          <TrocarThumbnail onArquivo={(file) => card.uploadThumbnail.mutate(file)} />
        </div>
        {/* D-413: copiar continua à vista — é o caminho de quem usa outro gerador. */}
        <div className="flex items-center justify-center gap-1.5 text-pequeno text-fg-3">
          <span>ou cole com Ctrl+V ·</span>
          <Button
            type="button"
            variant="fantasma"
            size="pq"
            onClick={() => void card.copy(meta?.prompt_thumbnail ?? '', 'Prompt da capa copiado.')}
            disabled={!promptReady}
            title={promptReady ? 'Copiar o prompt para outro gerador' : 'Gere o prompt da capa primeiro'}
          >
            <Icon name="clipboard" />
            Copiar prompt
          </Button>
        </div>
        {!promptReady && (
          <p className="-mt-1 text-pequeno text-aviso">
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
    <section className="grid gap-2 border-t border-fio pt-3">
      <h4 className="text-pequeno text-fg-2">{titulo}</h4>
      {children}
    </section>
  );
}

function TrocarThumbnail({ onArquivo }: { onArquivo: (arquivo: File) => void }) {
  const entrada = useRef<HTMLInputElement>(null);
  return (
    <>
      <Button type="button" variant="secundario" className={MODAL_ASIDE_BUTTON} onClick={() => entrada.current?.click()}>
        <Icon name="upload-cloud" />
        Trocar
      </Button>
      <input name="file"
        ref={entrada}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) onArquivo(file);
          event.currentTarget.value = '';
        }}
      />
    </>
  );
}

// As ações sobre a capa que já existe. D-555: moram aqui, e não no ⋯ do header,
// porque o header é do card e o modal não o renderiza.
function FerramentasDaCapa({ card }: { card: EstadoDoCard }) {
  return (
    <div className="flex items-center justify-center gap-1.5 border-t border-fio pt-3">
      <IconButton
        size="pq"
        variant="vidro"
        aria-label="Copiar pasta da thumbnail"
        title="Copiar pasta da thumbnail"
        onClick={() => void card.copy(card.meta?.thumbnail_path ?? '', 'Endereco copiado.')}
      >
        <Icon name="folder" size={16} />
      </IconButton>
      <IconButton
        size="pq"
        variant="vidro"
        aria-label="Comprimir thumbnail"
        title="Comprimir thumbnail"
        onClick={() => card.compressThumbnail.mutate()}
        disabled={card.compressThumbnail.isPending}
      >
        {card.compressThumbnail.isPending ? <Icon name="loader-2" size={16} className="animate-spin" /> : <Icon name="refresh-cw" size={16} />}
      </IconButton>
      <IconButton
        size="pq"
        variant="vidro"
        aria-label="Aplicar moldura"
        title="Aplicar a moldura do canal nesta capa"
        onClick={() => card.applyFrame.mutate()}
        disabled={card.applyFrame.isPending}
      >
        {card.applyFrame.isPending ? <Icon name="loader-2" size={16} className="animate-spin" /> : <Icon name="frame" size={16} />}
      </IconButton>
      <IconButton
        size="pq"
        aria-label="Remover thumbnail"
        title="Remover thumbnail (apaga o arquivo)"
        onClick={card.confirmRemoveThumbnail}
        disabled={card.removeThumbnail.isPending}
        variant="destrutivo"
      >
        {card.removeThumbnail.isPending ? <Icon name="loader-2" size={16} className="animate-spin" /> : <Icon name="trash-2" size={16} />}
      </IconButton>
    </div>
  );
}
