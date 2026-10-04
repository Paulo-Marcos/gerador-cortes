import { Link } from 'react-router-dom';
import { Icon } from './Icon';
import { TOM_DA_ETAPA } from './SeloDeEstado';
import type { EtapaDaTrilha } from './trilhaDaLive';

// ─────────────────────────────────────────────────────────────────
// D-866 · A trilha da live, desenhada.
//
// Ocupa o lugar da fita (D-599 R2): uma faixa logo abaixo da barra
// superior, só nas telas de dentro de uma live, sempre no mesmo lugar.
// Sete casas de largura igual — a régua não pula quando uma contagem
// cresce — com o marcador (✓ ou o número), o nome e a contagem.
//
// A casa acesa usa a tinta neutra de seleção (--sel-*), a mesma do item
// ativo do trilho (D-847): é "onde estou", não "precisa de você".
// ─────────────────────────────────────────────────────────────────

const TOM = {
  agora: { bg: 'var(--sel-bg)', cor: 'var(--sel-ink)', borda: 'var(--sel-line)' },
  feita: { bg: 'transparent', cor: 'var(--ink)', borda: 'transparent' },
  todo: { bg: 'transparent', cor: 'var(--mute)', borda: 'transparent' },
};

function Marcador({ etapa, ordem }: { etapa: EtapaDaTrilha; ordem: number }) {
  const tom = etapa.feita ? TOM_DA_ETAPA.feito : TOM_DA_ETAPA.pendente;
  return (
    <span
      aria-hidden
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        flex: 'none',
        width: 18,
        height: 18,
        borderRadius: 9,
        background: tom.bg,
        color: tom.cor,
        fontSize: 11,
        fontWeight: 700,
      }}
    >
      {etapa.feita ? <Icon name="check" /> : ordem}
    </span>
  );
}

export function TrilhaDeEtapas({ etapas }: { etapas: EtapaDaTrilha[] }) {
  if (etapas.length === 0) return null;

  return (
    <nav
      aria-label="Etapas da live"
      className="gl"
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${etapas.length}, minmax(112px, 1fr))`,
        gap: 4,
        flex: 'none',
        padding: '4px 12px',
        borderBottom: '1px solid var(--line)',
        overflowX: 'auto',
      }}
    >
      {etapas.map((e, i) => {
        const tom = TOM[e.agora ? 'agora' : e.feita ? 'feita' : 'todo'];
        return (
          <Link
            key={e.id}
            to={e.to}
            aria-current={e.agora ? 'step' : undefined}
            title={`${e.texto} · ${e.contagem}`}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 7,
              minWidth: 0,
              padding: '3px 8px',
              border: `1px solid ${tom.borda}`,
              borderRadius: 'var(--r1)',
              background: tom.bg,
              color: tom.cor,
              whiteSpace: 'nowrap',
            }}
          >
            <Marcador etapa={e} ordem={i + 1} />
            {/* Duas linhas, como na prancha: em uma só, "Revisão 3 de 9
                prontos" não cabia na casa a 1440 px e era cortado. */}
            <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0, lineHeight: 1.25 }}>
              <span style={{ fontSize: 12, fontWeight: e.agora ? 700 : 600 }}>{e.texto}</span>
              <span
                style={{
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  fontFamily: 'var(--mono)',
                  fontSize: 11,
                  color: 'var(--mute)',
                }}
              >
                {e.contagem}
              </span>
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
