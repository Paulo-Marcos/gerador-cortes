import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { EstadoCarregando, EstadoVazio } from '@/components/ui/estado-vazio';
import { EstadoDeErro } from '@/components/ui/estado-de-erro';
import { Progresso } from '@/components/ui/progresso';
import { useCanais } from '@/features/channels/useChannels';
import { useCortesProjeto } from '@/features/editor/useCortes';
import { useExportStatus, useProjeto } from '@/features/projeto-detalhe/useProjetoDetalhe';
import { resolveThumbUrl } from '@/lib/api';
import { thumbnailUrl } from '@/lib/utils';
import { mensagemErro } from '@/lib/mensagemErro';
import type { MetadadoCorte, StatusExportCorte } from '@/types/models';
import { PublicarMassaModal } from '@/features/projeto-detalhe/PublicarMassaModal';
import { MetadataCard } from './MetadataCard';
import { useDefinirChrome } from '@/upgrade/UpgradeChrome';
import { ICONE_DO_CONCEITO } from '@/upgrade/Icon';
import { COR_DO_SELO } from '@/upgrade/SeloDeEstado';

function metadadoStatus(meta?: MetadadoCorte, status?: StatusExportCorte) {
  if (status?.metadados_completos || meta?.titulo_youtube) return 'ready';
  if (meta?.prompt_thumbnail || meta?.texto_capa) return 'partial';
  return 'empty';
}

/**
 * D-427: a aba de trabalho amarrada a um corte chega aqui com `?corte=` —
 * sem isso a tela abriria sempre no primeiro corte do projeto.
 * D-798: o corte ativo volta para a URL — é de lá que a trilha de etapas
 * (Cortes, Pós, Revisão) tira o corte para onde levar.
 */
function useCorteAtivoNaUrl(): [string, (corteId: string) => void] {
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeId, setActiveId] = useState(() => searchParams.get('corte') ?? '');
  const ativarCorte = useCallback(
    (corteId: string) => {
      setActiveId(corteId);
      setSearchParams({ corte: corteId }, { replace: true });
    },
    [setSearchParams],
  );
  return [activeId, ativarCorte];
}

// A bolinha de cada corte na coluna de contexto: pronto (ok), em andamento (convida) ou vazio (inerte).
const DOT = {
  ready: COR_DO_SELO.ok.cor,
  partial: COR_DO_SELO.aviso.cor,
  empty: COR_DO_SELO.inerte.cor,
} as const;

/** D-1204: sem a lista, "0 de 0 cortes prontos" afirmaria o que ninguém sabe. */
function subDosMetadados(semLista: boolean, stats: { ready: number; total: number; thumbs: number }) {
  if (semLista) return 'sem a lista de cortes';
  return `${stats.ready} de ${stats.total} cortes prontos · ${stats.thumbs} capas`;
}

/**
 * A tela de Metadados e capas (D-1167, E-069 H-19, DIRECAO §7.5): três colunas. A da esquerda
 * (os cortes aprovados, cada um com o que falta) é a coluna de contexto da casca; no meio e à
 * direita, o formulário e as capas do corte aberto. Um corte de cada vez, e a tela o recria a
 * cada troca (D-1033). A única primária é "Publicar N cortes", na barra de ação (§5).
 */
export function MetadataPage() {
  const { id: projetoId } = useParams();
  const [activeId, ativarCorte] = useCorteAtivoNaUrl();
  const [metaById, setMetaById] = useState<Record<string, MetadadoCorte>>({});
  const [publicarOpen, setPublicarOpen] = useState(false);
  const cortesQuery = useCortesProjeto(projetoId);
  const exportQuery = useExportStatus(projetoId);
  const projetoQuery = useProjeto(projetoId);
  const canais = useCanais();
  const navigate = useNavigate();
  const canal = canais.data?.canais.find((c) => c.ativo)?.nome;

  const cuts = useMemo(
    () =>
      (cortesQuery.data ?? [])
        .filter((cut) => cut.status === 'aprovado' || cut.status === 'processado')
        .sort((a, b) => a.numero - b.numero),
    [cortesQuery.data],
  );

  const statusMap = useMemo(
    () => new Map((exportQuery.data?.cortes ?? []).map((status) => [status.corte_id, status] as const)),
    [exportQuery.data],
  );

  useEffect(() => {
    if (!activeId && cuts[0]) ativarCorte(cuts[0].id);
  }, [activeId, cuts, ativarCorte]);

  const handleMetaLoaded = useCallback((corteId: string, meta: MetadadoCorte) => {
    setMetaById((current) => ({ ...current, [corteId]: meta }));
  }, []);

  const stats = useMemo(() => {
    const total = cuts.length;
    const ready = cuts.filter((cut) => metadadoStatus(metaById[cut.id], statusMap.get(cut.id)) === 'ready').length;
    const thumbs = cuts.filter((cut) =>
      Boolean(statusMap.get(cut.id)?.thumbnail_pronta || metaById[cut.id]?.thumbnail_path),
    ).length;
    return { total, ready, thumbs };
  }, [cuts, metaById, statusMap]);

  // Prontos = pronto_publicar e ainda não publicados (mesma regra do Workspace).
  const cortesProntos = useMemo(
    () => (exportQuery.data?.cortes ?? []).filter((c) => c.pronto_publicar && !c.youtube_url_publicado),
    [exportQuery.data],
  );

  // D-599: a lista de cortes é a COLUNA DE CONTEXTO da casca, a troca de corte é o seletor
  // com J/K, e o rodapé "pronto para o YouTube" + publicar é a barra de ações fixa.
  const indiceAtivo = cuts.findIndex((c) => c.id === activeId);
  const irParaCorte = (delta: -1 | 1) => {
    if (cuts.length === 0) return;
    ativarCorte(cuts[(Math.max(0, indiceAtivo) + delta + cuts.length) % cuts.length].id);
  };
  const corteAtivo = cuts[indiceAtivo] ?? cuts[0];

  useDefinirChrome(
    {
      titulo: corteAtivo ? `Metadados & capas — Corte #${corteAtivo.numero}` : 'Metadados & capas',
      sub: subDosMetadados(cortesQuery.isError, stats),
      // O primeiro slot da trilha de Metadados é a LIVE, o segundo o corte.
      rotulos: [projetoQuery.data?.titulo_live ?? 'Live', ...(corteAtivo ? [`#${corteAtivo.numero}`] : [])],
      lista:
        cuts.length > 0
          ? {
              cabecalho: {
                titulo: projetoQuery.data?.titulo_live ?? 'Cortes aprovados',
                sub: `${stats.total} cortes · ${stats.ready} prontos`,
                thumb: thumbnailUrl(projetoQuery.data?.youtube_url ?? '', 'mq') ?? undefined,
              },
              titulo: 'Cortes aprovados',
              resumo: `${stats.ready} de ${stats.total} prontos`,
              itens: cuts.map((c) => ({
                id: c.id,
                num: String(c.numero),
                titulo: c.titulo_proposto,
                legenda: `#${c.numero} · ${c.inicio_hms}`,
                thumb: resolveThumbUrl(projetoId ?? '', metaById[c.id]?.thumbnail_path) ?? undefined,
                dot: DOT[metadadoStatus(metaById[c.id], statusMap.get(c.id))],
                ativo: c.id === activeId,
                onClick: () => ativarCorte(c.id),
              })),
            }
          : undefined,
      atual: corteAtivo
        ? {
            num: String(corteAtivo.numero),
            titulo: corteAtivo.titulo_proposto,
            onAnterior: () => irParaCorte(-1),
            onProximo: () => irParaCorte(1),
            onVerTodos: () => navigate(`/projetos/${projetoId}`),
          }
        : undefined,
      barra:
        cuts.length > 0
          ? {
              extra: (
                <span className="inline-flex items-center gap-2.5">
                  <span className="text-pequeno text-fg-2">
                    <b className="num text-fg">
                      {stats.ready} de {stats.total}
                    </b>{' '}
                    prontos para o YouTube
                  </span>
                  <Progresso
                    className="w-[140px]"
                    rotulo="Cortes prontos para o YouTube"
                    valor={stats.total > 0 ? (stats.ready / stats.total) * 100 : 0}
                    mostrarValor={false}
                  />
                </span>
              ),
              primario: {
                texto:
                  cortesProntos.length === 0
                    ? 'Nada pronto para publicar'
                    : `Publicar ${cortesProntos.length} ${cortesProntos.length === 1 ? 'corte' : 'cortes'}`,
                icone: ICONE_DO_CONCEITO.publicar,
                onClick: () => setPublicarOpen(true),
                desabilitado: cortesProntos.length === 0,
              },
            }
          : undefined,
    },
    [cuts, activeId, stats, metaById, statusMap, cortesProntos.length, projetoQuery.data?.titulo_live, cortesQuery.isError],
  );

  if (!projetoId) {
    return <EstadoDeErro titulo="Projeto não encontrado" motivo="O endereço não aponta para uma live." />;
  }

  return (
    <div className="flex min-h-0 text-fg">
      <div className="flex min-w-0 flex-1 flex-col">
        {cortesQuery.isLoading ? (
          <EstadoCarregando frase="Buscando os cortes aprovados…" linhas={2} />
        ) : cortesQuery.isError ? (
          <EstadoDeErro
            titulo="Erro ao carregar cortes"
            motivo={mensagemErro(cortesQuery.error, 'Tente novamente.')}
            aoTentar={() => void cortesQuery.refetch()}
          />
        ) : cuts.length === 0 ? (
          <EstadoVazio
            icone="check"
            titulo="Nenhum corte aprovado"
            descricao="Aprove cortes no editor antes de gerar metadados."
            acao="Ir para o editor"
            aoAgir={() => navigate(`/projetos/${projetoId}/cortes`)}
          />
        ) : (
          corteAtivo && (
            <MetadataCard
              key={corteAtivo.id}
              projetoId={projetoId}
              cut={corteAtivo}
              status={statusMap.get(corteAtivo.id)}
              canal={canal}
              onMetaLoaded={handleMetaLoaded}
            />
          )
        )}
      </div>

      <PublicarMassaModal
        open={publicarOpen}
        onClose={() => setPublicarOpen(false)}
        projetoId={projetoId}
        cortesProntos={cortesProntos}
      />
    </div>
  );
}
