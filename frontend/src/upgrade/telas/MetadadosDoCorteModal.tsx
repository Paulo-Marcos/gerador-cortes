import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { metadataKey } from '@/features/metadata/MetadataCard';
import { api, resolveThumbUrl } from '@/lib/api';
import { copyTextToClipboard } from '@/lib/clipboard';
import type { Corte, StatusExportCorte } from '@/types/models';
import { Icon } from '../Icon';
import { MolduraDeVideo } from '../MolduraDeVideo';
import { montarTira } from '../tiraDoCorte';
import { TiraDoCorteAp } from './TiraDoCorteAp';

// ─────────────────────────────────────────────────────────────────
// D-746 · RODADA 3 · consultar o metadado de um corte sem sair da lista.
//
// O botão de metadados da linha fazia `navigate('/metadados')`: conferir
// o título de UM corte custava a lista inteira e a posição de rolagem.
// Consultar não é navegar — o modal mostra, e só o "Editar" leva à tela.
// ─────────────────────────────────────────────────────────────────

function Campo({ rotulo, valor, alto = false }: { rotulo: string; valor: string; alto?: boolean }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
      <span className="lbl">{rotulo}</span>
      <div
        style={{
          padding: '7px 9px',
          border: '1px solid var(--line)',
          borderRadius: 'var(--r2)',
          background: 'var(--inset)',
          fontSize: 12.5,
          lineHeight: 1.45,
          color: valor ? 'var(--ink)' : 'var(--dim)',
          whiteSpace: 'pre-wrap',
          overflowWrap: 'anywhere',
          maxHeight: alto ? 120 : undefined,
          overflow: alto ? 'auto' : undefined,
        }}
      >
        {valor || 'vazio'}
      </div>
    </div>
  );
}

/** R4: corte ainda sem linha no status de export — a tira sai toda pendente
 *  em vez de o modal não abrir. */
export function statusMinimo(corte: Corte): StatusExportCorte {
  return {
    corte_id: corte.id,
    numero: corte.numero,
    titulo: corte.titulo_proposto,
    raw_pronto: false,
    grade_pronta: false,
    overlays_prontos: false,
    cenas_geradas: false,
    cenas_validadas: false,
    video_pronto: false,
    thumbnail_pronta: false,
    metadados_completos: false,
    pronto_publicar: false,
  };
}

export function MetadadosDoCorteModal({
  projetoId,
  status,
  statusCorte,
  aoFechar,
}: {
  projetoId: string;
  status: StatusExportCorte;
  statusCorte?: string;
  aoFechar: () => void;
}) {
  const navigate = useNavigate();
  const caixa = useRef<HTMLDivElement>(null);
  const [copiado, setCopiado] = useState(false);
  const [capaErro, setCapaErro] = useState(false);
  const meta = useQuery({
    queryKey: metadataKey(status.corte_id),
    queryFn: () => api.obterMetadado(status.corte_id),
  });

  useEffect(() => {
    const gatilho = document.activeElement as HTMLElement | null;
    caixa.current?.querySelector<HTMLElement>('button')?.focus();
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      // Para aqui: sem isso o Esc segue e fecha o que estiver atrás.
      e.stopPropagation();
      aoFechar();
    };
    document.addEventListener('keydown', aoTeclar, true);
    return () => {
      document.removeEventListener('keydown', aoTeclar, true);
      gatilho?.focus?.();
    };
  }, [aoFechar]);

  const m = meta.data;
  const prompt = m?.prompt_thumbnail ?? '';
  const capa = resolveThumbUrl(projetoId, m?.thumbnail_path || status.thumbnail_path);

  const copiar = async () => {
    if (await copyTextToClipboard(prompt)) {
      setCopiado(true);
      window.setTimeout(() => setCopiado(false), 1400);
    }
  };

  // Portal para a `.ap`: aberto de dentro da linha do corte, o modal ficaria
  // preso a ela — o vidro (`backdrop-filter`) do card vira a referência do
  // `position: fixed`. Na `.ap` ele cobre a tela e continua com os tokens.
  const destino = document.querySelector('.ap') ?? document.body;
  return createPortal(
    <div
      role="presentation"
      onClick={aoFechar}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 60,
        display: 'grid',
        placeItems: 'center',
        padding: 24,
        background: 'rgb(10 12 18/.5)',
        backdropFilter: 'blur(3px)',
      }}
    >
      <div
        ref={caixa}
        className="card"
        role="dialog"
        aria-modal="true"
        aria-label={`Metadados do corte ${status.numero}`}
        onClick={(e) => e.stopPropagation()}
        style={{
          display: 'flex',
          flexDirection: 'column',
          width: 'min(720px, 100%)',
          maxHeight: 'calc(100dvh - 48px)',
          overflow: 'hidden',
          // Sólido: é um formulário de leitura, e o vidro deixava a lista de
          // trás atravessar o texto.
          background: 'var(--solid)',
          boxShadow: '0 24px 64px rgb(0 0 0/.35)',
        }}
      >
        <header
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 9,
            padding: '12px 14px',
            borderBottom: '1px solid var(--line2)',
          }}
        >
          <Icon name="tags" size={15} style={{ color: 'var(--accent)', flex: 'none' }} />
          <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1 }}>
            <strong style={{ fontSize: 13.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              #{status.numero} · {status.titulo}
            </strong>
            <span style={{ fontSize: 11, color: 'var(--mute)' }}>
              metadados do corte — só consulta; a lista atrás fica onde estava
            </span>
          </span>
          <button
            type="button"
            className="btn btn-icon"
            onClick={aoFechar}
            aria-label="Fechar"
            title="Fechar (Esc)"
          >
            <Icon name="x" size={13} />
          </button>
        </header>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1fr) 216px',
            gap: 14,
            padding: 14,
            overflow: 'auto',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
            {meta.isLoading ? (
              <span style={{ color: 'var(--mute)', fontSize: 12.5 }}>Carregando…</span>
            ) : meta.isError ? (
              <span style={{ color: 'var(--err)', fontSize: 12.5 }}>
                Não foi possível ler os metadados deste corte.
              </span>
            ) : (
              <>
                <Campo rotulo="Título" valor={m?.titulo_youtube ?? ''} />
                <Campo rotulo="Texto da capa" valor={m?.texto_capa ?? ''} />
                <Campo rotulo="Descrição" valor={m?.descricao_youtube ?? ''} alto />
                <Campo rotulo="Tags" valor={(m?.tags_youtube ?? []).join(', ')} />
                <Campo rotulo="Prompt da capa" valor={prompt} alto />
              </>
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <MolduraDeVideo mat={6} proporcao="16/9">
              {capa && !capaErro ? (
                <img
                  src={capa}
                  alt=""
                  onError={() => setCapaErro(true)}
                  style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
                />
              ) : (
                <span
                  style={{
                    position: 'absolute',
                    inset: 0,
                    display: 'grid',
                    placeItems: 'center',
                    fontSize: 11,
                    color: 'var(--dim)',
                  }}
                >
                  sem capa
                </span>
              )}
            </MolduraDeVideo>
            <TiraDoCorteAp tira={montarTira(status, statusCorte)} />
          </div>
        </div>

        <footer
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            gap: 8,
            padding: '10px 14px',
            borderTop: '1px solid var(--line2)',
          }}
        >
          <button
            type="button"
            className="btn"
            onClick={() => void copiar()}
            disabled={!prompt}
            title={prompt ? 'Copiar o prompt da capa' : 'Este corte ainda não tem prompt de capa'}
          >
            <Icon name={copiado ? 'check' : 'copy'} size={12} />
            {copiado ? 'Copiado' : 'Copiar prompt'}
          </button>
          <button
            type="button"
            className="btn btn-pri"
            onClick={() => navigate(`/projetos/${projetoId}/metadados`)}
          >
            <Icon name="tags" size={12} />
            Editar na tela de metadados
          </button>
        </footer>
      </div>
    </div>,
    destino,
  );
}
