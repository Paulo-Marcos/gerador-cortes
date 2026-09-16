import { useNavigate } from 'react-router-dom';
import { buildStatusPills } from '@/features/projeto-detalhe/StatusPills';
import { useAprovar, useAtualizarCorte } from '@/hooks/useEditor';
import { useAbrirPasta } from '@/hooks/useProjetoDetalhe';
import { resolveThumbUrl } from '@/lib/api';
import { formatarDuracaoHMS } from '@/lib/utils';
import type { Corte, StatusExportCorte } from '@/types/models';
import { Icon, type IconName } from '../Icon';

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

const TOM: Record<EstadoLinha, { cor: string; bg: string }> = {
  proposto: { cor: 'var(--info)', bg: 'var(--info-soft)' },
  aprovado: { cor: 'var(--accent2)', bg: 'var(--accent-soft)' },
  pronto: { cor: 'var(--ok)', bg: 'var(--ok-soft)' },
  publicado: { cor: 'var(--ok)', bg: 'var(--ok-soft)' },
  rejeitado: { cor: 'var(--mute)', bg: 'var(--inset)' },
};

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
}: CorteLinhaApProps) {
  const navigate = useNavigate();
  const abrirPasta = useAbrirPasta();
  const aprovar = useAprovar(status.corte_id, projetoId);
  const atualizar = useAtualizarCorte(status.corte_id, projetoId);

  const estado = estadoDaLinha(corte, status);
  const tom = TOM[estado];
  const capa = resolveThumbUrl(projetoId, status.thumbnail_path);
  const hue = GRADIENTES[status.numero % GRADIENTES.length];
  const pills = buildStatusPills(status);
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
      acao: () => atualizar.mutate({ status: 'proposto' }),
    },
    pronto: {
      texto: 'Publicar',
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
      acao: () => aprovar.mutate(),
    },
  }[estado];

  return (
    <article
      className="card row"
      style={{
        display: 'grid',
        gridTemplateColumns: '18px 96px 1fr auto',
        gap: 12,
        alignItems: 'center',
        padding: '9px 11px',
        opacity: estado === 'rejeitado' ? 0.72 : 1,
      }}
    >
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

      <button
        type="button"
        onClick={irEditor}
        aria-label={`Abrir o corte ${status.numero} no editor`}
        style={{
          position: 'relative',
          width: 96,
          aspectRatio: '16/9',
          padding: 0,
          border: 0,
          borderRadius: 'var(--r2)',
          overflow: 'hidden',
          background: `linear-gradient(135deg,oklch(0.55 0.05 ${hue}),oklch(0.28 0.04 ${hue}))`,
          cursor: 'pointer',
        }}
      >
        {capa ? (
          <img
            src={capa}
            alt=""
            loading="lazy"
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          />
        ) : null}
        {durSeg > 0 ? (
          <span
            style={{
              position: 'absolute',
              bottom: 3,
              right: 4,
              fontFamily: 'var(--mono)',
              fontSize: 9.5,
              color: '#fff',
              textShadow: '0 1px 2px rgb(0 0 0/.8)',
            }}
          >
            {formatarDuracaoHMS(durSeg)}
          </span>
        ) : null}
      </button>

      <span style={{ minWidth: 0 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--dim)' }}>
            #{status.numero}
          </span>
          <button
            type="button"
            onClick={irEditor}
            title={status.titulo}
            style={{
              minWidth: 0,
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
        </span>

        <span
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: 8,
            marginTop: 5,
          }}
        >
          <span className="chip" style={{ background: tom.bg, color: tom.cor }}>
            <span
              style={{ width: 6, height: 6, borderRadius: 99, background: 'currentColor' }}
              aria-hidden
            />
            {estado}
          </span>

          {/* Os oito estágios ocupam o lugar que o protótipo dá às três
              flags: mesma altura, mesmo peso, mesma cor por estado. O
              design escolheu três porque o mock tinha três; a live real
              tem oito, e esconder cinco não simplificaria a decisão —
              só adiaria a pergunta "onde foi que este parou?". */}
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            {pills.map((p) => (
              <span
                key={p.label}
                title={`${p.label} — ${p.hint}`}
                style={{
                  display: 'inline-flex',
                  color: p.done ? 'var(--ok)' : 'var(--dim)',
                  opacity: p.done ? 1 : 0.6,
                }}
              >
                <p.Icon size={11} strokeWidth={2.2} aria-hidden />
              </span>
            ))}
          </span>

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
        <button
          type="button"
          className="btn btn-icon"
          title="Metadados"
          onClick={() => navigate(`/projetos/${projetoId}/metadados`)}
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
    </article>
  );
}

const botaoOrdem = {
  display: 'grid',
  placeItems: 'center',
  width: 18,
  height: 16,
  padding: 0,
  border: '1px solid var(--line)',
  borderRadius: 'var(--r1)',
  background: 'var(--inset)',
  color: 'var(--mute)',
  cursor: 'pointer',
} as const;
