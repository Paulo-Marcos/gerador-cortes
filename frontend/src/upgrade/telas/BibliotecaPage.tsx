import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '@/components/ui/toaster';
import { NovoProjetoForm } from '@/features/projetos/NovoProjetoForm';
import {
  contarPorFiltro,
  filtrarProjetos,
  FILTERS,
  SORTS,
  type FilterKey,
  type SortKey,
} from '@/features/projetos/bibliotecaFiltros';
import { estadoDoProjeto } from '@/features/projetos/statusMaps';
import { temFalhados, useProjetos, useReiniciarFalhados } from '@/hooks/useProjetos';
import { Icon } from '../Icon';
import { useDefinirChrome } from '../UpgradeChrome';
import { ProjetoCardAp } from './ProjetoCardAp';

// ─────────────────────────────────────────────────────────────────
// D-599 Etapa 2 · a Biblioteca na linguagem nova.
//
// Primeira tela de verdade dentro da casca, e por isso a que define o
// molde: cabeçalho vem da casca (título, subtítulo com número, ações),
// a tela fica só com a barra de filtros e a grade. Workspace, Shorts e
// Prateleira vão repetir exatamente esta divisão.
//
// Os dados e as regras de filtro são os mesmos da tela atual — ver
// `bibliotecaFiltros`. Aqui não há lógica nova de negócio; se houvesse,
// as duas Bibliotecas já estariam divergindo.
// ─────────────────────────────────────────────────────────────────

function CardEsqueleto() {
  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <span style={{ aspectRatio: '16/9', background: 'var(--inset)' }} />
      <span style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 11 }}>
        <span style={{ height: 11, width: '70%', borderRadius: 'var(--r1)', background: 'var(--inset)' }} />
        <span style={{ height: 22, borderRadius: 'var(--r1)', background: 'var(--inset)' }} />
        <span style={{ height: 9, width: '50%', borderRadius: 'var(--r1)', background: 'var(--inset)' }} />
      </span>
    </div>
  );
}

function Vazio({ onCriar, onExplorar }: { onCriar: () => void; onExplorar: () => void }) {
  return (
    <div
      className="card"
      style={{ display: 'grid', placeItems: 'center', gap: 7, padding: 22, textAlign: 'center' }}
    >
      <Icon name="inbox" size={22} style={{ color: 'var(--dim)' }} />
      <span style={{ fontSize: 12.5, fontWeight: 700 }}>Nenhuma live ainda</span>
      <span style={{ fontSize: 11.5, color: 'var(--mute)', maxWidth: 240, lineHeight: 1.5 }}>
        Busque no canal ou cole uma URL para o app baixar e analisar a primeira live.
      </span>
      <span style={{ display: 'flex', gap: 6, marginTop: 3 }}>
        <button type="button" className="btn" onClick={onExplorar}>
          <Icon name="radio" size={12} />
          Buscar lives
        </button>
        <button type="button" className="btn btn-pri" onClick={onCriar}>
          <Icon name="plus" size={12} />
          Nova live
        </button>
      </span>
    </div>
  );
}

export default function BibliotecaPage() {
  const navigate = useNavigate();
  const { notify } = useToast();
  const { data, isLoading, isError, error, refetch, isFetching } = useProjetos();
  const reiniciar = useReiniciarFalhados();

  const [formAberto, setFormAberto] = useState(false);
  const [filtro, setFiltro] = useState<FilterKey>('todos');
  const [busca, setBusca] = useState('');
  const [ordem, setOrdem] = useState<SortKey>('recentes');

  const projetos = useMemo(() => data ?? [], [data]);
  const visiveis = useMemo(
    () => filtrarProjetos(projetos, { filtro, busca, ordem }),
    [projetos, filtro, busca, ordem],
  );
  const contagens = useMemo(() => contarPorFiltro(projetos), [projetos]);
  const falhados = useMemo(() => temFalhados(projetos), [projetos]);

  // O subtítulo do design nunca é decorativo: "6 projetos · 2 em análise ·
  // 1 com disco cheio". Aqui ele é calculado, não escrito.
  const sub = useMemo(() => {
    const emAnalise = projetos.filter((p) => estadoDoProjeto(p).key === 'analise').length;
    const naoLimpos = contagens.nao_limpos;
    return [
      `${projetos.length} ${projetos.length === 1 ? 'projeto' : 'projetos'}`,
      emAnalise > 0 ? `${emAnalise} em análise` : null,
      naoLimpos > 0 ? `${naoLimpos} com mídia em disco` : null,
    ]
      .filter(Boolean)
      .join(' · ');
  }, [projetos, contagens]);

  const explorar = () => navigate('/buscar-lives');

  const reiniciarFalhados = () =>
    reiniciar.mutate(undefined, {
      onSuccess: (r) =>
        notify(
          r.total === 0
            ? 'Nenhum projeto com falha de download para reiniciar.'
            : `${r.total} download(s) reiniciado(s).`,
          { tone: r.total === 0 ? 'info' : 'success' },
        ),
      onError: (err) =>
        notify(err instanceof Error ? err.message : 'Erro ao reiniciar downloads.', {
          tone: 'error',
        }),
    });

  useDefinirChrome(
    {
      sub,
      acoes: [
        ...(falhados
          ? [
              {
                icone: 'rotate-ccw' as const,
                texto: 'Reiniciar falhados',
                onClick: reiniciarFalhados,
              },
            ]
          : []),
        { icone: 'radio' as const, texto: 'Explorar YouTube', onClick: explorar },
        { icone: 'plus' as const, texto: 'Nova live', forte: true, onClick: () => setFormAberto(true) },
      ],
      estado: isFetching
        ? { texto: 'atualizando', icone: 'loader', cor: 'var(--info)', bg: 'var(--info-soft)' }
        : { texto: 'sincronizado', icone: 'circle-check', cor: 'var(--ok)', bg: 'var(--ok-soft)' },
    },
    [sub, falhados, isFetching],
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
        <label className="fld" style={{ width: 260 }}>
          <Icon name="search" size={12} style={{ color: 'var(--dim)' }} />
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="buscar por título da live"
            style={{
              minWidth: 0,
              flex: 1,
              border: 0,
              outline: 'none',
              background: 'transparent',
              fontSize: 12,
            }}
          />
        </label>

        {FILTERS.map((f) => {
          const ativo = f.key === filtro;
          return (
            <button
              key={f.key}
              type="button"
              onClick={() => setFiltro(f.key)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                height: 30,
                padding: '0 10px',
                border: `1px solid ${ativo ? 'var(--accent)' : 'var(--line)'}`,
                borderRadius: 'var(--r2)',
                background: ativo ? 'var(--accent-soft)' : 'var(--panel)',
                color: ativo ? 'var(--accent2)' : 'var(--mute)',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              {f.label}
              <span style={{ fontFamily: 'var(--mono)', fontSize: 10.5, opacity: 0.7 }}>
                {contagens[f.key]}
              </span>
            </button>
          );
        })}

        <div style={{ flex: 1 }} />

        <label className="fld">
          <Icon name="list-filter" size={12} style={{ color: 'var(--mute)' }} />
          <select
            value={ordem}
            onChange={(e) => setOrdem(e.target.value as SortKey)}
            aria-label="Ordenar projetos"
            style={{
              border: 0,
              outline: 'none',
              background: 'transparent',
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            {SORTS.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <NovoProjetoForm open={formAberto} onClose={() => setFormAberto(false)} />

      {isError ? (
        <div
          className="card"
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: 9,
            padding: '11px 12px',
            borderColor: 'var(--err-soft)',
          }}
        >
          <Icon name="triangle-alert" size={14} style={{ color: 'var(--err)' }} />
          <span style={{ minWidth: 0, flex: 1 }}>
            <span style={{ display: 'block', fontSize: 12.5, fontWeight: 700 }}>
              Não foi possível carregar a lista real
            </span>
            <span
              style={{ display: 'block', marginTop: 2, fontSize: 11.5, lineHeight: 1.5, color: 'var(--mute)' }}
            >
              {(error as Error).message}
            </span>
          </span>
          <button type="button" className="btn" style={{ height: 24, fontSize: 11 }} onClick={() => refetch()}>
            Tentar de novo
          </button>
        </div>
      ) : null}

      <div
        style={{
          display: 'grid',
          gap: 10,
          gridTemplateColumns: 'repeat(auto-fill,minmax(300px,1fr))',
        }}
      >
        {isLoading
          ? Array.from({ length: 8 }).map((_, i) => <CardEsqueleto key={i} />)
          : visiveis.map((projeto, i) => (
              <ProjetoCardAp key={projeto.id} projeto={projeto} index={i} />
            ))}
      </div>

      {!isLoading && visiveis.length === 0 ? (
        <Vazio onCriar={() => setFormAberto(true)} onExplorar={explorar} />
      ) : null}
    </div>
  );
}
