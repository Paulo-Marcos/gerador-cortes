import { useId } from 'react';
import { AcaoDeIa } from '@/components/ui/acao-de-ia';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Input } from '@/components/ui/input';
import { Selo } from '@/components/ui/selo';
import { Textarea } from '@/components/ui/textarea';
import type { Corte } from '@/types/models';
import { ModalActionButton, ModalChip, ModalFieldLabel, SugestoesRecolhidas } from './modalPecas';
import { resumoDosTextos, separarTags } from './resumoDosTextos';
import { sanitizeDescription, type EstadoDoCard } from './useMetadataCard';

// O formulário do corte (D-821, D-1167, DIRECAO §7.5): "Título do YouTube" (campo de 40 px, o
// contador e o "gerar de novo" na linha do rótulo), "Texto da capa" (com a ajuda) e o bloco
// recolhível com a Descrição, os capítulos e as tags, que diz "preenchida" ou "falta" mesmo
// fechado. Tudo salva ao sair do campo; só vai ao servidor o que mudou (D-746).
//
// O "gerar de novo" reescreve título, texto da capa, descrição e tags (D-821), por isso mora
// na linha do título, onde o operador o procura, e não embaixo de um campo só.

const LIMITE_DO_TITULO = 100;
const LIMITE_DO_TEXTO_DA_CAPA = 28;

type Props = { card: EstadoDoCard; cut: Corte };

export function TextosDoCorte({ card, cut }: Props) {
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <CampoDoTitulo card={card} cut={cut} />
      <CampoDoTextoDaCapa card={card} cut={cut} />
      <BlocoDeDescricao card={card} />
    </div>
  );
}

function CampoDoTitulo({ card, cut }: Props) {
  const id = useId();
  const { title, save, rotuloIa, metadadosEmVoo } = card;
  const escolher = (sugestao: string) => {
    const proximo = card.withReadingTitlePrefix(sugestao);
    card.setTitle(proximo);
    save({ titulo_youtube: proximo });
  };
  return (
    <div>
      <ModalFieldLabel
        htmlFor={id}
        label="Título do YouTube"
        counter={`${title.length}/${LIMITE_DO_TITULO}`}
        over={title.length > LIMITE_DO_TITULO}
        acao={
          <>
            <AcaoDeIa
              rotulo={rotuloIa}
              emVoo={metadadosEmVoo}
              onGerar={(provider) => card.generateMetadataClaude.mutate(provider)}
              aparencia="sala-escura"
            />
            <ModalActionButton icon="wand-sparkles" onClick={() => card.setManualKind('metadata')}>
              Manual
            </ModalActionButton>
          </>
        }
      />
      <Input name="titulo_youtube"
        id={id}
        aparencia="sala"
        value={title}
        aria-invalid={title.length > LIMITE_DO_TITULO || undefined}
        onChange={(event) => card.setTitle(event.target.value)}
        onBlur={() => save({ titulo_youtube: title })}
        className="text-linha"
      />
      <SugestoesRecolhidas
        quantidade={card.titleSuggestions.length}
        aberto={card.showTitleSuggestions}
        onAlternar={() => card.setShowTitleSuggestions((atual) => !atual)}
      >
        {card.titleSuggestions.map((sugestao) => (
          <ModalChip key={`${cut.id}-title-${sugestao}`} active={sugestao === title} onClick={() => escolher(sugestao)}>
            {sugestao}
          </ModalChip>
        ))}
      </SugestoesRecolhidas>
    </div>
  );
}

function CampoDoTextoDaCapa({ card, cut }: Props) {
  const id = useId();
  const idAjuda = useId();
  const { coverText, save } = card;
  const escolher = (sugestao: string) => {
    const proximo = card.withCoverEmojis(sugestao);
    card.setCoverText(proximo);
    save({ texto_capa: proximo });
  };
  return (
    <div>
      <ModalFieldLabel
        htmlFor={id}
        label="Texto da capa"
        counter={`${coverText.length}/${LIMITE_DO_TEXTO_DA_CAPA}`}
        over={coverText.length > LIMITE_DO_TEXTO_DA_CAPA}
      />
      <Textarea name="texto_capa"
        id={id}
        rows={2}
        value={coverText}
        placeholder="Ex: JUSTICA EM SI"
        aria-describedby={idAjuda}
        aria-invalid={coverText.length > LIMITE_DO_TEXTO_DA_CAPA || undefined}
        onChange={(event) => card.setCoverText(event.target.value)}
        onBlur={() => save({ texto_capa: coverText })}
        // Texto de capa é uma linha: o Enter salva (sai do campo) em vez de quebrar a linha.
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            event.currentTarget.blur();
          }
        }}
        className="min-h-[64px] text-linha"
      />
      <p id={idAjuda} className="mt-1.5 text-pequeno text-fg-3">
        Curto e forte: é o que a capa do YouTube desenha e a etiqueta da capa do TikTok repete.
      </p>
      <SugestoesRecolhidas
        quantidade={card.thumbSuggestions.length}
        aberto={card.showThumbSuggestions}
        onAlternar={() => card.setShowThumbSuggestions((atual) => !atual)}
      >
        {card.thumbSuggestions.map((sugestao) => (
          <ModalChip key={`${cut.id}-thumb-${sugestao}`} active={sugestao === coverText} onClick={() => escolher(sugestao)}>
            {sugestao}
          </ModalChip>
        ))}
      </SugestoesRecolhidas>
    </div>
  );
}

function BlocoDeDescricao({ card }: { card: EstadoDoCard }) {
  const idDescricao = useId();
  const idTags = useId();
  const { description, tagsText, save } = card;
  const partes = resumoDosTextos(description, tagsText);
  const aberto = card.showDescription;
  return (
    <section aria-label="Descrição, capítulos e tags" className="rounded-bloco border border-fio bg-vidro">
      <button
        type="button"
        aria-expanded={aberto}
        data-sala=""
        onClick={() => card.setShowDescription((atual) => !atual)}
        className="flex w-full flex-wrap items-center gap-2 rounded-bloco px-3 py-2.5 text-left focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-foco"
      >
        <Icon name="chevron-down" className={aberto ? 'rotate-180' : ''} />
        <span className="text-linha text-fg">Descrição, capítulos e tags</span>
        <span className="ml-auto flex flex-wrap items-center gap-1.5">
          {partes.map((parte) => (
            <Selo key={parte.chave} tom={parte.preenchida ? 'ok' : 'convite'}>
              {`${parte.rotulo} ${parte.preenchida ? 'preenchida' : 'falta'}`}
            </Selo>
          ))}
        </span>
      </button>
      {aberto && (
        <div className="grid gap-3 border-t border-fio p-3">
          <div>
            <ModalFieldLabel htmlFor={idDescricao} label="Descrição (os capítulos são as linhas com tempo)" />
            <Textarea name="descricao_youtube"
              id={idDescricao}
              rows={10}
              value={description}
              onChange={(event) => card.setDescription(event.target.value)}
              onBlur={() => save({ descricao_youtube: sanitizeDescription(description) })}
              className="min-h-[240px] text-fg-2"
            />
          </div>
          <div>
            <ModalFieldLabel htmlFor={idTags} label="Tags (SEO oculto, separadas por vírgula)" />
            <Textarea name="tags_youtube"
              id={idTags}
              rows={3}
              value={tagsText}
              onChange={(event) => card.setTagsText(event.target.value)}
              onBlur={() => save({ tags_youtube: separarTags(tagsText) })}
              className="min-h-[76px] font-mono text-pequeno text-fg-2"
            />
          </div>
        </div>
      )}
    </section>
  );
}

/** O rodapé do corpo: quando salvou e o "Salvar" — o salvar é ao sair do campo, o botão é a garantia. */
export function RodapeDosTextos({
  card,
  aoFechar,
}: {
  card: EstadoDoCard;
  /** Só o modal fecha; na tela não há o que fechar. */
  aoFechar?: () => void;
}) {
  const { title, coverText, description, tagsText, lastSavedAt, saveMutation } = card;
  return (
    <footer className="flex flex-wrap items-center gap-2 border-t border-fio pt-3 lg:col-span-2">
      <span className="num text-fg-3">
        {lastSavedAt ? `salvo há ${minutosDesde(lastSavedAt)}` : 'alterações salvam ao sair do campo'}
      </span>
      <span className="flex-1" />
      {aoFechar && (
        <Button type="button" variant="fantasma" onClick={aoFechar}>
          Fechar
        </Button>
      )}
      <Button
        type="button"
        variant="secundario"
        carregando={saveMutation.isPending}
        onClick={() =>
          card.save({
            titulo_youtube: title,
            texto_capa: coverText,
            descricao_youtube: sanitizeDescription(description),
            tags_youtube: separarTags(tagsText),
          })
        }
      >
        Salvar metadados
      </Button>
    </footer>
  );
}

function minutosDesde(de: Date) {
  const minutos = Math.max(0, Math.round((Date.now() - de.getTime()) / 60000));
  return minutos < 1 ? 'instantes' : `${minutos} min`;
}
