import { useCallback, useRef, useState, type FocusEvent, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useAprovar, useAtualizarCorte, useDeletarCorte } from '@/features/editor/useCortes';
import { confirmacaoExcluirCorte } from '@/features/editor/regeracaoConfirmacao';
import { ConfirmDialog, useConfirmacao } from '@/components/ui/confirm-dialog';
import { useToast } from '@/components/ui/toaster';
import { useAbrirPasta } from '@/features/projeto-detalhe/useProjetoDetalhe';
import { resolveThumbUrl } from '@/lib/api';
import { formatarDuracaoHMS } from '@/lib/utils';
import type { Corte, StatusExportCorte } from '@/types/models';
import { OverflowMenu } from '@/components/ui/overflow-menu';
import { Icon, ICONE_DO_CONCEITO } from '@/upgrade/Icon';
import { MolduraDeVideo } from '@/upgrade/MolduraDeVideo';
import { SeloDeEstado, TOM_DO_CORTE } from '@/upgrade/SeloDeEstado';
import { montarTira } from '@/upgrade/tiraDoCorte';
import { MetadadosDoCorteModal } from '@/features/metadata/MetadadosDoCorteModal';
import { BarraDoCorte } from '@/upgrade/BarraDoCorte';
import { estadoDaLinha, maisDaLinha, primarioDaLinha } from './acoesDaLinha';
import { acaoDaTeclaNaLinha } from './cortesDoWorkspace';

// ─────────────────────────────────────────────────────────────────
// D-599 · A linha do corte no Workspace.
//
// O protótipo troca o card por LINHA, e a troca tem uma razão: numa
// live de 14 cortes a pergunta não é "como é este corte?" e sim "qual
// deles ainda me deve alguma coisa?". Linha deixa comparar de cima a
// baixo; grade obriga a varrer.
//
// A leitura vai da esquerda para a direita e termina na decisão:
// miniatura → identidade → o que falta → o que fazer agora.
//
// D-868 (Onda 3, notas 3 e 4): o "o que falta" eram 11 siglas e virou uma
// barra de 8 passos com "N de 8 · próximo: verbo"; o "o que fazer" eram seis
// ícones e virou Editar e o principal, com rótulo, mais um "⋯" com o resto
// (acoesDaLinha). Alvos de 32 px.
// ─────────────────────────────────────────────────────────────────

const GRADIENTES = [250, 22, 160, 300, 60, 200];

/** O foco saiu da linha (e não só passou de um botão dela para outro)? */
export function focoSaiuDaLinha(e: Pick<FocusEvent<HTMLElement>, 'currentTarget' | 'relatedTarget'>) {
  return !e.currentTarget.contains(e.relatedTarget as Node | null);
}

/**
 * D-868: o vidro (`backdrop-filter`) faz de cada linha um contexto de
 * empilhamento, e a linha de BAIXO pintava por cima do "⋯" aberto da de
 * cima (medido no navegador). A linha com o foco — clicar no ⋯ o põe nela
 * — sobe de camada enquanto o tem.
 */
function useLinhaEmFoco() {
  const [emFoco, setEmFoco] = useState(false);
  return {
    camada: emFoco ? 3 : undefined,
    onFocus: () => setEmFoco(true),
    onBlur: (e: FocusEvent<HTMLElement>) => focoSaiuDaLinha(e) && setEmFoco(false),
  };
}

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
};

type TriagemPeloTeclado = {
  projetoId: string;
  corte: Corte | undefined;
  status: StatusExportCorte;
  metaAberto: boolean;
  aprovar: ReturnType<typeof useAprovar>;
  atualizar: ReturnType<typeof useAtualizarCorte>;
  avisarFalha: (acao: string) => (erro: unknown) => void;
};

/**
 * D-746/D-842: triagem pelo teclado na linha focada (a regra da tecla mora em
 * `acaoDaTeclaNaLinha`). Digitando num campo, nada disso vale. R abre o mesmo
 * diálogo de exclusão do editor; só o "Excluir de vez" apaga, e o foco segue
 * para a linha vizinha em vez de cair no nada. Desistir devolve o foco à
 * própria linha: o modal não o restaura, e sem isso J/K/A paravam até um clique.
 */
function useTriagemPeloTeclado({
  projetoId,
  corte,
  status,
  metaAberto,
  aprovar,
  atualizar,
  avisarFalha,
}: TriagemPeloTeclado) {
  const deletar = useDeletarCorte(status.corte_id, projetoId);
  const confirmacao = useConfirmacao();
  const linhaQuePediu = useRef<HTMLElement | null>(null);
  const cancelar = () => {
    confirmacao.cancelar();
    linhaQuePediu.current?.focus();
  };

  const aoTeclar = (e: KeyboardEvent<HTMLElement>) => {
    const alvo = e.target as HTMLElement;
    // R4: o modal de metadados é filho JSX desta linha — mesmo saindo por
    // portal, o keydown sobe pela árvore do React até aqui. Sem esta guarda,
    // `A` aprovava o corte de trás com o modal aberto.
    if (metaAberto || confirmacao.pedido || alvo.closest('[role="dialog"]')) return;
    if (e.metaKey || e.ctrlKey || e.altKey || alvo.closest('input, textarea, select')) return;
    const acao = acaoDaTeclaNaLinha(e.key, corte?.status);
    if (!acao) return;
    e.preventDefault();
    const linha = e.currentTarget;
    if (acao === 'aprovar') aprovar.mutate(undefined, { onError: avisarFalha('aprovar') });
    else if (acao === 'devolver')
      atualizar.mutate({ status: 'proposto' }, { onError: avisarFalha('devolver') });
    else if (acao === 'excluir') {
      linhaQuePediu.current = linha;
      confirmacao.executarOuPedir(confirmacaoExcluirCorte(status.numero, status.titulo ?? ''), () => {
        const vizinha = (linha.nextElementSibling ?? linha.previousElementSibling) as HTMLElement | null;
        deletar.mutate(undefined, { onSuccess: () => vizinha?.focus(), onError: avisarFalha('excluir') });
      });
    } else {
      e.stopPropagation();
      const vizinha = (acao === 'descer' ? linha.nextElementSibling : linha.previousElementSibling) as
        | HTMLElement
        | null;
      vizinha?.focus();
    }
  };

  return { aoTeclar, confirmacao, cancelar };
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
}: CorteLinhaApProps) {
  const navigate = useNavigate();
  const abrirPasta = useAbrirPasta();
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
  const capa = resolveThumbUrl(projetoId, status.thumbnail_path);
  const [capaErro, setCapaErro] = useState(false);
  const [metaAberto, setMetaAberto] = useState(false);
  const fecharMeta = useCallback(() => setMetaAberto(false), []);
  const hue = GRADIENTES[status.numero % GRADIENTES.length];
  const tira = montarTira(status, corte?.status);
  const durSeg = corte?.duracao_clip_seg || (corte ? corte.fim_seg - corte.inicio_seg : 0);

  const irEditor = () => navigate(`/projetos/${projetoId}/cortes/${status.corte_id}`);

  const primario = primarioDaLinha(estado, {
    aprovar: () => aprovar.mutate(undefined, { onError: avisarFalha('aprovar') }),
    voltar: () => atualizar.mutate({ status: 'proposto' }, { onError: avisarFalha('voltar') }),
    enviarYoutube: onEnviarYoutube,
    finalizar: () => navigate(`/projetos/${projetoId}/post-production?corte=${status.corte_id}`),
    abrirNoYoutube: () =>
      window.open(status.youtube_url_publicado ?? '', '_blank', 'noopener,noreferrer'),
  });
  const mais = maisDaLinha({
    publicado: Boolean(status.youtube_url_publicado || status.tiktok_publicado_em),
    abrindoPasta: abrirPasta.isPending,
    posProducao: () =>
      navigate(`/projetos/${projetoId}/post-production?corte=${status.corte_id}`),
    metadados: () => setMetaAberto(true),
    abrirPasta: () => abrirPasta.mutate(status.corte_id),
    informarUrl: onInformarUrl,
    liberarPublicacao: onLiberarPublicacao,
  });

  const foco = useLinhaEmFoco();
  const { aoTeclar, confirmacao, cancelar } = useTriagemPeloTeclado({
    projetoId,
    corte,
    status,
    metaAberto,
    aprovar,
    atualizar,
    avisarFalha,
  });

  return (
    <article
      className="card row"
      tabIndex={0}
      onKeyDown={aoTeclar}
      onFocus={foco.onFocus}
      onBlur={foco.onBlur}
      aria-label={`Corte #${status.numero} — ${status.titulo}`}
      style={{
        display: 'grid',
        gridTemplateColumns: onAlternarSelecao
          ? '16px 24px 96px minmax(0, 1fr) 190px auto'
          : '24px 96px minmax(0, 1fr) 190px auto',
        gap: 12,
        alignItems: 'center',
        padding: '9px 11px',
        opacity: estado === 'rejeitado' ? 0.72 : 1,
        borderColor: selecionado ? 'var(--sel-line)' : undefined,
        position: 'relative',
        zIndex: foco.camada,
      }}
    >
      {onAlternarSelecao ? (
        <input
          type="checkbox"
          checked={selecionado}
          onChange={onAlternarSelecao}
          aria-label={`Selecionar o corte #${status.numero}`}
          style={{ width: 15, height: 15, margin: 0, accentColor: 'var(--accent)', cursor: 'pointer' }}
        />
      ) : null}
      {/* Reordenar fica antes da miniatura: é a única ação que muda a
          LISTA e não o corte, e misturá-la com as outras à direita
          confundia os dois tipos de gesto. */}
      <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <button
          type="button"
          onClick={() => onMover(-1)}
          disabled={!podeSubir || reordenando}
          aria-label={`Mover corte ${status.numero} para cima`}
          style={botaoOrdem}
        >
          <Icon name="chevron-up" />
        </button>
        <button
          type="button"
          onClick={() => onMover(1)}
          disabled={!podeDescer || reordenando}
          aria-label={`Mover corte ${status.numero} para baixo`}
          style={botaoOrdem}
        >
          <Icon name="chevron-down" />
        </button>
      </span>

      <MolduraDeVideo
        mat={4}
        proporcao="16/9"
        onClick={irEditor}
        rotulo={`Abrir o corte ${status.numero} no editor`}
      >
        <span
          aria-hidden
          style={{
            position: 'absolute',
            inset: 0,
            background: `linear-gradient(135deg,oklch(0.55 0.05 ${hue}),oklch(0.28 0.04 ${hue}))`,
          }}
        />
        {capa && !capaErro ? (
          <img
            src={capa}
            alt=""
            loading="lazy"
            // A limpeza de mídia apaga a capa do disco: sem isto o card
            // mostrava o ícone de imagem quebrada sobre o gradiente.
            onError={() => setCapaErro(true)}
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              display: 'block',
            }}
          />
        ) : null}
        {durSeg > 0 ? (
          <span
            style={{
              position: 'absolute',
              bottom: 3,
              right: 4,
              zIndex: 1,
              fontFamily: 'var(--mono)',
              fontSize: 9.5,
              color: '#fff',
              textShadow: '0 1px 2px rgb(0 0 0/.8)',
            }}
          >
            {formatarDuracaoHMS(durSeg)}
          </span>
        ) : null}
      </MolduraDeVideo>

      <span style={{ minWidth: 0 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--dim)' }}>
            #{status.numero}
          </span>
          <button
            type="button"
            onClick={irEditor}
            title={status.titulo ?? undefined}
            style={{
              minWidth: 0,
              // R4: o título abre o corte e media 20 px de altura clicável.
              minHeight: 24,
              padding: 0,
              border: 0,
              background: 'none',
              fontSize: 13,
              fontWeight: 700,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              textAlign: 'left',
              textDecoration: estado === 'rejeitado' ? 'line-through' : 'none',
              cursor: 'pointer',
            }}
          >
            {status.titulo || `Corte #${status.numero}`}
          </button>
          {corte?.is_fire ? (
            <span style={{ color: 'var(--accent)', flex: 'none' }} title="Marcado como fire">
              <Icon name="flame" />
            </span>
          ) : null}
          <SeloDeEstado tom={TOM_DO_CORTE[estado]}>{estado}</SeloDeEstado>
        </span>

        {corte ? (
          <span
            style={{
              display: 'block',
              marginTop: 6,
              fontFamily: 'var(--mono)',
              fontSize: 11,
              color: 'var(--dim)',
            }}
          >
            {corte.inicio_hms} → {corte.fim_hms}
          </span>
        ) : null}
      </span>

      <BarraDoCorte tira={tira} />

      <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <button type="button" className="btn" style={ALVO} onClick={irEditor}>
          <Icon name={ICONE_DO_CONCEITO.editar} />
          Editar
        </button>
        <button
          type="button"
          className={primario.forte ? 'btn btn-pri' : 'btn'}
          style={ALVO}
          onClick={primario.acao}
          disabled={enviando && estado === 'pronto'}
        >
          <Icon name={enviando && estado === 'pronto' ? 'loader' : primario.icone} />
          {primario.texto}
        </button>
        <OverflowMenu
          items={mais}
          label={`Mais ações do corte ${status.numero}`}
          grande
        />
      </span>
      {/* Portal para a `.ap`, como o de metadados: o vidro (`backdrop-filter`)
          do card vira a referência do `position: fixed` e prenderia o diálogo
          dentro da linha. */}
      {confirmacao.pedido
        ? createPortal(
            <ConfirmDialog
              pedido={confirmacao.pedido}
              onCancel={cancelar}
              onConfirm={confirmacao.confirmar}
            />,
            document.querySelector('.ap') ?? document.body,
          )
        : null}
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

// D-868: os alvos das ações da linha têm 32 px (o `.btn` tem 30).
const ALVO = { height: 32 } as const;

// R4: reordenar é o menor alvo da casca e o gesto que erra mais caro — ele
// muda a LISTA, não o corte. Sobe para o piso de alvo clicável.
const botaoOrdem = {
  display: 'grid',
  placeItems: 'center',
  width: 24,
  height: 24,
  padding: 0,
  border: '1px solid var(--line)',
  borderRadius: 'var(--r1)',
  background: 'var(--inset)',
  color: 'var(--mute)',
  cursor: 'pointer',
} as const;
