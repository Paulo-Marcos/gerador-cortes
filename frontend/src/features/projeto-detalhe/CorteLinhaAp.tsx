import { useCallback, useRef, useState, type KeyboardEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAprovar, useAtualizarCorte } from '@/features/editor/useCortes';
import { useRiscarCorte } from '@/features/editor/useRiscarCorte';
import { useToast } from '@/components/ui/toaster';
import { useAbrirPasta } from '@/features/projeto-detalhe/useProjetoDetalhe';
import { ShortsDesteCorte } from '@/features/shorts/ShortsDesteCorte';
import { useCapaDaLinha } from './useCapaDaLinha';
import { useFocoDaLinhaNaUrl } from './useFocoDaLinhaNaUrl';
import { formatarDuracaoHMS } from '@/lib/utils';
import type { Corte, StatusExportCorte } from '@/types/models';
import { OverflowMenu } from '@/components/ui/overflow-menu';
import { Icon, ICONE_DO_CONCEITO } from '@/upgrade/Icon';
import { MolduraDeVideo } from '@/upgrade/MolduraDeVideo';
import { SeloDeEstado, TOM_DO_CORTE } from '@/upgrade/SeloDeEstado';
import { montarTira } from '@/upgrade/tiraDoCorte';
import { MetadadosDoCorteModal } from '@/features/metadata/MetadadosDoCorteModal';
import { BarraDoCorte } from '@/upgrade/BarraDoCorte';
import { BARRA_EM_COLUNA_MIN_PX, useJanelaMin } from '@/upgrade/medidas';
import { estadoDaLinha, maisDaLinha, ondeJaSubiu, primarioDaLinha, montarProximoDaLinha } from './acoesDaLinha';
import { acaoDaTeclaNaLinha } from './cortesDoWorkspace';
import { SeloDaNota } from '@/features/porque-do-corte/SeloDaNota';
import { SeloDaOrigem } from './SeloDaOrigem';
import { PorQueDoCorteModal } from '@/features/porque-do-corte/PorQueDoCorteModal';

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

/**
 * D-868: as colunas da linha. Com janela larga a barra tem coluna própria;
 * abaixo de BARRA_EM_COLUNA_MIN_PX ela desce para baixo do título — a
 * coluna de 190 px tirava o espaço do título, que a 1024 px chegava a 0.
 */
export function colunasDaLinha(comSelecao: boolean, barraEmColuna: boolean): string {
  return [comSelecao && '16px', '24px', '96px', 'minmax(0, 1fr)', barraEmColuna && '190px', 'auto']
    .filter(Boolean)
    .join(' ');
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
    const linha = e.currentTarget;
    if (acao === 'aprovar') aprovar.mutate(undefined, { onError: avisarFalha('aprovar') });
    else if (acao === 'devolver')
      atualizar.mutate({ status: 'proposto' }, { onError: avisarFalha('devolver') });
    else if (acao === 'explicar') explicar();
    else if (acao === 'riscar') {
      linhaQuePediu.current = linha;
      vizinhaAoRiscar.current = (linha.nextElementSibling ?? linha.previousElementSibling) as HTMLElement | null;
      riscar.riscarCorte();
    } else {
      e.stopPropagation();
      const vizinha = (acao === 'descer' ? linha.nextElementSibling : linha.previousElementSibling) as
        | HTMLElement
        | null;
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
  const capa = useCapaDaLinha(projetoId, status.thumbnail_path);
  const [capaErro, setCapaErro] = useState(false);
  const [metaAberto, setMetaAberto] = useState(false);
  const [porQueAberto, setPorQueAberto] = useState(false);
  const fecharMeta = useCallback(() => setMetaAberto(false), []);
  const hue = GRADIENTES[status.numero % GRADIENTES.length];
  const tira = montarTira(status, corte?.status);
  const durSeg = corte?.duracao_clip_seg || (corte ? corte.fim_seg - corte.inicio_seg : 0);

  const irEditor = () => navigate(`/projetos/${projetoId}/cortes/${status.corte_id}`);

  const primario = primarioDaLinha(estado, {
    aprovar: () => aprovar.mutate(undefined, { onError: avisarFalha('aprovar') }),
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
    informarUrl: onInformarUrl,
    liberarPublicacao: onLiberarPublicacao,
  });

  // D-868: o vidro de cada linha é um contexto de empilhamento, e a de baixo
  // pintava por cima do ⋯ aberto. A linha sobe enquanto o SEU ⋯ está aberto
  // (amarrar ao foco falhava: K ou Tab levavam o foco e o menu ficava aberto).
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

  return (
    <article
      ref={refDaLinha}
      className="card row"
      tabIndex={0}
      onKeyDown={aoTeclar}
      aria-label={`Corte #${status.numero} — ${status.titulo}`}
      style={{
        display: 'grid',
        gridTemplateColumns: colunasDaLinha(Boolean(onAlternarSelecao), barraEmColuna),
        gap: 12,
        alignItems: 'center',
        padding: '9px 11px',
        opacity: estado === 'rejeitado' ? 0.72 : 1,
        borderColor: selecionado ? 'var(--sel-line)' : undefined,
        position: 'relative',
        zIndex: maisAberto ? 3 : undefined,
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
          <span style={DURACAO_NA_MINIATURA}>{formatarDuracaoHMS(durSeg)}</span>
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
              ...TITULO,
              textDecoration: estado === 'rejeitado' ? 'line-through' : 'none',
            }}
          >
            {status.titulo || `Corte #${status.numero}`}
          </button>
          {corte?.is_fire ? (
            <ShortsDesteCorte corteId={status.corte_id} />
          ) : null}
          <SeloDeEstado tom={TOM_DO_CORTE[estado]}>{estado}</SeloDeEstado>
          <SeloDaOrigem origem={corte?.origem_analise} />
          <SeloDaNota score={corte?.score} onAbrir={() => setPorQueAberto(true)} />
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
        {barraEmColuna ? null : (
          <span style={{ display: 'block', marginTop: 6, maxWidth: 260 }}>
            <BarraDoCorte tira={tira} />
          </span>
        )}
      </span>

      {barraEmColuna ? <BarraDoCorte tira={tira} /> : null}

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
          onAbertoMudou={setMaisAberto}
        />
      </span>
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

const DURACAO_NA_MINIATURA = {
  position: 'absolute',
  bottom: 3,
  right: 4,
  zIndex: 1,
  fontFamily: 'var(--mono)',
  fontSize: 9.5,
  color: '#fff',
  textShadow: '0 1px 2px rgb(0 0 0/.8)',
} as const;

// D-868: os alvos das ações da linha têm 32 px (o `.btn` tem 30).
const ALVO = { height: 32 } as const;

const TITULO = {
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
  cursor: 'pointer',
} as const;

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
