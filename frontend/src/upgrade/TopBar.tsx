import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { EtapasEmLinha, IdentidadeDaLive, LinhaDeContexto } from './ContextColumn';
import { Icon } from './Icon';
import type { ChromeContexto, ChromeSeletor } from './UpgradeChrome';
import type { Migalha } from './upgradeRoutes';

// ─────────────────────────────────────────────────────────────────
// D-599 · A barra superior.
//
// Ela responde três perguntas, nesta ordem de leitura: onde estou
// (trilha), em qual corte estou (seletor) e o app está bem (chip de
// estado salvo). O seletor no centro-direita é a peça que muda o
// ritmo do trabalho: trocar de corte deixa de ser "voltar à lista e
// escolher" e vira J/K sem tirar os olhos do player.
//
// RODADA 1 · duas correções de organização:
//
// 1. A trilha voltou a ser navegação. Era um `<span>` por migalha, o
//    que prometia "como cheguei aqui" e não deixava voltar: de um
//    corte não havia caminho para a live a não ser pelo trilho.
//
// 2. O seletor tem dois tamanhos, e a casca escolhe. Com a coluna de
//    contexto visível ele encolhe para `‹ #7 ›` — a MESMA lista em dois
//    lugares ao mesmo tempo era a "sidebar dupla" que o handoff tinha
//    recusado, reintroduzida como painel. Sem a coluna (janela abaixo
//    de 1240 px) ele assume o painel inteiro e recebe, no topo, a
//    identidade da live e a esteira que a coluna levava embora.
// ─────────────────────────────────────────────────────────────────

type TopBarProps = {
  trilha: Migalha[];
  seletor?: ChromeSeletor;
  /** `true` quando a coluna de contexto está na tela: o seletor vira
   *  só navegação, sem painel. */
  seletorCompacto?: boolean;
  /** O contexto quando ele NÃO está na coluna — vai para o topo do
   *  painel do seletor, que passa a ser o único lugar que o tem. */
  contextoNoPainel?: ChromeContexto;
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

function Trilha({ itens }: { itens: Migalha[] }) {
  return (
    <nav
      aria-label="Trilha"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        minWidth: 0,
        fontSize: 12.5,
        color: 'var(--mute)',
      }}
    >
      {itens.map((m, i) => {
        const ultimo = i === itens.length - 1;
        const rotulo = (
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
            {m.texto}
          </span>
        );
        return (
          <span
            key={`${m.texto}-${i}`}
            style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}
          >
            {m.to && !ultimo ? (
              <Link
                to={m.to}
                title={`Voltar para ${m.texto}`}
                style={{ minWidth: 0, color: 'var(--mute)' }}
              >
                {rotulo}
              </Link>
            ) : (
              rotulo
            )}
            {ultimo ? null : (
              <Icon name="chevron-right" size={12} style={{ color: 'var(--dim)' }} />
            )}
          </span>
        );
      })}
    </nav>
  );
}

function SeletorDeCorte({
  seletor,
  compacto,
  contexto,
}: {
  seletor: ChromeSeletor;
  compacto: boolean;
  contexto?: ChromeContexto;
}) {
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

  // Compacto nunca abre painel: a lista já está na coluna, à esquerda.
  useEffect(() => {
    if (compacto) setAberto(false);
  }, [compacto]);

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

      {compacto ? (
        <span
          title={`#${seletor.num} · ${seletor.titulo}`}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            height: 30,
            padding: '0 10px',
            border: '1px solid var(--line)',
            borderRadius: 'var(--r2)',
            background: 'var(--inset)',
            maxWidth: 240,
          }}
        >
          <Icon name="scissors" size={12} style={{ color: 'var(--accent)' }} />
          <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--mute)' }}>
            #{seletor.num}
          </span>
          <span
            style={{
              minWidth: 0,
              fontSize: 12,
              fontWeight: 600,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {seletor.titulo}
          </span>
        </span>
      ) : (
        <button
          type="button"
          className="btn"
          onClick={() => setAberto((v) => !v)}
          aria-expanded={aberto}
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
      )}

      <button
        type="button"
        className="btn btn-icon"
        title="Próximo corte · J"
        onClick={seletor.onProximo}
        disabled={!seletor.onProximo}
      >
        <Icon name="chevron-right" size={14} />
      </button>

      {aberto && !compacto ? (
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
            // Superfície SÓLIDA, não o vidro do `.card`. O painel mora dentro
            // do <header>, que já tem backdrop-filter, e o Chrome não desfoca o
            // fundo de um elemento aninhado em outro com backdrop-filter: o vidro
            // virava só transparência, com o conteúdo da tela legível através da
            // lista de cortes.
            background: 'var(--solid)',
            backdropFilter: 'none',
            WebkitBackdropFilter: 'none',
            boxShadow: '0 18px 44px rgb(0 0 0/.28)',
          }}
        >
          {/* O que a coluna de contexto mostraria se houvesse largura para
              ela. Aqui não é repetição: é o único lugar onde a identidade
              da live e a esteira existem nesta largura de janela. */}
          {contexto ? (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
                padding: 11,
                borderBottom: '1px solid var(--line2)',
              }}
            >
              <IdentidadeDaLive
                titulo={contexto.titulo}
                sub={contexto.sub}
                thumb={contexto.thumb}
              />
              {contexto.etapas?.length ? <EtapasEmLinha etapas={contexto.etapas} /> : null}
            </div>
          ) : null}

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
                  aria-pressed={f.ativo}
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

          {/* A lista do painel é a MESMA linha da coluna de contexto — um
              componente, dois lugares que nunca aparecem juntos. */}
          <div style={{ maxHeight: 300, overflow: 'auto', padding: '0 7px 7px' }}>
            {seletor.itens.map((c) => (
              <LinhaDeContexto
                key={c.id}
                item={{
                  id: c.id,
                  titulo: c.titulo,
                  legenda: c.inicio ? `#${c.num} · ${c.inicio} → ${c.fim ?? ''}` : `#${c.num}`,
                  dur: c.dur,
                  thumb: c.thumb,
                  dot: c.statusCor,
                  ativo: c.ativo,
                  onClick: () => {
                    c.onClick?.();
                    setAberto(false);
                  },
                }}
              />
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
  seletorCompacto = false,
  contextoNoPainel,
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
        // O backdrop-filter do `.gl` cria um contexto de empilhamento: o
        // z-index do painel do seletor fica preso AQUI dentro. Sem subir o
        // cabeçalho inteiro de camada, os cartões de vidro do miolo — que vêm
        // depois no DOM e criam seus próprios contextos — eram pintados por
        // cima da lista de cortes aberta.
        position: 'relative',
        zIndex: 30,
      }}
    >
      <Trilha itens={trilha} />
      <div style={{ flex: 1 }} />

      {seletor ? (
        <SeletorDeCorte
          seletor={seletor}
          compacto={seletorCompacto}
          contexto={contextoNoPainel}
        />
      ) : null}

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
        Buscar live, tela ou ação…
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
