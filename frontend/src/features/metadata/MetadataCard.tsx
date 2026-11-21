import { Button } from '@/components/ui/button';
import { AcaoDeIa } from '@/components/ui/acao-de-ia';
import { Modal } from '@/components/ui/modal';
import { Icon } from '@/components/ui/icon';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import type { Corte, MetadadoCorte, StatusExportCorte } from '@/types/models';
import { CapasDoModal } from './CapasDoModal';
import { ComoApareceNoYouTube } from './ComoApareceNoYouTube';
import { PromptImportModal } from './PromptImportModal';
import { RodapeDosTextos, TextosDoCorte } from './TextosDoCorte';
import { useMetadataCard } from './useMetadataCard';

export type { PromptModalKind } from './PromptImportModal';

// O corpo de metadados de UM corte (D-729, D-821, D-1167; DIRECAO §7.5): o formulário à
// esquerda, as capas à direita (420 px na tela, 380 px no modal do editor), e o rodapé.
//
// Variantes: `tela` é a página de Metadados (a lista de cortes aprovados é a coluna de contexto
// da casca; aqui entra só o corte aberto, e a tela o recria a cada troca, D-1033); `modal` é o
// mesmo corpo dentro do diálogo do editor, com a descrição e as tags já abertas e o "Fechar".
// O cartão sanfonado, que repetia o corte de cada vez na página inteira, saiu.

export type VarianteDoCard = 'tela' | 'modal';

export function MetadataCard(props: {
  projetoId: string;
  cut: Corte;
  status?: StatusExportCorte;
  innerRef?: (element: HTMLElement | null) => void;
  onMetaLoaded?: (corteId: string, meta: MetadadoCorte) => void;
  variant?: VarianteDoCard;
  /** O nome do canal ativo, para o "Como aparece no YouTube". */
  canal?: string;
  onRequestClose?: () => void;
}) {
  const { projetoId, cut, innerRef, onRequestClose, canal, variant = 'tela' } = props;
  const modal = variant === 'modal';
  // O hook guarda no `modal` o que nasce aberto (descrição e tags); a tela os nasce fechados.
  const card = useMetadataCard({ ...props, variant: modal ? 'modal' : 'card' });
  const { generated, metaQuery, meta, thumbnailUrl, capaAmpliada, setCapaAmpliada } = card;

  return (
    <article
      ref={innerRef}
      tabIndex={-1}
      onPaste={card.handlePasteImage}
      aria-label={`Metadados do corte ${cut.numero}`}
      className="flex min-w-0 flex-col gap-4 outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-foco"
    >
      {metaQuery.isLoading && <Carregando />}

      {!metaQuery.isLoading && !generated && <SemMetadados card={card} />}

      {generated && card.desfazerIa && <AvisoDoDesfazer card={card} />}

      {generated && (
        <section className={cn('grid gap-6', modal ? 'lg:grid-cols-[minmax(0,1fr)_380px]' : 'xl:grid-cols-[minmax(0,1fr)_420px]')}>
          <div className="flex min-w-0 flex-col gap-4">
            <TextosDoCorte card={card} cut={cut} />
            {!modal && (
              <ComoApareceNoYouTube capaUrl={thumbnailUrl} titulo={card.title} canal={canal} />
            )}
          </div>
          <CapasDoModal card={card} cut={cut} projetoId={projetoId} />
          <RodapeDosTextos card={card} aoFechar={modal ? onRequestClose : undefined} />
        </section>
      )}

      {/* D-556: conferir a moldura de perto exige ver a capa grande. `contain` e não `cover`:
          aqui o assunto é justamente a borda, e recortá-la para preencher a caixa esconderia
          o que se veio olhar. */}
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
            className="max-h-[72vh] w-full rounded-capa object-contain"
          />
        ) : null}
      </Modal>

      <PromptImportModal
        corteId={cut.id}
        kind={card.manualKind}
        onClose={() => card.setManualKind(null)}
        onImported={() => {
          card.setManualKind(null);
          card.invalidate();
        }}
      />
    </article>
  );
}

function Carregando() {
  return (
    <div role="status" aria-label="Carregando os metadados do corte" className="grid min-h-[180px] gap-3">
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-24 w-full" />
    </div>
  );
}

/** Corte sem título gerado: a geração é o único passo, com a IA ou à mão. */
function SemMetadados({ card }: { card: ReturnType<typeof useMetadataCard> }) {
  return (
    <section className="grid min-h-[190px] place-items-center rounded-bloco border border-dashed border-fio-2 bg-vidro p-5">
      <div className="grid w-[min(520px,100%)] gap-3 text-center">
        <h3 className="text-titulo text-fg">Metadados ainda nao gerados</h3>
        <p className="text-corpo text-fg-2">Comece pela geracao automatica ou abra o fluxo manual com IA.</p>
        <div className="flex flex-wrap items-center justify-center gap-2">
          <AcaoDeIa
            rotulo="Gerar metadados"
            tamanho="md"
            destaque
            emVoo={card.metadadosEmVoo}
            onGerar={(provider) => card.generateMetadataClaude.mutate(provider)}
            aparencia="sala-escura"
          />
          <Button type="button" variant="secundario" onClick={() => card.setManualKind('metadata')}>
            <Icon name="wand-sparkles" />
            Manual
          </Button>
        </div>
      </div>
    </section>
  );
}

/** A IA reescreveu tudo: desfazer ou manter (D-746). */
function AvisoDoDesfazer({ card }: { card: ReturnType<typeof useMetadataCard> }) {
  return (
    <div role="status" className="flex flex-wrap items-center gap-2 rounded-bloco border border-fio bg-vidro px-3 py-2 text-pequeno text-fg-2">
      <span className="flex-1">A IA reescreveu título, texto da capa, descrição e tags.</span>
      <Button
        type="button"
        variant="secundario"
        size="pq"
        onClick={() => {
          card.desfazerGeracao();
          card.dispensarDesfazer();
        }}
      >
        Desfazer
      </Button>
      <Button type="button" variant="fantasma" size="pq" onClick={card.dispensarDesfazer}>
        Manter
      </Button>
    </div>
  );
}
