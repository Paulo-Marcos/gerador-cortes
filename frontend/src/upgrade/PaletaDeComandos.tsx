import * as RD from '@radix-ui/react-dialog';
import { useEffect, useEffectEvent, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Busca } from '@/components/ui/busca';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { devolverFoco, guardarOrigem, type OrigemDoFoco } from '@/components/ui/dialog';
import { Kbd } from '@/components/ui/kbd';
import { PELE_FLUTUANTE } from '@/components/ui/superficie-flutuante';
import { cn } from '@/lib/utils';
import { useFires } from '@/features/shorts/useFires';
import { useCortesProjeto } from '@/features/editor/useCortes';
import { useProjetos } from '@/features/projetos/useProjetos';
import {
  ESCOPOS,
  estadoVazio,
  filtrar,
  gravarBusca,
  lerBuscas,
  lerPrefixo,
  type EscopoDaPaleta,
  type GrupoDaPaleta,
  type ItemDaPaleta,
} from './fontesDaPaleta';
import { useHistoricoDaCasca } from './historicoDaCasca';
import { Icon } from './Icon';
import { destinosDaPaleta, projetoDaRota } from './upgradeRoutes';

// ─────────────────────────────────────────────────────────────────
// D-599 · A busca do ⌘K.
//
// Enter vai no primeiro; setas escolhem; Esc fecha. A paleta é um atalho,
// e atalho com configuração vira mais uma tela.
//
// RODADA 2 · o Esc PARA AQUI (sem isso fechava também o diálogo de trás),
// e as telas vêm da tabela única (`destinosDaPaleta`).
//
// RODADA 3 (D-746) · a paleta passa a achar o trabalho inteiro: lives,
// shorts, os cortes da live aberta, telas e ações — cada item com o seu
// contexto, porque o mesmo título é live, corte E short. Escopo em chip,
// Tab gira, prefixos @ # > para quem já sabe. Caixa vazia mostra as
// últimas buscas e os últimos lugares. A regra (filtro, prefixo,
// histórico de buscas) mora em `fontesDaPaleta`.
// ─────────────────────────────────────────────────────────────────

const ACOES: ItemDaPaleta[] = [
  { id: 'a-liv', icone: 'plus', rotulo: 'Nova live', contexto: 'buscar e importar', escopo: 'acoes', to: '/buscar-lives' },
  { id: 'a-canal', icone: 'radio', rotulo: 'Trocar de canal', contexto: 'o canal ativo recebe as publicações', escopo: 'acoes', to: '/canais' },
];

const MAX_RESULTADOS = 12;

const DICA_DO_ESCOPO: Record<ItemDaPaleta['escopo'], string> = {
  lives: 'live',
  shorts: 'short',
  cortes: 'corte',
  telas: 'tela',
  acoes: 'ação',
};

function useItensDaPaleta(): ItemDaPaleta[] {
  const { pathname } = useLocation();
  const projetoId = projetoDaRota(pathname) ?? undefined;
  const { data: projetos } = useProjetos();
  const { data: fires } = useFires();
  const { data: cortes } = useCortesProjeto(projetoId);

  return useMemo(() => {
    const telas: ItemDaPaleta[] = destinosDaPaleta().map((d) => ({
      id: d.id,
      rotulo: d.texto,
      icone: d.icone,
      escopo: 'telas',
      to: d.ir,
    }));
    const lives: ItemDaPaleta[] = (projetos ?? []).map((p) => ({
      id: `p-${p.id}`,
      rotulo: p.titulo_live || 'Live sem título',
      contexto: `live · ${p.total_cortes} cortes`,
      icone: 'layout-grid',
      escopo: 'lives',
      to: `/projetos/${p.id}`,
    }));
    const shorts: ItemDaPaleta[] = (fires?.fires ?? []).map((f) => ({
      id: `s-${f.corte_id}`,
      rotulo: f.titulo,
      contexto: `short · corte #${String(f.numero).padStart(2, '0')} · ${f.projeto_titulo}`,
      icone: 'flame',
      escopo: 'shorts',
      to: `/shorts/${f.corte_id}`,
    }));
    const tituloDaLive = projetos?.find((p) => p.id === projetoId)?.titulo_live ?? 'esta live';
    const dosCortes: ItemDaPaleta[] = (cortes ?? []).map((c) => ({
      id: `c-${c.id}`,
      rotulo: `Corte #${String(c.numero).padStart(2, '0')} — ${c.titulo_proposto}`,
      contexto: `corte · ${tituloDaLive} · ${c.status}`,
      icone: 'scissors',
      escopo: 'cortes',
      to: `/projetos/${projetoId}/cortes/${c.id}`,
    }));
    return [...telas, ...ACOES, ...dosCortes, ...shorts, ...lives];
  }, [projetos, fires, cortes, projetoId]);
}

/** Os chips de escopo: "Tudo", lives, shorts… O Tab gira entre eles, então o clique não entra na ordem do teclado. */
function EscoposDaPaleta({ escopo, aoEscolher }: { escopo: EscopoDaPaleta; aoEscolher: (id: EscopoDaPaleta) => void }) {
  return (
    <div role="group" aria-label="Onde procurar" className="flex flex-wrap items-center gap-1.5 border-b border-fio px-3 py-2">
      {ESCOPOS.map((e) => (
        <Chip key={e.id} pressionado={e.id === escopo} tabIndex={-1} onClick={() => aoEscolher(e.id)}>
          {e.prefixo ? <span className="font-mono opacity-70">{e.prefixo}</span> : null}
          {e.rotulo}
        </Chip>
      ))}
      <span className="flex-1" />
      <span className="text-micro text-fg-3">
        <Kbd>Tab</Kbd> troca
      </span>
    </div>
  );
}

function SemResultado({ vazio, escopo, aoProcurarEmTudo }: { vazio: boolean; escopo: EscopoDaPaleta; aoProcurarEmTudo: () => void }) {
  const nomeDoEscopo = ESCOPOS.find((e) => e.id === escopo)?.rotulo ?? 'Tudo';
  return (
    <div className="px-2.5 py-[18px] text-center text-corpo text-fg-3">
      {vazio ? (
        'Digite para procurar. As últimas buscas e os lugares recentes aparecem aqui.'
      ) : escopo === 'tudo' ? (
        'Nada com esse nome.'
      ) : (
        <>
          Nada em <strong className="text-fg">{nomeDoEscopo}</strong> com esse nome.{' '}
          <Button variant="secundario" size="pq" className="ml-1.5" onClick={aoProcurarEmTudo}>
            Procurar em tudo
          </Button>
          {escopo === 'cortes' ? (
            <span className="mt-2 block text-micro text-fg-3">
              Cortes vêm da live aberta — abra uma live para procurar nos cortes dela.
            </span>
          ) : null}
        </>
      )}
    </div>
  );
}

function ResultadosDaPaleta({
  grupos,
  indice,
  aoPassar,
  aoEscolher,
}: {
  grupos: GrupoDaPaleta[];
  indice: number;
  aoPassar: (i: number) => void;
  aoEscolher: (item: ItemDaPaleta) => void;
}) {
  let posicao = -1;
  return grupos.map((g) => (
    <div key={g.titulo || 'resultados'}>
      {g.titulo ? (
        <span className="flex items-center gap-1.5 px-2.5 pb-1 pt-2 text-micro text-fg-3">
          <Icon name={g.icone} />
          {g.titulo}
        </span>
      ) : null}
      {g.itens.map((d) => {
        posicao += 1;
        const i = posicao;
        const ativo = i === indice;
        return (
          <button
            key={d.id}
            type="button"
            data-sala=""
            data-ativo={ativo || undefined}
            onMouseEnter={() => aoPassar(i)}
            onClick={() => aoEscolher(d)}
            className={cn(
              'flex w-full items-center gap-2.5 rounded-[10px] border border-transparent px-2.5 py-2 text-left text-fg',
              'focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-foco',
              ativo && 'border-iris-fio bg-iris-suave',
            )}
          >
            <Icon name={d.icone} className={cn('flex-none', ativo ? 'text-iris-2' : 'text-fg-3')} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-corpo font-semibold">{d.rotulo}</span>
              {d.contexto ? <span className="block truncate text-micro text-fg-3">{d.contexto}</span> : null}
            </span>
            {g.titulo ? null : <span className="flex-none text-micro text-fg-3">{DICA_DO_ESCOPO[d.escopo]}</span>}
          </button>
        );
      })}
    </div>
  ));
}

function RodapeDaPaleta() {
  return (
    <div className="flex items-center gap-3 border-t border-fio px-3 py-2 text-micro text-fg-3">
      <span className="inline-flex items-center gap-1.5">
        <Kbd>↑</Kbd>
        <Kbd>↓</Kbd>
        escolher
      </span>
      <span className="inline-flex items-center gap-1.5">
        <Kbd>↵</Kbd>
        ir
      </span>
      <span className="inline-flex items-center gap-1.5">
        <Kbd>Tab</Kbd>
        escopo
      </span>
    </div>
  );
}

/** O estado da paleta: o termo, o escopo, o item escolhido e o que o teclado faz (setas, Tab, Enter). */
function usePaleta(aberta: boolean, onFechar: () => void) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const itens = useItensDaPaleta();
  const { lugares } = useHistoricoDaCasca();
  const [termo, setTermo] = useState('');
  const [escopoEscolhido, setEscopoEscolhido] = useState<EscopoDaPaleta>('tudo');
  const [indice, setIndice] = useState(0);
  const [buscas, setBuscas] = useState<string[]>([]);
  const campo = useRef<HTMLInputElement>(null);
  const origem = useRef<OrigemDoFoco | null>(null);
  // Quem abriu a paleta é guardado ANTES de o miolo montar: o foco ainda está nele.
  if (aberta && typeof document !== 'undefined') origem.current = guardarOrigem(origem.current, document.activeElement);

  useEffect(() => {
    if (!aberta) return;
    setTermo('');
    setEscopoEscolhido('tudo');
    setIndice(0);
    setBuscas(lerBuscas());
  }, [aberta]);

  // O prefixo digitado manda sobre o chip: "@sermão" é short mesmo com
  // "Tudo" selecionado.
  const { escopo, termo: termoLimpo } = lerPrefixo(termo, escopoEscolhido);
  const vazio = termoLimpo.trim() === '';

  const grupos = useMemo((): GrupoDaPaleta[] => {
    if (vazio) return estadoVazio(buscas, lugares);
    return [{ titulo: '', icone: 'search', itens: filtrar(itens, termoLimpo, escopo).slice(0, MAX_RESULTADOS) }];
  }, [vazio, buscas, lugares, itens, termoLimpo, escopo]);
  const lista = grupos.flatMap((g) => g.itens);

  useEffect(() => setIndice(0), [termo, escopoEscolhido]);

  // R4: trocou de rota por baixo dela (⌘[, ⌘1…⌘4): a paleta não viaja junto,
  // como a gaveta da fila já não viajava.
  // Só a troca de rota dispara; `aberta` é lida na hora, sem ser gatilho —
  // reagir a ela fecharia a paleta na própria abertura.
  const fecharSeAberta = useEffectEvent(() => {
    if (aberta) onFechar();
  });
  useEffect(() => {
    fecharSeAberta();
  }, [pathname]);

  const girarEscopo = (passo: 1 | -1) => {
    const i = ESCOPOS.findIndex((e) => e.id === escopo);
    const proximo = ESCOPOS[(i + passo + ESCOPOS.length) % ESCOPOS.length];
    setEscopoEscolhido(proximo.id);
    // Com prefixo digitado, girar o chip tiraria o escopo do prefixo do lugar.
    if (termo !== termoLimpo) setTermo(termoLimpo);
  };

  const escolher = (item: ItemDaPaleta | undefined) => {
    if (!item) return;
    // Item de "Últimas buscas" não leva a lugar: devolve o termo à caixa.
    if (item.id.startsWith('busca-')) {
      setTermo(item.rotulo);
      campo.current?.focus();
      return;
    }
    gravarBusca(termoLimpo);
    if (item.aoEscolher) item.aoEscolher();
    else if (item.to) navigate(item.to);
    onFechar();
  };

  const aoTeclar = (e: React.KeyboardEvent) => {
    // O Esc é do Radix: fecha só a paleta, e o diálogo de trás fica.
    if (e.key === 'Tab') {
      e.preventDefault();
      // Sem parar aqui, o foco preso do Radix trata o Shift+Tab como "volta ao fim do diálogo"
      // e tira o foco do campo: o Tab da paleta gira o escopo, não passeia pela tela.
      e.stopPropagation();
      girarEscopo(e.shiftKey ? -1 : 1);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setIndice((i) => Math.min(i + 1, lista.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setIndice((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      escolher(lista[indice]);
    }
  };

  const escolherEscopo = (id: EscopoDaPaleta) => {
    setEscopoEscolhido(id);
    if (termo !== termoLimpo) setTermo(termoLimpo);
    campo.current?.focus();
  };

  return { termo, setTermo, escopo, vazio, grupos, lista, indice, setIndice, campo, origem, aoTeclar, escolher, escolherEscopo };
}

export function PaletaDeComandos({ aberta, onFechar }: { aberta: boolean; onFechar: () => void }) {
  const { termo, setTermo, escopo, vazio, grupos, lista, indice, setIndice, campo, origem, aoTeclar, escolher, escolherEscopo } =
    usePaleta(aberta, onFechar);

  return (
    <RD.Root open={aberta} onOpenChange={(a) => !a && onFechar()}>
      <RD.Overlay className="fixed inset-0 z-[65] bg-veu" />
      <RD.Content
        data-sala=""
        aria-describedby={undefined}
        onOpenAutoFocus={(evento) => {
          evento.preventDefault();
          campo.current?.focus();
        }}
        onCloseAutoFocus={(evento) => {
          evento.preventDefault();
          devolverFoco(origem.current);
          origem.current = null;
        }}
        className={cn(
          'fixed left-1/2 top-[12vh] z-[65] flex max-h-[76dvh] w-[min(600px,calc(100vw-32px))] -translate-x-1/2 flex-col overflow-hidden rounded-dialogo outline-none',
          PELE_FLUTUANTE,
        )}
      >
        <RD.Title className="sr-only">Buscar live, short, corte, tela ou ação</RD.Title>
        <div className="flex items-center gap-2 border-b border-fio p-3" onKeyDown={aoTeclar}>
          <Busca
            ref={campo}
            value={termo}
            aoMudar={setTermo}
            placeholder="Buscar live, short, corte ou tela…  (@ shorts · # cortes · > ações)"
            aria-label="Buscar live, short, corte, tela ou ação"
          />
          <Kbd>Esc</Kbd>
        </div>
        <EscoposDaPaleta escopo={escopo} aoEscolher={escolherEscopo} />
        <div className="max-h-[380px] overflow-auto p-1.5">
          {lista.length === 0 ? (
            <SemResultado vazio={vazio} escopo={escopo} aoProcurarEmTudo={() => escolherEscopo('tudo')} />
          ) : (
            <ResultadosDaPaleta grupos={grupos} indice={indice} aoPassar={setIndice} aoEscolher={escolher} />
          )}
        </div>
        <RodapeDaPaleta />
      </RD.Content>
    </RD.Root>
  );
}
