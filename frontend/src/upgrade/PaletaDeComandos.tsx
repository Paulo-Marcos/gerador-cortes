import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useFires } from '@/features/shorts/useFires';
import { useCortesProjeto } from '@/hooks/useEditor';
import { useProjetos } from '@/hooks/useProjetos';
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

export function PaletaDeComandos({ aberta, onFechar }: { aberta: boolean; onFechar: () => void }) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const itens = useItensDaPaleta();
  const { lugares } = useHistoricoDaCasca();
  const [termo, setTermo] = useState('');
  const [escopoEscolhido, setEscopoEscolhido] = useState<EscopoDaPaleta>('tudo');
  const [indice, setIndice] = useState(0);
  const [buscas, setBuscas] = useState<string[]>([]);
  const campo = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!aberta) return;
    setTermo('');
    setEscopoEscolhido('tudo');
    setIndice(0);
    setBuscas(lerBuscas());
    requestAnimationFrame(() => campo.current?.focus());
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
  useEffect(() => {
    if (aberta) onFechar();
    // Só a troca de rota fecha; reagir a `aberta` fecharia na própria abertura.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  if (!aberta) return null;

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

  const nomeDoEscopo = ESCOPOS.find((e) => e.id === escopo)?.rotulo ?? 'Tudo';
  let posicao = -1;

  return (
    <div
      role="presentation"
      onClick={onFechar}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 65,
        display: 'grid',
        justifyItems: 'center',
        alignItems: 'start',
        paddingTop: '12vh',
        background: 'rgb(10 12 18/.5)',
        backdropFilter: 'blur(3px)',
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Buscar live, short, corte, tela ou ação"
        className="card"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(600px, calc(100vw - 32px))',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          boxShadow: '0 24px 64px rgb(0 0 0/.35)',
        }}
      >
        <label
          className="campo"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '11px 13px',
            borderBottom: '1px solid var(--line2)',
          }}
        >
          <Icon name="command" size={14} style={{ color: 'var(--dim)' }} />
          <input
            ref={campo}
            value={termo}
            onChange={(e) => setTermo(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                // O Esc é da paleta, e só dela: sem parar aqui ele segue para
                // os listeners de documento e fecha o diálogo de trás junto.
                e.preventDefault();
                e.stopPropagation();
                onFechar();
                return;
              }
              if (e.key === 'Tab') {
                e.preventDefault();
                girarEscopo(e.shiftKey ? -1 : 1);
                return;
              }
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setIndice((i) => Math.min(i + 1, lista.length - 1));
              }
              if (e.key === 'ArrowUp') {
                e.preventDefault();
                setIndice((i) => Math.max(i - 1, 0));
              }
              if (e.key === 'Enter') {
                e.preventDefault();
                e.stopPropagation();
                escolher(lista[indice]);
              }
            }}
            placeholder="Buscar live, short, corte ou tela…  (@ shorts · # cortes · > ações)"
            aria-label="Buscar live, short, corte, tela ou ação"
            style={{
              flex: 1,
              minWidth: 0,
              border: 0,
              // O anel de foco fica no `.campo` (ver upgrade.css): dentro de
              // uma caixa com borda, o anel no input desenharia dois retângulos.
              outline: 'none',
              background: 'transparent',
              fontSize: 14,
            }}
          />
          <kbd>Esc</kbd>
        </label>

        <div
          role="tablist"
          aria-label="Onde procurar"
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: 5,
            padding: '7px 11px',
            borderBottom: '1px solid var(--line2)',
          }}
        >
          {ESCOPOS.map((e) => {
            const ativo = e.id === escopo;
            return (
              <button
                key={e.id}
                type="button"
                role="tab"
                aria-selected={ativo}
                tabIndex={-1}
                onClick={() => {
                  setEscopoEscolhido(e.id);
                  if (termo !== termoLimpo) setTermo(termoLimpo);
                  campo.current?.focus();
                }}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  height: 22,
                  padding: '0 8px',
                  border: `1px solid ${ativo ? 'var(--accent)' : 'var(--line)'}`,
                  borderRadius: 99,
                  background: ativo ? 'var(--accent-soft)' : 'transparent',
                  color: ativo ? 'var(--accent2)' : 'var(--mute)',
                  fontSize: 11,
                  fontWeight: 600,
                  whiteSpace: 'nowrap',
                  cursor: 'pointer',
                }}
              >
                {e.prefixo ? (
                  <span style={{ fontFamily: 'var(--mono)', opacity: 0.7 }}>{e.prefixo}</span>
                ) : null}
                {e.rotulo}
              </button>
            );
          })}
          <span style={{ flex: 1 }} />
          <span style={{ fontSize: 10.5, color: 'var(--dim)' }}>
            <kbd>Tab</kbd> troca
          </span>
        </div>

        <div style={{ maxHeight: 380, overflow: 'auto', padding: 6 }}>
          {lista.length === 0 ? (
            <div style={{ padding: '18px 10px', textAlign: 'center', color: 'var(--mute)', fontSize: 12.5 }}>
              {vazio ? (
                'Digite para procurar. As últimas buscas e os lugares recentes aparecem aqui.'
              ) : escopo === 'tudo' ? (
                'Nada com esse nome.'
              ) : (
                <>
                  Nada em <strong>{nomeDoEscopo}</strong> com esse nome.{' '}
                  <button
                    type="button"
                    className="btn"
                    style={{ height: 24, marginLeft: 6, fontSize: 11.5 }}
                    onClick={() => {
                      setEscopoEscolhido('tudo');
                      setTermo(termoLimpo);
                      campo.current?.focus();
                    }}
                  >
                    Procurar em tudo
                  </button>
                  {escopo === 'cortes' ? (
                    <span style={{ display: 'block', marginTop: 8, fontSize: 11, color: 'var(--dim)' }}>
                      Cortes vêm da live aberta — abra uma live para procurar nos cortes dela.
                    </span>
                  ) : null}
                </>
              )}
            </div>
          ) : (
            grupos.map((g) => (
              <div key={g.titulo || 'resultados'}>
                {g.titulo ? (
                  <span
                    className="lbl"
                    style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '8px 9px 4px' }}
                  >
                    <Icon name={g.icone} size={11} />
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
                      onMouseEnter={() => setIndice(i)}
                      onClick={() => escolher(d)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        width: '100%',
                        padding: '7px 9px',
                        border: `1px solid ${ativo ? 'var(--accent)' : 'transparent'}`,
                        borderRadius: 'var(--r2)',
                        background: ativo ? 'var(--accent-soft)' : 'transparent',
                        color: 'var(--ink)',
                        textAlign: 'left',
                        cursor: 'pointer',
                      }}
                    >
                      <Icon
                        name={d.icone}
                        size={14}
                        style={{ color: ativo ? 'var(--accent)' : 'var(--mute)', flex: 'none' }}
                      />
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <span
                          style={{
                            display: 'block',
                            fontSize: 12.5,
                            fontWeight: 600,
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                        >
                          {d.rotulo}
                        </span>
                        {d.contexto ? (
                          <span
                            style={{
                              display: 'block',
                              fontSize: 11,
                              color: 'var(--mute)',
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                            }}
                          >
                            {d.contexto}
                          </span>
                        ) : null}
                      </span>
                      {g.titulo ? null : <span className="lbl">{DICA_DO_ESCOPO[d.escopo]}</span>}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: '8px 13px',
            borderTop: '1px solid var(--line2)',
            fontSize: 11,
            color: 'var(--mute)',
          }}
        >
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <kbd>↑</kbd>
            <kbd>↓</kbd>
            escolher
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <kbd>↵</kbd>
            ir
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <kbd>Tab</kbd>
            escopo
          </span>
        </div>
      </div>
    </div>
  );
}
