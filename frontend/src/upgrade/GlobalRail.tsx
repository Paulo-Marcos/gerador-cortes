import { NavLink, useNavigate } from 'react-router-dom';
import type { Lugar } from './historicoDaCasca';
import { Icon } from './Icon';
import type { DestinoDeMenu, Grupo, TelaId } from './upgradeRoutes';

// ─────────────────────────────────────────────────────────────────
// D-599 · O trilho global.
//
// Três blocos, e a divisão não é arrumação: "Produção" é o que se faz
// com o acervo de lives, "Inteligência" é o que se pergunta a ele, e
// "Ferramentas" é a ferramenta. Quem entende essa separação acha
// qualquer tela sem ler rótulo.
//
// Recolhido ele vira 54 px de ícone puro — e por isso todo botão carrega
// `title`: no estado estreito, o title É o rótulo.
//
// RODADA 2 · duas correções estruturais:
//
//   1. A LISTA É FIXA. As cinco fases da live saíram daqui (viraram a
//      fita de `FitaDaLive`): o trilho não muda mais de tamanho conforme
//      a rota. "Biblioteca" acende em todas as telas de dentro de uma
//      live — é de lá que a live veio —, então nenhuma tela profunda
//      fica com o menu apagado.
//   2. O TRILHO ROLA. Tinha `overflow:hidden` e todo item em
//      `flex:'none'`: abaixo de ~640 px de altura os últimos itens
//      (inclusive Configurações) sumiam sem nenhuma pista. Agora o
//      cabeçalho e o pé ficam fixos e só a região dos itens rola.
// ─────────────────────────────────────────────────────────────────

export const TRILHO_LARGO = '212px';
export const TRILHO_ESTREITO = '54px';

export type FilaDoTrilho = {
  titulo: string;
  sub: string;
  /** 0–100; vira a fatia preenchida do anel cônico. */
  progresso: number;
  /** R4: só as vitrines usam a rota; na casca o cartão abre a gaveta. */
  to?: string;
  /** D-746: consultar a fila não é navegar — com isto o cartão abre a
   *  gaveta em vez de levar à rota. */
  onAbrir?: () => void;
};

type GlobalRailProps = {
  expandido: boolean;
  onAlternar: () => void;
  telaAtual: TelaId;
  menu: Record<Grupo, DestinoDeMenu[]>;
  fila?: FilaDoTrilho;
  /** `true` quando a rota atual É a Fila: o cartão é o item de navegação
   *  daquela tela e precisa parecer aceso, não parecer um link para onde
   *  a pessoa já está. */
  filaAtiva?: boolean;
  /** D-746: "Onde eu estava" — os lugares recentes, sem o atual. A posição
   *  na lista é o atalho (⌘1…⌘4). */
  lugares?: Lugar[];
};

function ItemBotao({
  item,
  ativo,
  mostrarTexto,
}: {
  item: DestinoDeMenu;
  ativo: boolean;
  mostrarTexto: boolean;
}) {
  return (
    <NavLink
      to={item.to}
      title={item.texto}
      aria-current={ativo ? 'page' : undefined}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 9,
        height: 32,
        padding: '0 7px',
        border: 0,
        borderRadius: 'var(--r2)',
        background: ativo ? 'var(--accent-soft)' : 'transparent',
        color: ativo ? 'var(--accent)' : 'var(--mute)',
        fontSize: 12.5,
        fontWeight: 600,
        textAlign: 'left',
        boxShadow: ativo ? 'var(--hi)' : 'none',
        flex: 'none',
      }}
    >
      <Icon name={item.icone} size={15} />
      {mostrarTexto ? (
        <span style={{ whiteSpace: 'nowrap', overflow: 'hidden' }}>{item.texto}</span>
      ) : null}
    </NavLink>
  );
}

export function GlobalRail({
  expandido,
  onAlternar,
  telaAtual,
  menu,
  fila,
  filaAtiva = false,
  lugares = [],
}: GlobalRailProps) {
  const navigate = useNavigate();
  const mostrarTexto = expandido;
  const aceso = (item: DestinoDeMenu) => item.telas.includes(telaAtual);

  return (
    <aside
      className="gl"
      style={{
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
        padding: '10px 8px',
        borderRight: '1px solid var(--line)',
        overflow: 'hidden',
      }}
    >
      {/* Recolhido, o cabeçalho vira duas linhas. Não é capricho: a 54 px
          o logo (26) e o botão (24) não cabem lado a lado, e o botão
          sumiria no overflow — deixando o trilho estreito sem nenhuma
          forma visível de voltar a abrir. */}
      <div
        style={{
          display: 'flex',
          flexDirection: expandido ? 'row' : 'column',
          alignItems: 'center',
          gap: expandido ? 8 : 4,
          padding: '0 3px 10px',
          flex: 'none',
        }}
      >
        <span
          style={{
            display: 'grid',
            placeItems: 'center',
            width: 26,
            height: 26,
            flex: 'none',
            borderRadius: 'var(--r2)',
            background: 'var(--accent)',
            color: 'var(--on-accent)',
          }}
        >
          <Icon name="scissors" size={13} stroke={2.4} />
        </span>
        {mostrarTexto ? (
          <span
            style={{
              fontWeight: 700,
              fontSize: 13,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
            }}
          >
            CutCut
          </span>
        ) : null}
        <button
          type="button"
          onClick={onAlternar}
          className="btn btn-icon"
          title={expandido ? 'Recolher o trilho · ⌘B' : 'Expandir o trilho · ⌘B'}
          aria-expanded={expandido}
          style={{
            marginLeft: expandido ? 'auto' : undefined,
            height: 24,
            width: 24,
            flex: 'none',
            border: 0,
            background: 'none',
            boxShadow: 'none',
            color: 'var(--dim)',
          }}
        >
          <Icon name="panel-left" size={14} />
        </button>
      </div>

      {/* Só esta região rola. Cabeçalho e pé (fila + ferramentas) ficam. */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 2,
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          overflowX: 'hidden',
        }}
      >
        {mostrarTexto ? (
          <span className="lbl" style={{ padding: '2px 4px 4px' }}>
            Produção
          </span>
        ) : null}
        {menu.producao.map((i) => (
          <ItemBotao key={i.to} item={i} ativo={aceso(i)} mostrarTexto={mostrarTexto} />
        ))}

        {mostrarTexto ? (
          <span className="lbl" style={{ padding: '12px 4px 4px' }}>
            Inteligência
          </span>
        ) : null}
        {menu.inteligencia.map((i) => (
          <ItemBotao key={i.to} item={i} ativo={aceso(i)} mostrarTexto={mostrarTexto} />
        ))}

        {/* D-746: o trabalho real é lateral (short → outro short → uma live
            → volta), e a trilha só sabia subir na hierarquia. Só com o trilho
            largo: recolhido, quatro ícones sem nome não diriam aonde levam. */}
        {mostrarTexto && lugares.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 1, flex: 'none' }}>
            <span
              className="lbl"
              // R4: sem `fontSize` — o piso de 10,5 px do `.lbl` manda.
              style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '10px 4px 4px' }}
            >
              <Icon name="history" size={11} />
              Onde eu estava
            </span>
            {lugares.slice(0, 4).map((l, i) => (
              <button
                key={l.to}
                type="button"
                onClick={() => navigate(l.to)}
                title={`${l.rotulo} · ${l.tipo} (⌘${i + 1})`}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 7,
                  height: 26,
                  padding: '0 6px',
                  border: 0,
                  borderRadius: 'var(--r2)',
                  background: 'transparent',
                  color: 'var(--mute)',
                  fontSize: 11.5,
                  textAlign: 'left',
                  cursor: 'pointer',
                }}
              >
                <Icon name={l.icone} size={12} style={{ flex: 'none' }} />
                <span
                  style={{
                    flex: 1,
                    minWidth: 0,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {l.rotulo}
                </span>
                <kbd style={{ flex: 'none' }}>⌘{i + 1}</kbd>
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {fila ? (
        <button
          type="button"
          onClick={() => (fila.onAbrir ? fila.onAbrir() : fila.to && navigate(fila.to))}
          className="card"
          title={
            fila.onAbrir
              ? `${fila.titulo} · ${fila.sub} — abrir a fila numa gaveta lateral, você não sai da tela (⌘J)`
              : `${fila.titulo} · ${fila.sub}`
          }
          aria-current={filaAtiva ? 'page' : undefined}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: 8,
            marginTop: 6,
            marginBottom: 6,
            cursor: 'pointer',
            textAlign: 'left',
            flex: 'none',
            borderColor: filaAtiva ? 'var(--accent)' : 'var(--line)',
            background: filaAtiva ? 'var(--accent-soft)' : undefined,
          }}
        >
          <span
            style={{
              width: 16,
              height: 16,
              flex: 'none',
              borderRadius: 99,
              // R4: progresso é estado, não ação — a gaveta já fala em --info.
              background: `conic-gradient(var(--info) ${fila.progresso}%,var(--inset) 0)`,
            }}
            aria-hidden
          />
          {mostrarTexto ? (
            <span style={{ minWidth: 0 }}>
              <span
                style={{
                  display: 'block',
                  fontSize: 11.5,
                  fontWeight: 600,
                  whiteSpace: 'nowrap',
                }}
              >
                {fila.titulo}
              </span>
              <span
                style={{
                  display: 'block',
                  fontSize: 11,
                  color: 'var(--mute)',
                  whiteSpace: 'nowrap',
                }}
              >
                {fila.sub}
              </span>
            </span>
          ) : null}
        </button>
      ) : null}

      {mostrarTexto ? (
        <span className="lbl" style={{ padding: '10px 4px 4px' }}>
          Ferramentas
        </span>
      ) : null}
      {menu.ferramentas.map((i) => (
        <ItemBotao key={i.to} item={i} ativo={aceso(i)} mostrarTexto={mostrarTexto} />
      ))}

    </aside>
  );
}
