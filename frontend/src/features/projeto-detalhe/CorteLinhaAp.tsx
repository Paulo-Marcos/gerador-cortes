import { useCallback, useRef, useState, type KeyboardEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAprovar, useAtualizarCorte } from '@/features/editor/useCortes';
import { useRiscarCorte } from '@/features/editor/useRiscarCorte';
import { useToast } from '@/components/ui/toaster';
import { useAbrirPasta } from '@/features/projeto-detalhe/useProjetoDetalhe';
import { ShortsDesteCorte } from '@/features/shorts/ShortsDesteCorte';
import { useCapaDaLinha } from './useCapaDaLinha';
import { useFocoDaLinhaNaUrl } from './useFocoDaLinhaNaUrl';
import { cn, formatarDuracaoHMS } from '@/lib/utils';
import type { Corte, StatusExportCorte } from '@/types/models';
import { Checkbox } from '@/components/ui/checkbox';
import { OverflowMenu } from '@/components/ui/overflow-menu';
import { Icon } from '@/components/ui/icon';
import { LinkDeAcao } from '@/components/ui/link-de-acao';
import { MedidorDeEtapas } from '@/components/ui/medidor-de-etapas';
import { Selo } from '@/components/ui/selo';
import { montarTira, resumoDaLinha } from '@/upgrade/tiraDoCorte';
import { MetadadosDoCorteModal } from '@/features/metadata/MetadadosDoCorteModal';
import { BARRA_EM_COLUNA_MIN_PX, useJanelaMin } from '@/upgrade/medidas';
import { estadoDaLinha, maisDaLinha, ondeJaSubiu, primarioDaLinha, montarProximoDaLinha } from './acoesDaLinha';
import { acaoDaTeclaNaLinha } from './cortesDoWorkspace';
import { idDaLinha, SELO_DO_CORTE } from './leituraDoMapa';
import { CapaDaLinha, NotaDaLinha, OrdemDaLinha } from './PartesDaLinha';
import { SeloDaOrigem } from './SeloDaOrigem';
import { PorQueDoCorteModal } from '@/features/porque-do-corte/PorQueDoCorteModal';

// ─────────────────────────────────────────────────────────────────
// D-599 · A linha do corte no Workspace.
//
// Numa live de 14 cortes a pergunta não é "como é este corte?" e sim "qual deles ainda me
// deve alguma coisa?". Linha deixa comparar de cima a baixo; grade obriga a varrer.
//
// D-1149 (E-069 H-16, DIRECAO §7.2): a linha é a da `Lista` da Sala escura, e as colunas
// são as do cabeçalho: seleção · nº · capa · Corte · Duração · Nota · Etapas · Estado ·
// ação · ⋯. O "o que falta" é o `MedidorDeEtapas` (oito traços e a frase, no lugar da barra
// da D-868 e das siglas de antes). A linha não tem botão: a ação é texto, uma só, e o resto
// vai para o "⋯". O título e a capa abrem o corte no editor. A linha é um `<article>`
// focável que ocupa a grade da `<li>` por `subgrid`: quem a desenha é a tela.
// ─────────────────────────────────────────────────────────────────

// As colunas moram em `colunasDaLista` (a tela as lê sem montar a linha); o nome segue
// exportado daqui, onde o teste da linha (D-868) o busca.
export { colunasDaLinha } from './colunasDaLista';

type CorteLinhaApProps = {
  projetoId: string;
  corte: Corte | undefined;
  status: StatusExportCorte;
  podeSubir: boolean;
  podeDescer: boolean;
  reordenando: boolean;
  onMover: (delta: -1 | 1) => void;
  onEnviarYoutube: () => void;
  onInformarUrl: () => void;
  onLiberarPublicacao: () => void;
  enviando: boolean;
  /** D-746: seleção em lote (Aprovar N / Devolver N na tela da live). */
  selecionado?: boolean;
  onAlternarSelecao?: () => void;
  /** D-1149: a linha recebeu o foco — o mapa acende o corte dela. */
  onAbrir?: () => void;
};


/**
 * D-1149: o item da lista que leva a linha. Na lista da Sala escura cada `<article>` mora
 * sozinho na sua `<li>`, e a vizinha se procura entre as `<li>`; fora de uma lista, o item é
 * o próprio `<article>`.
 */
export function itemDaLinha(artigo: Element): Element {
  return artigo.parentElement?.tagName === 'LI' ? artigo.parentElement : artigo;
}

/** A linha (o `<article>`) de um item vizinho. A `<li>` do cabeçalho não tem linha: nada. */
export function linhaDoItem(item: Element | null): HTMLElement | null {
  if (!item) return null;
  return item.tagName === 'LI' ? item.querySelector<HTMLElement>('article') : (item as HTMLElement);
}

type TriagemPeloTeclado = {
  projetoId: string;
  corte: Corte | undefined;
  /** Modal de metadados ou ⋯ da linha aberto: o teclado é deles. */
  sobreposicaoAberta: boolean;
  aprovar: ReturnType<typeof useAprovar>;
  atualizar: ReturnType<typeof useAtualizarCorte>;
  avisarFalha: (acao: string) => (erro: unknown) => void;
  /** D-886: W abre o porquê da IA. */
  explicar: () => void;
};

/**
 * D-746/D-842: triagem pelo teclado na linha focada (a regra da tecla mora em
 * `acaoDaTeclaNaLinha`). Digitando num campo, nada disso vale.
 * D-1096: R risca direto, como no editor (D-1088): o riscado guarda a proposta e
 * o trabalho e solta a mídia, então não há o que confirmar. O aviso traz o
 * motivo e o Desfazer, e o foco segue para a linha vizinha em vez de cair no
 * nada. Corte no YouTube não se risca: o aviso diz "Já está no YouTube".
 */
function useTriagemPeloTeclado({
  projetoId,
  corte,
  sobreposicaoAberta,
  aprovar,
  atualizar,
  avisarFalha,
  explicar,
}: TriagemPeloTeclado) {
  const vizinhaAoRiscar = useRef<HTMLElement | null>(null);
  const linhaQuePediu = useRef<HTMLElement | null>(null);
  // A lista vazia: a linha não escolhe o próximo pela ordem dos cortes, segue a
  // linha vizinha na tela. O Desfazer devolve o foco à linha que voltou.
  const riscar = useRiscarCorte(
    corte,
    [],
    projetoId,
    () => vizinhaAoRiscar.current?.focus(),
    () => linhaQuePediu.current?.focus(),
  );

  const aoTeclar = (e: KeyboardEvent<HTMLElement>) => {
    const alvo = e.target as HTMLElement;
    // R4: o modal de metadados é filho JSX desta linha — mesmo saindo por
    // portal, o keydown sobe pela árvore do React até aqui. Sem esta guarda,
    // `A` aprovava o corte de trás com o modal aberto. D-868: o mesmo vale
    // para o ⋯ da linha — com ele aberto, A aprovava e K levava o foco embora.
    if (sobreposicaoAberta || alvo.closest('[role="dialog"], [role="menu"]')) return;
    if (e.metaKey || e.ctrlKey || e.altKey || alvo.closest('input, textarea, select')) return;
    const acao = acaoDaTeclaNaLinha(e.key, corte?.status);
    if (!acao) return;
    e.preventDefault();
    const artigo = e.currentTarget;
    const linha = itemDaLinha(artigo);
    if (acao === 'aprovar') aprovar.mutate(undefined, { onError: avisarFalha('aprovar') });
    else if (acao === 'devolver')
      atualizar.mutate({ status: 'proposto' }, { onError: avisarFalha('devolver') });
    else if (acao === 'explicar') explicar();
    else if (acao === 'riscar') {
      linhaQuePediu.current = artigo;
      vizinhaAoRiscar.current = linhaDoItem(linha.nextElementSibling) ?? linhaDoItem(linha.previousElementSibling);
      riscar.riscarCorte();
    } else {
      e.stopPropagation();
      const vizinha = linhaDoItem(acao === 'descer' ? linha.nextElementSibling : linha.previousElementSibling);
      vizinha?.focus();
    }
  };

  return aoTeclar;
}

export function CorteLinhaAp({
  projetoId,
  corte,
  status,
  podeSubir,
  podeDescer,
  reordenando,
  onMover,
  onEnviarYoutube,
  onInformarUrl,
  onLiberarPublicacao,
  enviando,
  selecionado = false,
  onAlternarSelecao,
  onAbrir,
}: CorteLinhaApProps) {
  const navigate = useNavigate();
  const abrirPasta = useAbrirPasta();
  const refDaLinha = useFocoDaLinhaNaUrl(status.corte_id);
  const aprovar = useAprovar(status.corte_id, projetoId);
  const atualizar = useAtualizarCorte(status.corte_id, projetoId);
  const { notify } = useToast();
  // D-746: aprovar/voltar que falhava não dizia nada — o operador achava que
  // tinha dado certo.
  const avisarFalha = (acao: string) => (erro: unknown) =>
    notify(`Não consegui ${acao} o corte #${status.numero}: ${erro instanceof Error ? erro.message : 'erro'}.`, {
      tone: 'error',
    });

  const estado = estadoDaLinha(corte, status);
  const riscado = estado === 'rejeitado';
  const capa = useCapaDaLinha(projetoId, status.thumbnail_path);
  const [metaAberto, setMetaAberto] = useState(false);
  const [porQueAberto, setPorQueAberto] = useState(false);
  const fecharMeta = useCallback(() => setMetaAberto(false), []);
  const tira = montarTira(status, corte?.status);
  const durSeg = corte?.duracao_clip_seg || (corte ? corte.fim_seg - corte.inicio_seg : 0);
  const selo = SELO_DO_CORTE[estado];

  const irEditor = () => navigate(`/projetos/${projetoId}/cortes/${status.corte_id}`);
  // D-1149: o diálogo devolve o foco a quem o abriu, e o item do ⋯ some junto com o menu
  // (o foco caía no <body>). Antes de abrir, a linha toma o foco: é a ela que ele volta.
  const pelaLinha = (abrir: () => void) => () => {
    refDaLinha.current?.focus({ preventScroll: true });
    abrir();
  };

  const primario = primarioDaLinha(estado, {
    editar: irEditor,
    voltar: () => atualizar.mutate({ status: 'proposto' }, { onError: avisarFalha('voltar') }),
    enviarYoutube: onEnviarYoutube,
    proximo: montarProximoDaLinha(tira, projetoId, status.corte_id, navigate, corte),
    abrirNoYoutube: () =>
      window.open(status.youtube_url_publicado ?? '', '_blank', 'noopener,noreferrer'),
  });
  const mais = maisDaLinha({
    ...ondeJaSubiu(status),
    abrindoPasta: abrirPasta.isPending,
    posProducao: () =>
      navigate(`/projetos/${projetoId}/post-production?corte=${status.corte_id}`),
    metadados: () => setMetaAberto(true),
    abrirPasta: () => abrirPasta.mutate(status.corte_id),
    informarUrl: pelaLinha(onInformarUrl),
    liberarPublicacao: pelaLinha(onLiberarPublicacao),
  });

  // D-868: com o ⋯ aberto a linha sobe de camada (o menu é absoluto e a de baixo pintava
  // por cima). Amarrar ao foco falhava: K ou Tab levavam o foco e o menu ficava aberto.
  const [maisAberto, setMaisAberto] = useState(false);
  const barraEmColuna = useJanelaMin(BARRA_EM_COLUNA_MIN_PX);
  const aoTeclar = useTriagemPeloTeclado({
    projetoId,
    corte,
    sobreposicaoAberta: metaAberto || maisAberto || porQueAberto,
    aprovar,
    atualizar,
    avisarFalha,
    explicar: () => setPorQueAberto(true),
  });
  const enviandoEste = enviando && estado === 'pronto';
  // Os traços em cima e a frase embaixo, inteira (a coluna não comporta os dois lado a lado
  // sem roubar o título). O medidor segue com a frase no `aria-label`.
  const medidor = (
    <span className="flex min-w-0 flex-col gap-1.5">
      <MedidorDeEtapas tira={tira} comFrase={false} />
      <span className={cn('text-pequeno', riscado ? 'text-erro' : 'text-fg-3')}>{resumoDaLinha(tira)}</span>
    </span>
  );

  return (
    <article
      ref={refDaLinha}
      id={idDaLinha(status.corte_id)}
      data-sala=""
      tabIndex={0}
      onKeyDown={aoTeclar}
      onFocus={onAbrir}
      aria-label={`Corte #${status.numero} — ${status.titulo}`}
      className={cn(
        'col-span-full grid grid-cols-subgrid items-center rounded-bloco',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-foco',
        maisAberto && 'relative z-[3]',
      )}
    >
      {onAlternarSelecao ? (
        <Checkbox
          checked={selecionado}
          onCheckedChange={onAlternarSelecao}
          aria-label={`Selecionar o corte #${status.numero}`}
        />
      ) : null}
      <OrdemDaLinha
        numero={status.numero}
        podeSubir={podeSubir}
        podeDescer={podeDescer}
        reordenando={reordenando}
        onMover={onMover}
      />
      <CapaDaLinha numero={status.numero} src={capa ?? undefined} riscada={riscado} onAbrir={irEditor} />

      <span className="flex min-w-0 flex-col gap-1">
        <span className="flex min-w-0 items-center gap-2">
          <button
            type="button"
            data-sala=""
            onClick={irEditor}
            title={status.titulo ?? undefined}
            className={cn(
              'min-h-6 min-w-0 truncate rounded-md border-0 bg-transparent p-0 text-left text-linha text-fg hover:text-iris-2',
              'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foco',
              riscado && 'text-fg-3 line-through',
            )}
          >
            {status.titulo || `Corte #${status.numero}`}
          </button>
          <SeloDaOrigem origem={corte?.origem_analise} />
        </span>
        {/* O fire e os shorts dele vão na linha do intervalo: ao lado do título, roubavam o espaço dele. */}
        <span className="flex min-w-0 items-center gap-3">
          {corte ? (
            <span className="num text-micro text-fg-3">
              {corte.inicio_hms} → {corte.fim_hms}
            </span>
          ) : null}
          {corte?.is_fire ? <ShortsDesteCorte corteId={status.corte_id} /> : null}
        </span>
        {barraEmColuna ? null : <span className="mt-1 block max-w-[300px]">{medidor}</span>}
      </span>

      <span className="num text-pequeno text-fg-2">{durSeg > 0 ? formatarDuracaoHMS(durSeg) : '—'}</span>
      <span className="flex justify-center">
        <NotaDaLinha score={corte?.score} onAbrir={() => setPorQueAberto(true)} />
      </span>
      {barraEmColuna ? medidor : null}
      <span>
        <Selo tom={selo.tom}>{selo.texto}</Selo>
      </span>

      <LinkDeAcao onClick={primario.acao} disabled={enviandoEste} aria-busy={enviandoEste || undefined}>
        <Icon name={enviandoEste ? 'loader' : primario.icone} />
        {primario.texto}
      </LinkDeAcao>
      <OverflowMenu
        items={mais}
        label={`Mais ações do corte ${status.numero}`}
        grande
        onAbertoMudou={setMaisAberto}
      />
      {porQueAberto && corte ? (
        <PorQueDoCorteModal corte={corte} aoFechar={() => setPorQueAberto(false)} />
      ) : null}
      {metaAberto ? (
        <MetadadosDoCorteModal
          projetoId={projetoId}
          status={status}
          statusCorte={corte?.status}
          corte={corte}
          aoFechar={fecharMeta}
        />
      ) : null}
    </article>
  );
}
