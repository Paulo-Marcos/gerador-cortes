import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAprovar, useAtualizarCorte } from '@/hooks/useEditor';
import { useAbrirPasta } from '@/hooks/useProjetoDetalhe';
import { resolveThumbUrl } from '@/lib/api';
import { formatarDuracaoHMS } from '@/lib/utils';
import type { Corte, StatusExportCorte } from '@/types/models';
import { Icon, type IconName } from '../Icon';
import { MolduraDeVideo } from '../MolduraDeVideo';
import { SeloDeEstado, TOM_DO_CORTE } from '../SeloDeEstado';
import { dicaDoPip, montarTira, textoDaProxima, type EstadoDoPip, type Tira } from '../tiraDoCorte';

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

// D-746: quatro estados, quatro formas — o âmbar com filete cheio é o
// "parou aqui"; o fantasma é o que ainda vem.
const TOM_DO_PIP: Record<EstadoDoPip, { bg: string; cor: string; filete: string; opacidade: number }> = {
  feito: { bg: 'var(--ok-soft)', cor: 'var(--ok)', filete: 'none', opacidade: 1 },
  agora: { bg: 'var(--warn-soft)', cor: 'var(--warn)', filete: 'inset 0 0 0 1px var(--warn)', opacidade: 1 },
  rejeitado: { bg: 'var(--err-soft)', cor: 'var(--err)', filete: 'none', opacidade: 1 },
  falta: { bg: 'transparent', cor: 'var(--dim)', filete: 'inset 0 0 0 1px var(--line2)', opacidade: 0.72 },
};

/**
 * A tira do corte na roupa da casca nova, agrupada em CENAS · RENDER ·
 * PUBLICAÇÃO — três perguntas respondíveis ("já gerou cenas?", "já
 * renderizou?") em vez de uma fileira de oito. A regra mora em
 * `montarTira`; aqui só a roupa, para a Pós e o modal usarem a mesma.
 */
export function TiraDoCorteAp({ tira, compacta = false }: { tira: Tira; compacta?: boolean }) {
  return (
    <span style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 9 }}>
      {tira.grupos.map((g) => (
        <span
          key={g.nome}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 5,
            padding: '2px 6px 2px 5px',
            border: '1px solid var(--line2)',
            borderRadius: 'var(--r1)',
            background: 'var(--inset)',
          }}
        >
          <span
            style={{
              fontFamily: 'var(--mono)',
              fontSize: 8.5,
              fontWeight: 700,
              letterSpacing: '.08em',
              color: 'var(--dim)',
            }}
          >
            {g.nome}
          </span>
          {g.pips.map((p) => {
            const tom = TOM_DO_PIP[p.estado];
            return (
              <span
                key={p.sigla}
                title={dicaDoPip(p)}
                aria-label={dicaDoPip(p)}
                data-estado={p.estado}
                style={{
                  display: 'grid',
                  placeItems: 'center',
                  minWidth: 22,
                  height: 15,
                  padding: '0 3px',
                  borderRadius: 2,
                  fontFamily: 'var(--mono)',
                  fontSize: 8.5,
                  fontWeight: 700,
                  letterSpacing: '.02em',
                  background: tom.bg,
                  color: tom.cor,
                  boxShadow: tom.filete,
                  opacity: tom.opacidade,
                }}
              >
                {p.sigla}
              </span>
            );
          })}
        </span>
      ))}
      <span style={{ fontFamily: 'var(--mono)', fontSize: 10, fontWeight: 700, color: 'var(--mute)' }}>
        {tira.contagem}
      </span>
      {compacta ? null : (
        <span
          style={{
            fontSize: 11,
            whiteSpace: 'nowrap',
            color: tira.proxima ? 'var(--warn)' : 'var(--dim)',
          }}
        >
          {textoDaProxima(tira)}
        </span>
      )}
    </span>
  );
}

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
  const capa = resolveThumbUrl(projetoId, status.thumbnail_path);
  const [capaErro, setCapaErro] = useState(false);
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
        gridTemplateColumns: '18px 96px minmax(0, 1fr) auto',
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
