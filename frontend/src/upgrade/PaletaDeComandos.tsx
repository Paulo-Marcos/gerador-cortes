import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useProjetos } from '@/hooks/useProjetos';
import { Icon, type IconName } from './Icon';

// ─────────────────────────────────────────────────────────────────
// D-599 · A busca do ⌘K.
//
// A barra superior do design promete "Buscar live, corte, ação…". Um
// campo que parece clicável e não faz nada é pior que campo nenhum, então
// ele virou o que promete: uma lista única onde se digita e se vai.
//
// Três tipos de destino na mesma lista, porque a pergunta de quem abre o
// ⌘K é sempre "onde está X" — e X pode ser uma tela, uma live ou uma ação.
// Separar em abas obrigaria a saber o tipo antes de lembrar o nome.
//
// Enter vai no primeiro; setas escolhem; Esc fecha. Nada além disso: a
// paleta é um atalho, e atalho com configuração vira mais uma tela.
// ─────────────────────────────────────────────────────────────────

type Destino = { id: string; icone: IconName; texto: string; dica: string; ir: string };

const TELAS: Destino[] = [
  { id: 't-bib', icone: 'home', texto: 'Biblioteca', dica: 'tela', ir: '/projetos' },
  { id: 't-sho', icone: 'flame', texto: 'Shorts', dica: 'tela', ir: '/shorts' },
  { id: 't-liv', icone: 'radio', texto: 'Buscar lives', dica: 'tela', ir: '/buscar-lives' },
  { id: 't-ran', icone: 'trophy', texto: 'Ranking de lives', dica: 'tela', ir: '/ranking-lives' },
  { id: 't-pad', icone: 'sparkles', texto: 'Padrões de capa', dica: 'tela', ir: '/padroes-thumbnail' },
  { id: 't-ana', icone: 'bar-chart', texto: 'Análises', dica: 'tela', ir: '/analises' },
  { id: 't-fil', icone: 'loader', texto: 'Fila de processamento', dica: 'tela', ir: '/fila' },
  { id: 't-ata', icone: 'keyboard', texto: 'Atalhos', dica: 'tela', ir: '/atalhos' },
  { id: 't-cfg', icone: 'settings', texto: 'Configurações', dica: 'tela', ir: '/canais' },
  { id: 'a-liv', icone: 'plus', texto: 'Nova live', dica: 'ação', ir: '/buscar-lives' },
];

const MAX_RESULTADOS = 12;

function normalizar(texto: string) {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

export function PaletaDeComandos({ aberta, onFechar }: { aberta: boolean; onFechar: () => void }) {
  const navigate = useNavigate();
  const { data: projetos } = useProjetos();
  const [termo, setTermo] = useState('');
  const [indice, setIndice] = useState(0);
  const campo = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!aberta) return;
    setTermo('');
    setIndice(0);
    requestAnimationFrame(() => campo.current?.focus());
  }, [aberta]);

  const resultados = useMemo(() => {
    const lives: Destino[] = (projetos ?? []).map((p) => ({
      id: `p-${p.id}`,
      icone: 'layout-grid',
      texto: p.titulo_live || 'Live sem título',
      dica: 'live',
      ir: `/projetos/${p.id}`,
    }));
    const q = normalizar(termo.trim());
    const todos = [...TELAS, ...lives];
    const filtrados = q ? todos.filter((d) => normalizar(d.texto).includes(q)) : TELAS;
    return filtrados.slice(0, MAX_RESULTADOS);
  }, [projetos, termo]);

  useEffect(() => setIndice(0), [termo]);

  if (!aberta) return null;

  const ir = (d: Destino | undefined) => {
    if (!d) return;
    navigate(d.ir);
    onFechar();
  };

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
        aria-label="Buscar live, tela ou ação"
        className="card"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(560px, calc(100vw - 32px))',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          boxShadow: '0 24px 64px rgb(0 0 0/.35)',
        }}
      >
        <label
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
              if (e.key === 'Escape') onFechar();
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setIndice((i) => Math.min(i + 1, resultados.length - 1));
              }
              if (e.key === 'ArrowUp') {
                e.preventDefault();
                setIndice((i) => Math.max(i - 1, 0));
              }
              if (e.key === 'Enter') ir(resultados[indice]);
            }}
            placeholder="Buscar live, tela ou ação…"
            style={{
              flex: 1,
              minWidth: 0,
              border: 0,
              outline: 'none',
              background: 'transparent',
              fontSize: 14,
            }}
          />
          <kbd>Esc</kbd>
        </label>

        <div style={{ maxHeight: 380, overflow: 'auto', padding: 6 }}>
          {resultados.length === 0 ? (
            <p style={{ margin: 0, padding: '18px 10px', textAlign: 'center', color: 'var(--mute)' }}>
              Nada com esse nome.
            </p>
          ) : (
            resultados.map((d, i) => {
              const ativo = i === indice;
              return (
                <button
                  key={d.id}
                  type="button"
                  onMouseEnter={() => setIndice(i)}
                  onClick={() => ir(d)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    width: '100%',
                    padding: '8px 9px',
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
                  <span
                    style={{
                      flex: 1,
                      minWidth: 0,
                      fontSize: 12.5,
                      fontWeight: 600,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {d.texto}
                  </span>
                  <span className="lbl">{d.dica}</span>
                </button>
              );
            })
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
        </div>
      </div>
    </div>
  );
}
