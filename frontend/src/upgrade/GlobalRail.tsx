import type { CSSProperties, ReactNode } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { AvisoDeSincronia } from './AvisoDeSincronia';
import { Icon } from './Icon';
import type { DestinoDeMenu, Grupo, TelaId } from './upgradeRoutes';
import type { Sincronia } from './useSincronia';

// ─────────────────────────────────────────────────────────────────
// D-599 · O trilho global.
//
// Os blocos não são arrumação: "Produção" é o que se faz com o acervo de lives,
// "Inteligência" é o que se pergunta a ele, e o pé é a ferramenta. Quem entende
// essa separação acha qualquer tela sem ler rótulo. A lista é fixa (as fases da
// live moram na `TrilhaDeEtapas`) e só a região dos itens rola.
//
// D-1137 (E-069 H-13; DIRECAO §7.0): o trilho é vidro, flutua a 12 px da janela
// e tem duas larguras — 244 px aberto, fora de uma live, e 64 px recolhido,
// dentro dela. No topo, a ficha do canal (que abre a troca de canal); depois
// "Produção" (com a Fila de render, que abre a gaveta) e "Inteligência"; no pé,
// as ferramentas e a marca. O item atual ganha o ladrilho em íris. Recolhido,
// todo item carrega `title`: no estado estreito, o title É o rótulo. "Onde eu
// estava" saiu do trilho (DIRECAO §6): o ⌘1…⌘4 e a busca continuam com ele.
// ─────────────────────────────────────────────────────────────────

export const TRILHO_LARGO = '244px';
export const TRILHO_ESTREITO = '64px';

export type FilaDoTrilho = {
  titulo: string;
  sub: string;
  /** 0–100; vira a fatia preenchida do anel cônico. */
  progresso: number;
  /** R4: só as vitrines usam a rota; na casca o cartão abre a gaveta. */
  to?: string;
  /** D-746: consultar a fila não é navegar — com isto o item abre a gaveta em
   *  vez de levar à rota. */
  onAbrir?: () => void;
};

export type GlobalRailProps = {
  expandido: boolean;
  onAlternar: () => void;
  telaAtual: TelaId;
  menu: Record<Grupo, DestinoDeMenu[]>;
  fila?: FilaDoTrilho;
  /** `true` quando a rota atual É a Fila: o item é o "onde estou" dela. */
  filaAtiva?: boolean;
  /** D-746: algum job falhou ou se perdeu — um ponto de erro no item da fila, para
   *  a gaveta fechada não esconder a falha. */
  filaComErro?: boolean;
  /** D-922: um ponto no item, com o motivo no `title` (ex.: novidades não vistas). */
  avisos?: Partial<Record<TelaId, string>>;
  /** A ficha do canal (`FichaDoCanal`). O trilho não busca dado nenhum: a casca a monta. */
  ficha?: ReactNode;
  /** D-1160: o aviso de sincronização no pé. Ausente, o pé não o desenha (as vitrines). */
  sincronia?: Sincronia;
};

const FOCO = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-foco';

/** A linha de um item: ladrilho do ícone + rótulo. Recolhido, só o ladrilho. */
function classesDoItem(ativo: boolean, expandido: boolean) {
  return cn(
    'relative flex flex-none items-center border font-semibold transition-colors duration-150 motion-reduce:transition-none',
    expandido ? 'h-[38px] w-full gap-2.5 rounded-campo pl-1.5 pr-2.5 text-corpo' : 'size-11 justify-center self-center rounded-[14px]',
    ativo ? 'border-fio bg-vidro-2 text-fg shadow-topo' : 'border-transparent text-fg-2 hover:bg-vidro-2 hover:text-fg',
    FOCO,
  );
}

function Ladrilho({ ativo, expandido, children }: { ativo: boolean; expandido: boolean; children: ReactNode }) {
  return (
    <span
      className={cn(
        'inline-grid flex-none place-items-center',
        expandido ? 'size-7 rounded-ladrilho' : 'size-8 rounded-[10px]',
        ativo ? 'bg-iris text-sobre-iris shadow-[0_6px_16px_-6px_var(--cc-iris)]' : 'text-fg-3',
      )}
    >
      {children}
    </span>
  );
}

/** O ponto de aviso: no fim da linha, ou no canto do ladrilho com o trilho recolhido. */
function Ponto({ rotulo, erro, expandido }: { rotulo?: string; erro?: boolean; expandido: boolean }) {
  return (
    <span
      data-aviso
      aria-label={rotulo}
      className={cn('size-[7px] flex-none rounded-full', erro ? 'bg-erro' : 'bg-iris', expandido ? 'ml-auto' : 'absolute right-1.5 top-1.5')}
    />
  );
}

function ItemDoTrilho({ item, ativo, expandido, aviso }: { item: DestinoDeMenu; ativo: boolean; expandido: boolean; aviso?: string }) {
  return (
    <NavLink
      to={item.to}
      title={aviso ? `${item.texto} · ${aviso}` : item.texto}
      aria-current={ativo ? 'page' : undefined}
      className={classesDoItem(ativo, expandido)}
    >
      <Ladrilho ativo={ativo} expandido={expandido}>
        <Icon name={item.icone} size={16} />
      </Ladrilho>
      {expandido ? <span className="truncate">{item.texto}</span> : null}
      {aviso ? <Ponto rotulo={aviso} expandido={expandido} /> : null}
    </NavLink>
  );
}

/** A Fila de render: consultar a fila não é navegar, então o item abre a gaveta (⌘J). */
function ItemDaFila({ fila, ativa, erro, expandido }: { fila: FilaDoTrilho; ativa: boolean; erro: boolean; expandido: boolean }) {
  const navigate = useNavigate();
  const anel = { '--p': `${fila.progresso}%` } as CSSProperties;
  return (
    <button
      type="button"
      onClick={() => (fila.onAbrir ? fila.onAbrir() : fila.to && navigate(fila.to))}
      title={
        fila.onAbrir
          ? `${fila.titulo} · ${fila.sub} — abrir a fila numa gaveta lateral, você não sai da tela (⌘J)`
          : `${fila.titulo} · ${fila.sub}`
      }
      aria-label={expandido ? undefined : `Fila de render: ${fila.titulo}`}
      aria-current={ativa ? 'page' : undefined}
      className={cn(classesDoItem(ativa, expandido), 'text-left')}
    >
      <Ladrilho ativo={ativa} expandido={expandido}>
        {/* R4: progresso é estado, não ação — a gaveta já fala em info. */}
        <span aria-hidden style={anel} className="size-4 rounded-full bg-[conic-gradient(var(--cc-info)_var(--p),var(--cc-poco)_0)]" />
      </Ladrilho>
      {expandido ? (
        <span className="min-w-0 flex-1">
          <span className="block truncate">Fila de render</span>
          <span className="block truncate text-micro font-medium text-fg-3">{fila.sub}</span>
        </span>
      ) : null}
      {erro ? <Ponto rotulo="Um job falhou" erro expandido={expandido} /> : null}
    </button>
  );
}

function Bloco({ titulo, itens, props }: { titulo?: string; itens: DestinoDeMenu[]; props: GlobalRailProps }) {
  return (
    <>
      {titulo && props.expandido ? <span className="px-2.5 pb-1.5 pt-3.5 text-micro text-fg-3">{titulo}</span> : null}
      {itens.map((i) => (
        <ItemDoTrilho key={i.to} item={i} ativo={i.telas.includes(props.telaAtual)} expandido={props.expandido} aviso={props.avisos?.[i.id]} />
      ))}
    </>
  );
}

function Marca({ expandido }: { expandido: boolean }) {
  return (
    <div className={cn('flex flex-none items-center gap-2 pt-2', expandido ? 'px-2.5' : 'justify-center')} title="CutCut · local · Windows">
      {/* A marca não leva o feixe: o feixe só mora nos lugares da §3.1. */}
      <span aria-hidden className="inline-flex skew-x-[-14deg] gap-[3px]">
        <b className="block h-4 w-[7px] rounded-[3px] bg-iris" />
        <b className="block h-[11px] w-[7px] self-end rounded-[3px] bg-iris opacity-75" />
      </span>
      {expandido ? (
        <span className="min-w-0">
          <span className="block text-linha font-extrabold tracking-[-0.03em] text-fg">CutCut</span>
          <span className="block text-micro font-medium text-fg-3">local · Windows</span>
        </span>
      ) : null}
    </div>
  );
}

export function GlobalRail(props: GlobalRailProps) {
  const { expandido, onAlternar, menu, fila, filaAtiva = false, filaComErro = false, ficha, sincronia } = props;
  return (
    <aside
      aria-label="Trilho"
      className={cn('cc-vidro-casca flex min-h-0 flex-col gap-1.5 overflow-hidden rounded-painel', expandido ? 'p-3' : 'items-stretch p-2.5')}
    >
      <div className={cn('flex flex-none items-center gap-1.5', expandido ? 'flex-row' : 'flex-col')}>
        {ficha}
        <button
          type="button"
          onClick={onAlternar}
          title={expandido ? 'Recolher o trilho · ⌘B' : 'Expandir o trilho · ⌘B'}
          aria-label={expandido ? 'Recolher o trilho' : 'Expandir o trilho'}
          aria-expanded={expandido}
          className={cn('inline-grid size-8 flex-none place-items-center rounded-pilula text-fg-3 hover:bg-vidro-2 hover:text-fg', FOCO)}
        >
          <Icon name="panel-left" />
        </button>
      </div>

      {/* Só esta região rola. A ficha e o pé ficam. */}
      <nav aria-label="Telas" className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto overflow-x-hidden">
        <Bloco titulo="Produção" itens={menu.producao} props={props} />
        {fila ? <ItemDaFila fila={fila} ativa={filaAtiva} erro={filaComErro} expandido={expandido} /> : null}
        <Bloco titulo="Inteligência" itens={menu.inteligencia} props={props} />
      </nav>

      <div className="flex flex-none flex-col gap-0.5 border-t border-fio pt-1.5">
        <Bloco itens={menu.ferramentas} props={props} />
        {sincronia ? <AvisoDeSincronia sincronia={sincronia} expandido={expandido} /> : null}
        <Marca expandido={expandido} />
      </div>
    </aside>
  );
}
