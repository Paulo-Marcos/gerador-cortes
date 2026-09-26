import { useCallback, useState, type KeyboardEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAprovar, useAtualizarCorte } from '@/hooks/useEditor';
import { useToast } from '@/components/ui/toaster';
import { useAbrirPasta } from '@/hooks/useProjetoDetalhe';
import { resolveThumbUrl } from '@/lib/api';
import { formatarDuracaoHMS } from '@/lib/utils';
import type { Corte, StatusExportCorte } from '@/types/models';
import { Icon, type IconName } from '../Icon';
import { MolduraDeVideo } from '../MolduraDeVideo';
import { SeloDeEstado, TOM_DO_CORTE } from '../SeloDeEstado';
import { montarTira } from '../tiraDoCorte';
import { MetadadosDoCorteModal } from './MetadadosDoCorteModal';
import { TiraDoCorteAp } from './TiraDoCorteAp';

// ─────────────────────────────────────────────────────────────────
// D-599 · A linha do corte no Workspace.
//
// O protótipo troca o card por LINHA, e a troca tem uma razão: numa
// live de 14 cortes a pergunta não é "como é este corte?" e sim "qual
// deles ainda me deve alguma coisa?". Linha deixa comparar de cima a
// baixo; grade obriga a varrer.
//
// A leitura vai da esquerda para a direita e termina na decisão:
// miniatura → identidade → estado → o que falta → o que fazer agora.
// ─────────────────────────────────────────────────────────────────

type EstadoLinha = 'proposto' | 'aprovado' | 'pronto' | 'publicado' | 'rejeitado';

const GRADIENTES = [250, 22, 160, 300, 60, 200];

/**
 * O estado que a linha mostra. Não é o enum do banco: `StatusCorte` não
 * sabe se o corte já subiu nem se o render fechou, e são essas duas
 * coisas que decidem o que o botão da direita deve oferecer.
 */
function estadoDaLinha(corte: Corte | undefined, status: StatusExportCorte): EstadoLinha {
  if (status.youtube_url_publicado) return 'publicado';
  if (corte?.status === 'rejeitado') return 'rejeitado';
  if (status.pronto_publicar) return 'pronto';
  if (corte && corte.status !== 'proposto') return 'aprovado';
  return 'proposto';
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

  // Cada estado pede UMA coisa. Oferecer "Publicar" num corte sem render
  // ou "Aprovar" num que já está no ar é convidar ao erro — por isso o
  // botão da direita muda de nome, de ícone e de peso junto com o estado.
  const primario: { texto: string; icone: IconName; forte: boolean; acao: () => void } = {
    publicado: {
      texto: 'No ar',
      icone: 'external-link' as IconName,
      forte: false,
      acao: () =>
        window.open(status.youtube_url_publicado ?? '', '_blank', 'noopener,noreferrer'),
    },
    rejeitado: {
      texto: 'Voltar',
      icone: 'undo-2' as IconName,
      forte: false,
      acao: () => atualizar.mutate({ status: 'proposto' }, { onError: avisarFalha('voltar') }),
    },
    pronto: {
      // D-746: o verbo do resultado; o clique abre a conferência, não envia.
      texto: 'Enviar ao YouTube',
      icone: 'send' as IconName,
      forte: true,
      acao: onEnviarYoutube,
    },
    aprovado: {
      texto: 'Finalizar',
      icone: 'clapperboard' as IconName,
      forte: true,
      acao: () => navigate(`/projetos/${projetoId}/post-production?corte=${status.corte_id}`),
    },
    proposto: {
      texto: 'Aprovar',
      icone: 'check' as IconName,
      forte: false,
      acao: () => aprovar.mutate(undefined, { onError: avisarFalha('aprovar') }),
    },
  }[estado];

  // D-746: triagem pelo teclado na linha focada. A aprova, R devolve (nunca
  // apaga), J/K andam entre as linhas. Digitando num campo, nada disso vale.
  const aoTeclar = (e: KeyboardEvent<HTMLElement>) => {
    const alvo = e.target as HTMLElement;
    // R4: o modal de metadados é filho JSX desta linha — mesmo saindo por
    // portal, o keydown sobe pela árvore do React até aqui. Sem esta guarda,
    // `A` aprovava o corte de trás com o modal aberto.
    if (metaAberto || alvo.closest('[role="dialog"]')) return;
    if (e.metaKey || e.ctrlKey || e.altKey || alvo.closest('input, textarea, select')) return;
    const tecla = e.key.toLowerCase();
    if (tecla === 'a' && corte?.status === 'proposto') {
      e.preventDefault();
      aprovar.mutate(undefined, { onError: avisarFalha('aprovar') });
    } else if (tecla === 'r' && corte && ['aprovado', 'processado'].includes(corte.status)) {
      e.preventDefault();
      atualizar.mutate({ status: 'proposto' }, { onError: avisarFalha('devolver') });
    } else if (tecla === 'j' || tecla === 'k') {
      e.preventDefault();
      e.stopPropagation();
      const linha = e.currentTarget;
      const vizinha = (tecla === 'j' ? linha.nextElementSibling : linha.previousElementSibling) as
        | HTMLElement
        | null;
      vizinha?.focus();
    }
  };

  return (
    <article
      className="card row"
      tabIndex={0}
      onKeyDown={aoTeclar}
      aria-label={`Corte #${status.numero} — ${status.titulo}`}
      style={{
        display: 'grid',
        gridTemplateColumns: onAlternarSelecao
          ? '16px 24px 96px minmax(0, 1fr) auto'
          : '24px 96px minmax(0, 1fr) auto',
        gap: 12,
        alignItems: 'center',
        padding: '9px 11px',
        opacity: estado === 'rejeitado' ? 0.72 : 1,
        borderColor: selecionado ? 'var(--accent)' : undefined,
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
          <Icon name="chevron-up" size={10} />
        </button>
        <button
          type="button"
          onClick={() => onMover(1)}
          disabled={!podeDescer || reordenando}
          aria-label={`Mover corte ${status.numero} para baixo`}
          style={botaoOrdem}
        >
          <Icon name="chevron-down" size={10} />
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
              <Icon name="flame" size={13} />
            </span>
          ) : null}
          <SeloDeEstado tom={TOM_DO_CORTE[estado]}>{estado}</SeloDeEstado>
        </span>

        <span
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: 8,
            marginTop: 6,
          }}
        >
          <TiraDoCorteAp tira={tira} />

          {corte ? (
            <span style={{ fontFamily: 'var(--mono)', fontSize: 10.5, color: 'var(--dim)' }}>
              {corte.inicio_hms} → {corte.fim_hms}
            </span>
          ) : null}
        </span>
      </span>

      <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
        <button type="button" className="btn btn-icon" title="Editar corte" onClick={irEditor}>
          <Icon name="scissors" size={13} />
        </button>
        <button
          type="button"
          className="btn btn-icon"
          title="Pós-produção"
          onClick={() =>
            navigate(`/projetos/${projetoId}/post-production?corte=${status.corte_id}`)
          }
        >
          <Icon name="clapperboard" size={13} />
        </button>
        {/* D-746: consultar não é navegar — o { } abre o metadado aqui, e a
            lista fica onde estava. Destacado porque é a consulta mais
            frequente da linha. */}
        <button
          type="button"
          className="btn btn-icon"
          title="Metadados do corte — abre aqui, sem sair da lista"
          aria-label="Metadados do corte"
          onClick={() => setMetaAberto(true)}
          style={{
            borderColor: 'var(--accent)',
            color: 'var(--accent)',
            background: 'var(--accent-soft)',
          }}
        >
          <Icon name="tags" size={13} />
        </button>
        <button
          type="button"
          className="btn btn-icon"
          title="Abrir a pasta do corte"
          onClick={() => abrirPasta.mutate(status.corte_id)}
          disabled={abrirPasta.isPending}
        >
          <Icon name="folder" size={13} />
        </button>

        {status.youtube_url_publicado || status.tiktok_publicado_em ? (
          <button
            type="button"
            className="btn btn-icon"
            title="Liberar publicação (subir de novo)"
            onClick={onLiberarPublicacao}
          >
            <Icon name="rotate-ccw" size={13} />
          </button>
        ) : (
          <button
            type="button"
            className="btn btn-icon"
            title="Informar a URL de um vídeo já publicado no YouTube"
            onClick={onInformarUrl}
          >
            <Icon name="play" size={13} />
          </button>
        )}

        <button
          type="button"
          className={primario.forte ? 'btn btn-pri' : 'btn'}
          onClick={primario.acao}
          disabled={enviando && estado === 'pronto'}
        >
          <Icon name={enviando && estado === 'pronto' ? 'loader' : primario.icone} size={13} />
          {primario.texto}
        </button>
      </span>
      {metaAberto ? (
        <MetadadosDoCorteModal
          projetoId={projetoId}
          status={status}
          statusCorte={corte?.status}
          aoFechar={fecharMeta}
        />
      ) : null}
    </article>
  );
}

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
