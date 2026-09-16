import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useProjetos } from '@/hooks/useProjetos';
import { Icon, type IconName } from './Icon';
import { destinosDaPaleta } from './upgradeRoutes';

// ─────────────────────────────────────────────────────────────────
// D-599 · A busca do ⌘K.
//
// Três tipos de destino na mesma lista, porque a pergunta de quem abre o
// ⌘K é sempre "onde está X" — e X pode ser uma tela, uma live ou uma
// ação. Separar em abas obrigaria a saber o tipo antes de lembrar o nome.
//
// Enter vai no primeiro; setas escolhem; Esc fecha. Nada além disso: a
// paleta é um atalho, e atalho com configuração vira mais uma tela.
//
// RODADA 2 · duas correções:
//
//   1. O Esc PARA AQUI. A paleta não interrompia a propagação, então o
//      Esc fechava também o diálogo que estivesse atrás — o operador
//      perdia o formulário que estava preenchendo. (A outra metade do
//      conserto está em `teclasDaCasca`: com diálogo aberto, ⌘K não
//      abre a paleta.)
//   2. As telas vêm da tabela única (`destinosDaPaleta`), não de uma
//      lista escrita à mão que já discordava do trilho.
// ─────────────────────────────────────────────────────────────────

type Destino = { id: string; icone: IconName; texto: string; dica: string; ir: string };

const ACOES: Destino[] = [
  { id: 'a-liv', icone: 'plus', texto: 'Nova live', dica: 'ação', ir: '/buscar-lives' },
];

const MAX_RESULTADOS = 12;

function normalizar(texto: string) {
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
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

  const telas = useMemo(() => destinosDaPaleta(), []);

  const resultados = useMemo(() => {
    const lives: Destino[] = (projetos ?? []).map((p) => ({
      id: `p-${p.id}`,
      icone: 'layout-grid',
      texto: p.titulo_live || 'Live sem título',
      dica: 'live',
      ir: `/projetos/${p.id}`,
    }));
    const q = normalizar(termo.trim());
    const todos = [...telas, ...ACOES, ...lives];
    const filtrados = q ? todos.filter((d) => normalizar(d.texto).includes(q)) : [...telas, ...ACOES];
    return filtrados.slice(0, MAX_RESULTADOS);
  }, [projetos, telas, termo]);

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
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setIndice((i) => Math.min(i + 1, resultados.length - 1));
              }
              if (e.key === 'ArrowUp') {
                e.preventDefault();
                setIndice((i) => Math.max(i - 1, 0));
              }
              if (e.key === 'Enter') {
                e.preventDefault();
                e.stopPropagation();
                ir(resultados[indice]);
              }
            }}
            placeholder="Buscar live, tela ou ação…"
            aria-label="Buscar live, tela ou ação"
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
