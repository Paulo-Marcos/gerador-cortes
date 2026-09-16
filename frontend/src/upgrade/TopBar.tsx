import { useEffect, useRef, useState } from 'react';
import { Icon } from './Icon';
import type { ChromeSeletor } from './UpgradeChrome';

// ─────────────────────────────────────────────────────────────────
// D-599 · A barra superior.
//
// Ela responde três perguntas, nesta ordem de leitura: onde estou
// (trilha), em qual corte estou (seletor) e o app está bem (chip de
// estado salvo). O seletor no centro-direita é a peça que muda o
// ritmo do trabalho: trocar de corte deixa de ser "voltar à lista e
// escolher" e vira J/K sem tirar os olhos do player.
// ─────────────────────────────────────────────────────────────────

type TopBarProps = {
  trilha: string[];
  seletor?: ChromeSeletor;
  estado?: { texto: string; icone: 'circle-check' | 'loader' | 'triangle-alert'; cor: string; bg: string };
  tema: 'light' | 'dark';
  onAlternarTema: () => void;
  onAbrirBusca?: () => void;
  /** O sino leva à Fila: os avisos deste app SÃO os jobs — render, análise,
   *  upload. Uma caixa de notificações à parte duplicaria a mesma lista. */
  onAbrirAvisos?: () => void;
  /** Quantos jobs estão rodando agora — o ponto no sino. */
  avisosAtivos?: number;
};

function Trilha({ itens }: { itens: string[] }) {
  return (
    <nav
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        minWidth: 0,
        fontSize: 12.5,
        color: 'var(--mute)',
      }}
    >
      {itens.map((t, i) => {
        const ultimo = i === itens.length - 1;
        return (
          <span key={`${t}-${i}`} style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
            <span
              style={{
                fontWeight: ultimo ? 700 : 500,
                color: ultimo ? 'var(--ink)' : 'var(--mute)',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                maxWidth: 340,
              }}
            >
              {t}
            </span>
            {ultimo ? null : (
              <Icon name="chevron-right" size={12} style={{ color: 'var(--dim)' }} />
            )}
          </span>
        );
      })}
    </nav>
  );
}

function SeletorDeCorte({ seletor }: { seletor: ChromeSeletor }) {
  const [aberto, setAberto] = useState(false);
  const caixa = useRef<HTMLDivElement>(null);

  // Fecha ao clicar fora ou no Esc. Sem isso o painel ficaria aberto
  // por cima da tela enquanto a pessoa já trabalha noutro lugar.
  useEffect(() => {
    if (!aberto) return;
    const foraOuEsc = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent) {
        if (e.key === 'Escape') setAberto(false);
        return;
      }
      if (caixa.current && !caixa.current.contains(e.target as Node)) setAberto(false);
    };
    document.addEventListener('mousedown', foraOuEsc);
    document.addEventListener('keydown', foraOuEsc);
    return () => {
      document.removeEventListener('mousedown', foraOuEsc);
      document.removeEventListener('keydown', foraOuEsc);
    };
  }, [aberto]);

  return (
    <div
      ref={caixa}
      style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 3, flex: 'none' }}
    >
      <button
        type="button"
        className="btn btn-icon"
        title="Corte anterior · K"
        onClick={seletor.onAnterior}
        disabled={!seletor.onAnterior}
      >
        <Icon name="chevron-left" size={14} />
      </button>
      <button
        type="button"
        className="btn"
        onClick={() => setAberto((v) => !v)}
        style={{ borderColor: aberto ? 'var(--accent)' : 'var(--line)', minWidth: 190 }}
      >
        <Icon name="scissors" size={12} style={{ color: 'var(--accent)' }} />
        <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--mute)' }}>
          #{seletor.num}
        </span>
        <span
          style={{
            minWidth: 0,
            flex: 1,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            textAlign: 'left',
          }}
        >
          {seletor.titulo}
        </span>
        <Icon name="chevron-down" size={12} style={{ color: 'var(--dim)' }} />
      </button>
      <button
        type="button"
        className="btn btn-icon"
        title="Próximo corte · J"
        onClick={seletor.onProximo}
        disabled={!seletor.onProximo}
      >
        <Icon name="chevron-right" size={14} />
      </button>

      {aberto ? (
        <div
          className="card"
          style={{
            position: 'absolute',
            top: 38,
            right: 0,
            zIndex: 20,
            width: 360,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            boxShadow: '0 18px 44px rgb(0 0 0/.28)',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '9px 11px',
              borderBottom: '1px solid var(--line2)',
            }}
          >
            <span className="lbl">{seletor.listaTitulo}</span>
            <span style={{ flex: 1 }} />
            {seletor.listaResumo ? (
              <span style={{ fontFamily: 'var(--mono)', fontSize: 10.5, color: 'var(--mute)' }}>
                {seletor.listaResumo}
              </span>
            ) : null}
          </div>

          {seletor.filtros?.length ? (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, padding: '9px 11px' }}>
              {seletor.filtros.map((f) => (
                <button
                  key={f.texto}
                  type="button"
                  onClick={f.onClick}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 5,
                    height: 24,
                    padding: '0 8px',
                    border: `1px solid ${f.ativo ? 'var(--accent)' : 'var(--line)'}`,
                    borderRadius: 'var(--r1)',
                    background: f.ativo ? 'var(--accent-soft)' : 'var(--panel)',
                    color: f.ativo ? 'var(--accent2)' : 'var(--mute)',
                    fontSize: 11,
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  {f.texto}
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 10, opacity: 0.7 }}>{f.n}</span>
                </button>
              ))}
            </div>
          ) : null}

          <div style={{ maxHeight: 300, overflow: 'auto', padding: '0 7px 7px' }}>
            {seletor.itens.map((c) => (
              <button
                key={c.id}
                type="button"
                className="row"
                onClick={() => {
                  c.onClick?.();
                  setAberto(false);
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 9,
                  width: '100%',
                  padding: 7,
                  border: `1px solid ${c.ativo ? 'var(--accent)' : 'transparent'}`,
                  borderRadius: 'var(--r2)',
                  background: c.ativo ? 'var(--accent-soft)' : 'transparent',
                  cursor: 'pointer',
                  textAlign: 'left',
                  marginBottom: 2,
                }}
              >
                <span
                  style={{
                    position: 'relative',
                    width: 52,
                    height: 30,
                    flex: 'none',
                    borderRadius: 'var(--r1)',
                    overflow: 'hidden',
                    background:
                      'linear-gradient(135deg,oklch(0.55 0.05 250),oklch(0.28 0.04 250))',
                  }}
                >
                  <span
                    style={{
                      position: 'absolute',
                      bottom: 1,
                      right: 2,
                      fontFamily: 'var(--mono)',
                      fontSize: 8.5,
                      color: '#fff',
                    }}
                  >
                    {c.dur}
                  </span>
                </span>
                <span style={{ minWidth: 0, flex: 1 }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontFamily: 'var(--mono)', fontSize: 10.5, color: 'var(--dim)' }}>
                      #{c.num}
                    </span>
                    <span
                      style={{
                        minWidth: 0,
                        fontSize: 12,
                        fontWeight: 600,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {c.titulo}
                    </span>
                    {c.fire ? (
                      <span style={{ color: 'var(--accent)' }}>
                        <Icon name="flame" size={11} />
                      </span>
                    ) : null}
                  </span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 2 }}>
                    <span
                      className="chip"
                      style={{ height: 18, background: c.statusBg, color: c.statusCor }}
                    >
                      {c.status}
                    </span>
                    {c.inicio ? (
                      <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--dim)' }}>
                        {c.inicio} → {c.fim}
                      </span>
                    ) : null}
                  </span>
                </span>
                <Icon name="chevron-right" size={13} style={{ color: 'var(--dim)' }} />
              </button>
            ))}
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '9px 11px',
              borderTop: '1px solid var(--line2)',
            }}
          >
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                fontSize: 11,
                color: 'var(--mute)',
              }}
            >
              <kbd>J</kbd>
              <kbd>K</kbd>
              trocar de corte
            </span>
            <div style={{ flex: 1 }} />
            {seletor.onVerTodos ? (
              <button
                type="button"
                className="btn"
                style={{ height: 26 }}
                onClick={() => {
                  seletor.onVerTodos?.();
                  setAberto(false);
                }}
              >
                <Icon name="layout-grid" size={12} />
                Ver todos
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function TopBar({
  trilha,
  seletor,
  estado,
  tema,
  onAlternarTema,
  onAbrirBusca,
  onAbrirAvisos,
  avisosAtivos = 0,
}: TopBarProps) {
  return (
    <header
      className="gl"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        flex: 'none',
        height: 44,
        padding: '0 12px',
        borderBottom: '1px solid var(--line)',
      }}
    >
      <Trilha itens={trilha} />
      <div style={{ flex: 1 }} />

      {seletor ? <SeletorDeCorte seletor={seletor} /> : null}

      <button
        type="button"
        className="fld"
        onClick={onAbrirBusca}
        style={{
          width: 240,
          color: 'var(--dim)',
          background: 'var(--panel)',
          backdropFilter: 'var(--glass)',
          cursor: 'pointer',
          textAlign: 'left',
        }}
      >
        <Icon name="command" size={12} />
        Buscar live, corte, ação…
        <span style={{ flex: 1 }} />
        <kbd>⌘K</kbd>
      </button>

      {estado ? (
        <span className="chip" style={{ background: estado.bg, color: estado.cor }}>
          <Icon name={estado.icone} size={12} />
          {estado.texto}
        </span>
      ) : null}

      <button
        type="button"
        className="btn btn-icon"
        title={avisosAtivos > 0 ? `${avisosAtivos} job(s) rodando — abrir a fila` : 'Abrir a fila'}
        onClick={onAbrirAvisos}
        style={{ position: 'relative' }}
      >
        <Icon name="bell" size={14} />
        {avisosAtivos > 0 ? (
          <span
            aria-hidden
            style={{
              position: 'absolute',
              top: 5,
              right: 5,
              width: 7,
              height: 7,
              borderRadius: 99,
              background: 'var(--accent)',
            }}
          />
        ) : null}
      </button>
      <button
        type="button"
        className="btn btn-icon"
        onClick={onAlternarTema}
        title={tema === 'dark' ? 'Tema claro' : 'Tema escuro'}
      >
        <Icon name={tema === 'dark' ? 'sun' : 'moon'} size={14} />
      </button>
    </header>
  );
}
