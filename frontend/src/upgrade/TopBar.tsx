import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  CabecalhoDeLista,
  FiltrosDaLista,
  IdentidadeDaLive,
  LinhaDeLista,
} from './ContextColumn';
import { Icon } from './Icon';
import { BUSCA_LARGA_MIN_PX, useJanelaMin } from './medidas';
import { AcoesDaTela, type ScreenAction } from './ScreenHeader';
import type { ChromeAtual, ChromeEstado, ChromeLista } from './UpgradeChrome';
import type { Migalha } from './upgradeRoutes';
import {
  AMOSTRA,
  LUMINANCIA,
  NOME_DO_TEMA,
  RAMPA,
  temaEscuro,
  type UpgradeTheme,
} from './useUpgradeTheme';

// ─────────────────────────────────────────────────────────────────
// D-599 · A barra superior.
//
// Ela responde três perguntas, nesta ordem de leitura: onde estou
// (trilha), em qual item estou (seletor) e o app está bem (chip de
// estado). O seletor é a peça que muda o ritmo do trabalho: trocar de
// corte deixa de ser "voltar à lista e escolher" e vira J/K sem tirar os
// olhos do player.
//
// RODADA 2 · três mudanças:
//
//   1. ORDEM DE PRIORIDADE. Seis elementos disputavam 44 px de linha, e
//      a busca ocupava 240 px fixos enquanto a trilha se reduzia a "…" —
//      a informação mais barata empurrando a mais cara. Abaixo de
//      1200 px a busca vira só o ícone e o chip de estado perde o texto.
//   2. CABEÇALHO FUNDIDO. Em tela densa o subtítulo e as ações da tela
//      entram aqui, e a faixa do `ScreenHeader` não é montada: ~46 px
//      devolvidos ao player, sem perder informação (o título repetia a
//      última migalha).
//   3. UMA LISTA. O painel recebe a MESMA `lista` que a coluna receberia
//      — não há mais dois formatos de item para a mesma tela. O lembrete
//      de J/K saiu do pé do painel: a `ActionBar` o emite sempre que há
//      seletor, e tê-lo nos dois lugares era escrevê-lo três vezes.
// ─────────────────────────────────────────────────────────────────

type TopBarProps = {
  trilha: Migalha[];
  atual?: ChromeAtual;
  /** `true` quando a coluna de contexto está na tela: o seletor vira só
   *  navegação, sem painel. */
  seletorCompacto?: boolean;
  /** A lista quando ela NÃO está na coluna — vai para o painel, que passa
   *  a ser o único lugar que a tem. */
  listaNoPainel?: ChromeLista;
  estado?: ChromeEstado;
  /** Cabeçalho de tela fundido (telas densas). */
  cabecalho?: { sub?: string; acoes?: ScreenAction[] };
  tema: UpgradeTheme;
  onAlternarTema: () => void;
  /** Escolhe um degrau da rampa. Sem ele, a rampa não aparece. */
  onEscolherTema?: (t: UpgradeTheme) => void;
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
              // block: num <Link> inline, maxWidth e overflow não valiam e
              // a migalha longa vazava por cima da vizinha.
              display: 'block',
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
                style={{ display: 'flex', minWidth: 0, color: 'var(--mute)' }}
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

function Seletor({
  atual,
  compacto,
  lista,
}: {
  atual: ChromeAtual;
  compacto: boolean;
  lista?: ChromeLista;
}) {
  const [aberto, setAberto] = useState(false);
  const caixa = useRef<HTMLDivElement>(null);

  // Fecha ao clicar fora ou no Esc. Sem isso o painel ficaria aberto por
  // cima da tela enquanto a pessoa já trabalha noutro lugar.
  useEffect(() => {
    if (!aberto) return;
    const foraOuEsc = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent) {
        if (e.key === 'Escape') {
          // O Esc é NOSSO enquanto o painel está aberto: sem parar aqui ele
          // segue para os listeners de documento e fecha também o que
          // estiver atrás.
          e.stopPropagation();
          setAberto(false);
        }
        return;
      }
      if (caixa.current && !caixa.current.contains(e.target as Node)) setAberto(false);
    };
    document.addEventListener('mousedown', foraOuEsc);
    document.addEventListener('keydown', foraOuEsc, true);
    return () => {
      document.removeEventListener('mousedown', foraOuEsc);
      document.removeEventListener('keydown', foraOuEsc, true);
    };
  }, [aberto]);

  // Compacto nunca abre painel: a lista já está na coluna, à esquerda.
  useEffect(() => {
    if (compacto) setAberto(false);
  }, [compacto]);

  const rotulo = (
    <>
      <Icon name="scissors" size={12} style={{ color: 'var(--accent)' }} />
      {atual.num ? (
        <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--mute)' }}>
          #{atual.num}
        </span>
      ) : null}
      <span
        style={{
          minWidth: 0,
          flex: 1,
          fontSize: 12,
          fontWeight: 600,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          textAlign: 'left',
        }}
      >
        {atual.titulo}
      </span>
    </>
  );

  return (
    <div
      ref={caixa}
      style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 3, flex: 'none' }}
    >
      <button
        type="button"
        className="btn btn-icon"
        title="Item anterior · K"
        aria-label="Item anterior"
        aria-keyshortcuts="K"
        onClick={atual.onAnterior}
        disabled={!atual.onAnterior}
      >
        <Icon name="chevron-left" size={14} />
      </button>

      {compacto ? (
        <span
          title={atual.num ? `#${atual.num} · ${atual.titulo}` : atual.titulo}
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
          {rotulo}
        </span>
      ) : (
        <button
          type="button"
          className="btn"
          onClick={() => setAberto((v) => !v)}
          aria-expanded={aberto}
          aria-haspopup="true"
          style={{ borderColor: aberto ? 'var(--accent)' : 'var(--line)', minWidth: 190 }}
        >
          {rotulo}
          <Icon name="chevron-down" size={12} style={{ color: 'var(--dim)' }} />
        </button>
      )}

      <button
        type="button"
        className="btn btn-icon"
        title="Próximo item · J"
        aria-label="Próximo item"
        aria-keyshortcuts="J"
        onClick={atual.onProximo}
        disabled={!atual.onProximo}
      >
        <Icon name="chevron-right" size={14} />
      </button>

      {aberto && !compacto && lista ? (
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
            // fundo de um elemento aninhado em outro com backdrop-filter: o
            // vidro virava só transparência, com o conteúdo da tela legível
            // através da lista de cortes.
            background: 'var(--solid)',
            backdropFilter: 'none',
            WebkitBackdropFilter: 'none',
            boxShadow: '0 18px 44px rgb(0 0 0/.28)',
          }}
        >
          {/* Nesta largura de janela este é o ÚNICO lugar onde a identidade
              do conjunto existe — a coluna não está montada. */}
          {lista.cabecalho ? (
            <div style={{ padding: 11, borderBottom: '1px solid var(--line2)' }}>
              <IdentidadeDaLive
                titulo={lista.cabecalho.titulo}
                sub={lista.cabecalho.sub}
                thumb={lista.cabecalho.thumb}
              />
            </div>
          ) : null}

          <CabecalhoDeLista titulo={lista.titulo} resumo={lista.resumo} padding="9px 11px" />

          {lista.filtros?.length ? <FiltrosDaLista filtros={lista.filtros} /> : null}

          {/* A linha do painel é a MESMA da coluna de contexto — um
              componente, dois lugares que nunca aparecem juntos. */}
          <div style={{ maxHeight: 300, overflow: 'auto', padding: '0 7px 7px' }}>
            {lista.itens.map((item) => (
              <LinhaDeLista
                key={item.id}
                item={{
                  ...item,
                  onClick: () => {
                    item.onClick?.();
                    setAberto(false);
                  },
                }}
              />
            ))}
          </div>

          {atual.onVerTodos ? (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '9px 11px',
                borderTop: '1px solid var(--line2)',
              }}
            >
              <div style={{ flex: 1 }} />
              <button
                type="button"
                className="btn"
                style={{ height: 26 }}
                onClick={() => {
                  atual.onVerTodos?.();
                  setAberto(false);
                }}
              >
                <Icon name="layout-grid" size={12} />
                Ver todos
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/** D-746: os cinco degraus, do claro ao escuro. A ordem é a informação —
 *  por isso amostras de cor, não nomes: o operador vê onde está na rampa. */
function RampaDeTemas({
  tema,
  onEscolher,
}: {
  tema: UpgradeTheme;
  onEscolher: (t: UpgradeTheme) => void;
}) {
  return (
    <div
      role="group"
      aria-label="Tema"
      style={{
        display: 'flex',
        gap: 2,
        padding: 3,
        flex: 'none',
        border: '1px solid var(--line)',
        borderRadius: 'var(--r2)',
        background: 'var(--inset)',
      }}
    >
      {RAMPA.map((t) => {
        const ativo = t === tema;
        return (
          <button
            key={t}
            type="button"
            aria-pressed={ativo}
            aria-label={NOME_DO_TEMA[t]}
            title={`${NOME_DO_TEMA[t]} · ${LUMINANCIA[t]}`}
            onClick={() => onEscolher(t)}
            style={{
              width: 16,
              height: 20,
              padding: 0,
              borderRadius: 2,
              cursor: 'pointer',
              background: AMOSTRA[t],
              border: `1px solid ${ativo ? 'var(--accent)' : 'var(--line)'}`,
              boxShadow: ativo ? '0 0 0 1px var(--accent)' : 'none',
            }}
          />
        );
      })}
    </div>
  );
}

export function TopBar({
  trilha,
  atual,
  seletorCompacto = false,
  listaNoPainel,
  estado,
  cabecalho,
  tema,
  onAlternarTema,
  onEscolherTema,
  onAbrirBusca,
  onAbrirAvisos,
  avisosAtivos = 0,
}: TopBarProps) {
  const cabeBusca = useJanelaMin(BUSCA_LARGA_MIN_PX);
  // Com o cabeçalho fundido, as ações da tela também disputam a linha: a
  // busca cede primeiro, porque tem atalho (⌘K) e a ação da tela não.
  const buscaLarga = cabeBusca && !cabecalho?.acoes?.length;

  return (
    <header
      className="gl"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        flex: 'none',
        minHeight: 44,
        padding: '0 12px',
        borderBottom: '1px solid var(--line)',
        overflow: 'hidden',
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

      {/* O subtítulo da tela densa: mesma linha, tom de instrumento. */}
      {cabecalho?.sub && cabeBusca ? (
        <span
          style={{
            minWidth: 0,
            paddingLeft: 4,
            fontSize: 11.5,
            color: 'var(--mute)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {cabecalho.sub}
        </span>
      ) : null}

      <div style={{ flex: 1, minWidth: 8 }} />

      {atual ? (
        <Seletor atual={atual} compacto={seletorCompacto} lista={listaNoPainel} />
      ) : null}

      {cabecalho?.acoes?.length ? <AcoesDaTela acoes={cabecalho.acoes} /> : null}

      {buscaLarga ? (
        <button
          type="button"
          className="fld campo"
          onClick={onAbrirBusca}
          style={{
            width: 240,
            flex: 'none',
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
      ) : (
        <button
          type="button"
          className="btn btn-icon"
          title="Buscar live, tela ou ação · ⌘K"
          aria-label="Buscar live, tela ou ação"
          aria-keyshortcuts="Meta+K"
          onClick={onAbrirBusca}
        >
          <Icon name="search" size={14} />
        </button>
      )}

      {estado ? (
        <span
          className="chip"
          title={estado.texto}
          style={{ background: estado.bg, color: estado.cor, flex: 'none' }}
        >
          <Icon name={estado.icone} size={12} />
          {buscaLarga ? estado.texto : null}
        </span>
      ) : null}

      <button
        type="button"
        className="btn btn-icon"
        title={avisosAtivos > 0 ? `${avisosAtivos} job(s) rodando — abrir a fila` : 'Abrir a fila'}
        aria-label="Abrir a fila"
        onClick={onAbrirAvisos}
        style={{ position: 'relative', flex: 'none' }}
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
      {onEscolherTema ? <RampaDeTemas tema={tema} onEscolher={onEscolherTema} /> : null}
      <button
        type="button"
        className="btn btn-icon"
        onClick={onAlternarTema}
        title={temaEscuro(tema) ? 'Tema claro' : 'Tema escuro'}
        aria-label={temaEscuro(tema) ? 'Tema claro' : 'Tema escuro'}
        style={{ flex: 'none' }}
      >
        <Icon name={temaEscuro(tema) ? 'sun' : 'moon'} size={14} />
      </button>
    </header>
  );
}
