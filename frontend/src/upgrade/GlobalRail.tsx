import { NavLink, useNavigate } from 'react-router-dom';
import { Icon, type IconName } from './Icon';
import type { TelaId } from './upgradeRoutes';

// ─────────────────────────────────────────────────────────────────
// D-599 · O trilho global.
//
// Três blocos, e a divisão não é arrumação: "Produção" é o que se faz
// com uma live específica (a esteira), "Inteligência" é o que se
// pergunta ao acervo inteiro, e o rodapé é a ferramenta. Quem entende
// essa separação acha qualquer tela sem ler rótulo.
//
// Recolhido ele vira 54 px de ícone puro — e por isso todo botão
// carrega `title`: no estado estreito, o title É o rótulo.
//
// RODADA 1 · cada item guarda AS TELAS que ele representa, não uma.
// Antes, curar um Fire (`fire`), despachar a prateleira
// (`prateleira`), a Fila, o kit e o 404 não acendiam nada: o trilho
// inteiro ficava apagado justamente nas telas mais profundas do app,
// onde "onde estou" é a pergunta mais cara.
// ─────────────────────────────────────────────────────────────────

export const TRILHO_LARGO = '212px';
export const TRILHO_ESTREITO = '54px';

export type FilaDoTrilho = {
  titulo: string;
  sub: string;
  /** 0–100; vira a fatia preenchida do anel cônico. */
  progresso: number;
  to: string;
};

export type ItemTrilho = {
  icone: IconName;
  texto: string;
  to: string;
  /** Todas as telas em que este item é o lugar onde a pessoa está —
   *  a primeira é a canônica. Telas-filhas entram aqui, e não em itens
   *  próprios: "Curar o Fire #7" não é um destino do menu, é um lugar
   *  DENTRO de Shorts. */
  telas: TelaId[];
  badge?: string;
};

type GlobalRailProps = {
  expandido: boolean;
  onAlternar: () => void;
  telaAtual: TelaId;
  producao: ItemTrilho[];
  inteligencia: ItemTrilho[];
  rodape: ItemTrilho[];
  fila?: FilaDoTrilho;
};

function ItemBotao({
  item,
  ativo,
  mostrarTexto,
}: {
  item: ItemTrilho;
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
      {item.badge && mostrarTexto ? (
        <span
          style={{
            marginLeft: 'auto',
            fontFamily: 'var(--mono)',
            fontSize: 10,
            padding: '0 5px',
            borderRadius: 'var(--r1)',
            background: ativo ? 'var(--accent)' : 'var(--inset)',
            color: ativo ? 'var(--on-accent)' : 'var(--mute)',
          }}
        >
          {item.badge}
        </span>
      ) : null}
    </NavLink>
  );
}

export function GlobalRail({
  expandido,
  onAlternar,
  telaAtual,
  producao,
  inteligencia,
  rodape,
  fila,
}: GlobalRailProps) {
  const navigate = useNavigate();
  const mostrarTexto = expandido;
  const aceso = (item: ItemTrilho) => item.telas.includes(telaAtual);

  return (
    <aside
      className="gl"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
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
            CortadorLive
          </span>
        ) : null}
        <button
          type="button"
          onClick={onAlternar}
          className="btn btn-icon"
          title={expandido ? 'Recolher o trilho · ⌘B' : 'Expandir o trilho · ⌘B'}
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

      {mostrarTexto ? (
        <span className="lbl" style={{ padding: '2px 4px 4px' }}>
          Produção
        </span>
      ) : null}
      {producao.map((i) => (
        <ItemBotao key={i.to} item={i} ativo={aceso(i)} mostrarTexto={mostrarTexto} />
      ))}

      {mostrarTexto ? (
        <span className="lbl" style={{ padding: '12px 4px 4px' }}>
          Inteligência
        </span>
      ) : null}
      {inteligencia.map((i) => (
        <ItemBotao key={i.to} item={i} ativo={aceso(i)} mostrarTexto={mostrarTexto} />
      ))}

      <div style={{ flex: 1 }} />

      {fila ? (
        <button
          type="button"
          onClick={() => navigate(fila.to)}
          className="card"
          title={`${fila.titulo} · ${fila.sub}`}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: 8,
            marginBottom: 6,
            cursor: 'pointer',
            textAlign: 'left',
            flex: 'none',
          }}
        >
          <span
            style={{
              width: 16,
              height: 16,
              flex: 'none',
              borderRadius: 99,
              background: `conic-gradient(var(--accent) ${fila.progresso}%,var(--inset) 0)`,
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
                  fontSize: 10.5,
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
      {rodape.map((i) => (
        <ItemBotao key={i.to} item={i} ativo={aceso(i)} mostrarTexto={mostrarTexto} />
      ))}
    </aside>
  );
}
