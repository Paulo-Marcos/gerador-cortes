import { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useConfirmacao } from '@/components/ui/confirm-dialog';
import { useToast } from '@/components/ui/toaster';
import { mesclarCortesComExport } from '@/features/projeto-detalhe/cortesDoWorkspace';
import { avaliarProntidaoPublicacao } from '@/features/projeto-detalhe/prontidaoPublicacao';
import { moverCorte, useCortesProjeto, useReordenarCortes } from '@/features/editor/useCortes';
import {
  useAbrirPastaProjeto,
  useAnalisarDesviosTodos,
  useExportStatus,
  useLiberarPublicacao,
  useMarcarPublicadoYouTube,
  useProjeto,
  useProjetoProgressoWS,
  useRefazerTranscricao,
  useUploadYouTube,
} from '@/features/projeto-detalhe/useProjetoDetalhe';
import { useAnaliseClaudeEmAndamento } from '@/features/diarizacao/useDiarizacao';
import { useWarmupWaveforms } from '@/hooks/useWarmupWaveforms';
import type { ProviderIA } from '@/lib/providerIa';
import { resolveThumbUrl } from '@/lib/api';
import { cortesApi } from '@/features/editor/api/cortes';
import { formatarDuracao } from '@/lib/utils';
import type {  DestinoPublicacao, StatusExportCorte } from '@/types/models';
import { useCanais } from '@/features/channels/useChannels';
import { type IconName } from '@/upgrade/Icon';
import { useDefinirChrome } from '@/upgrade/UpgradeChrome';
import type { CorteFiltro } from './WorkspaceProjetoPage';


// D-729: o container de WorkspaceProjetoPage — estado, efeitos e ações. A view, em
// WorkspaceProjetoPage.tsx, só desenha o que este hook devolve.
export function useWorkspaceProjeto() {
  const { id = '' } = useParams<{ id: string }>();
  const { notify } = useToast();

  const projeto = useProjeto(id);
  const cortesQuery = useCortesProjeto(id);
  const exportStatus = useExportStatus(id);
  const progresso = useProjetoProgressoWS(id);
  const analiseEmVoo = useAnaliseClaudeEmAndamento(id);

  const abrirPasta = useAbrirPastaProjeto();
  const refazerTranscricao = useRefazerTranscricao(id);
  const analisarDesviosTodos = useAnalisarDesviosTodos(id);
  const confirmacao = useConfirmacao();
  const reordenar = useReordenarCortes(id);
  const uploadYoutube = useUploadYouTube();
  const marcarPublicado = useMarcarPublicadoYouTube();
  const liberarPublicacao = useLiberarPublicacao();

  const [analiseAberta, setAnaliseAberta] = useState(false);
  const [auditoriaAberta, setAuditoriaAberta] = useState(false);
  const [publicarAberto, setPublicarAberto] = useState(false);
  const [tiktokAberto, setTiktokAberto] = useState(false);
  const [novoCorteAberto, setNovoCorteAberto] = useState(false);
  const [enviandoId, setEnviandoId] = useState<string | null>(null);
  const [informarUrlDe, setInformarUrlDe] = useState<StatusExportCorte | null>(null);
  // D-746: publicar é público e irreversível — o clique na linha abre a
  // conferência (canal, título, capa, agendar), e só ela envia.
  const [publicarDe, setPublicarDe] = useState<StatusExportCorte | null>(null);
  const [agendarEm, setAgendarEm] = useState('');
  const [capaQuebrou, setCapaQuebrou] = useState(false);
  const canais = useCanais();
  const canalAtivo = canais.data?.canais.find((c) => c.ativo);
  const capaParaPublicar = publicarDe ? (resolveThumbUrl(id, publicarDe.thumbnail_path) ?? undefined) : undefined;
  const [urlManual, setUrlManual] = useState('');
  const [liberarDe, setLiberarDe] = useState<StatusExportCorte | null>(null);
  // D-746: com mais de um destino publicado, "Liberar" soltava sempre o
  // primeiro. Agora o operador escolhe qual.
  const [destinoALiberar, setDestinoALiberar] = useState<DestinoPublicacao | null>(null);
  const [busca, setBusca] = useState('');

  const cortes = useMemo(() => cortesQuery.data ?? [], [cortesQuery.data]);
  // A lista sai dos CORTES e recebe o export por cima (ver `cortesDoWorkspace`):
  // corte proposto ainda não tem linha em export/status, e partir do export
  // faria a live inteira parecer vazia.
  const statusList = useMemo(
    () => mesclarCortesComExport(cortes, exportStatus.data?.cortes ?? []),
    [cortes, exportStatus.data],
  );

  // Warmup dos proxies/waveforms (F-062): entrar no editor depois disso
  // mostra a timeline na hora, em vez de esperar o áudio ser preparado.
  useWarmupWaveforms(
    useMemo(() => cortes.map((c) => c.id), [cortes]),
    cortes.length > 0,
  );

  const porId = useMemo(() => new Map(cortes.map((c) => [c.id, c])), [cortes]);
  const prontidao = useMemo(
    () => avaliarProntidaoPublicacao(statusList, porId),
    [statusList, porId],
  );

  const linhas: CorteFiltro[] = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return statusList
      .map((status) => ({ status, corte: porId.get(status.corte_id) }))
      .filter(
        ({ status }) =>
          !termo ||
          (status.titulo ?? '').toLowerCase().includes(termo) ||
          String(status.numero).includes(termo),
      );
  }, [statusList, porId, busca]);

  const fires = useMemo(() => cortes.filter((c) => c.is_fire).length, [cortes]);
  const aprovados = useMemo(
    () => cortes.filter((c) => c.status !== 'proposto' && c.status !== 'rejeitado').length,
    [cortes],
  );
  const renderizados = statusList.filter((s) => s.video_pronto).length;
  const publicados = statusList.filter((s) => s.youtube_url_publicado).length;
  const agendados = statusList.filter(
    (s) => s.youtube_scheduled_at && !s.youtube_url_publicado,
  ).length;

  // D-746: numa live de 14 cortes a triagem era dezenas de cliques. Seleção
  // em lote + A/R na linha focada. "Devolver" nunca apaga: tira a aprovação.
  const [selecionados, setSelecionados] = useState<Set<string>>(() => new Set());
  const [emLote, setEmLote] = useState(false);
  const alternarSelecao = (corteId: string) =>
    setSelecionados((atual) => {
      const proximo = new Set(atual);
      if (proximo.has(corteId)) proximo.delete(corteId);
      else proximo.add(corteId);
      return proximo;
    });

  async function aplicarEmLote(acao: 'aprovar' | 'devolver') {
    const alvos = cortes.filter((c) => selecionados.has(c.id));
    const elegiveis = alvos.filter((c) =>
      acao === 'aprovar' ? c.status === 'proposto' : ['aprovado', 'processado'].includes(c.status),
    );
    if (elegiveis.length === 0) {
      notify(
        acao === 'aprovar'
          ? 'Nenhum dos selecionados está proposto — nada a aprovar.'
          : 'Nenhum dos selecionados está aprovado — nada a devolver.',
        { tone: 'info' },
      );
      return;
    }
    setEmLote(true);
    const resultados = await Promise.allSettled(
      elegiveis.map((c) =>
        acao === 'aprovar'
          ? cortesApi.aprovarCorte(c.id)
          : cortesApi.atualizarCorte(c.id, { status: 'proposto' }),
      ),
    );
    setEmLote(false);
    const falhas = resultados.filter((r) => r.status === 'rejected').length;
    const feitos = elegiveis.length - falhas;
    const verbo = acao === 'aprovar' ? 'aprovado' : 'devolvido';
    notify(
      falhas
        ? `${feitos} ${verbo}(s), ${falhas} falharam — confira os que ficaram marcados.`
        : `${feitos} corte(s) ${verbo}(s).`,
      { tone: falhas ? 'warning' : 'success' },
    );
    if (!falhas) setSelecionados(new Set());
    atualizarTudo();
  }

  function atualizarTudo() {
    void projeto.refetch();
    void exportStatus.refetch();
    void cortesQuery.refetch();
  }

  function mover(corteId: string, delta: -1 | 1) {
    const novaOrdem = moverCorte(
      cortes.map((c) => ({ id: c.id })),
      corteId,
      delta,
    );
    if (novaOrdem) reordenar.mutate(novaOrdem);
  }

  function enviarYoutube(corteId: string, scheduledAt: string | null = null) {
    setEnviandoId(corteId);
    uploadYoutube.mutate(
      { corteId, body: { scheduled_at: scheduledAt } },
      {
        onSuccess: (data) => {
          notify(data.mensagem || 'Upload enviado para o YouTube.', { tone: 'success' });
          atualizarTudo();
        },
        onError: (error) =>
          notify(error instanceof Error ? error.message : 'Falha ao enviar para o YouTube.', {
            tone: 'error',
          }),
        onSettled: () => setEnviandoId(null),
      },
    );
  }

  function confirmarUrlManual() {
    if (!informarUrlDe) return;
    const url = urlManual.trim();
    // D-746: URL vazia ou de outro site fazia o botão não fazer nada.
    if (!url) {
      notify('Cole a URL do vídeo no YouTube.', { tone: 'warning' });
      return;
    }
    if (!/^https?:\/\/(www\.|m\.)?(youtube\.com|youtu\.be)\//i.test(url)) {
      notify('Isso não parece uma URL do YouTube (youtube.com ou youtu.be).', { tone: 'warning' });
      return;
    }
    marcarPublicado.mutate(
      { corteId: informarUrlDe.corte_id, body: { youtube_url: url } },
      {
        onSuccess: (data) => {
          notify(data.mensagem || 'Video confirmado no YouTube.', { tone: 'success' });
          setInformarUrlDe(null);
          setUrlManual('');
          atualizarTudo();
        },
        onError: (error) =>
          notify(error instanceof Error ? error.message : 'Falha ao confirmar video no YouTube.', {
            tone: 'error',
          }),
      },
    );
  }

  function confirmarLiberar(destino: DestinoPublicacao) {
    if (!liberarDe) return;
    liberarPublicacao.mutate(
      { corteId: liberarDe.corte_id, body: { destino } },
      {
        onSuccess: (data) => {
          notify(data.mensagem, { tone: data.video_pronto ? 'success' : 'warning' });
          setLiberarDe(null);
          atualizarTudo();
        },
        onError: (error) =>
          notify(error instanceof Error ? error.message : 'Falha ao liberar a publicacao.', {
            tone: 'error',
          }),
      },
    );
  }

  // D-746: re-sincroniza TODOS os cortes — pede confirmação, como o "Gerar
  // trechos" já pedia.
  function dispararRefazerTranscricao() {
    confirmacao.executarOuPedir(
      {
        titulo: 'Refazer a transcrição',
        detalhe: dados?.titulo_live,
        descricao: `As legendas são baixadas de novo e os ${cortes.length} cortes são re-sincronizados com elas.`,
        confirmLabel: 'Refazer transcrição',
      },
      refazerTranscricaoConfirmado,
    );
  }

  function refazerTranscricaoConfirmado() {
    refazerTranscricao.mutate(undefined, {
      onSuccess: (data) =>
        notify(
          `Transcricao re-baixada (json3). ${data.total_cortes_sincronizados} cortes re-sincronizados.`,
          { tone: 'success' },
        ),
      onError: (error) =>
        notify(error instanceof Error ? error.message : 'Falha ao refazer transcricao.', {
          tone: 'error',
        }),
    });
  }

  function dispararTrechosTodos(provider: ProviderIA) {
    const nome = provider === 'gemini' ? 'Gemini' : 'Claude';
    confirmacao.executarOuPedir(
      {
        titulo: `Gerar trechos a remover com o ${nome}`,
        detalhe: 'Todos os cortes deste projeto',
        descricao:
          'A operação roda em segundo plano, corte a corte (pode levar minutos) — os desvios ' +
          'encontrados vão aparecendo aos poucos. Os trechos já marcados NÃO são removidos: ' +
          'esta ação só ACRESCENTA.',
        confirmLabel: `Gerar com ${nome}`,
      },
      () => analisarDesviosTodos.disparar(provider),
    );
  }

  const dados = projeto.data;
  // Pela mutação desta aba OU pelo status do projeto: a análise disparada em
  // outra aba (ou antes de um F5) também tem de aparecer.
  const analisando = analiseEmVoo || dados?.status === 'analisando';
  const duracao = dados?.duracao_segundos ? formatarDuracao(dados.duracao_segundos) : '—';

  useDefinirChrome(
    {
      titulo: dados?.titulo_live || 'Workspace do projeto',
      sub: `${duracao} de live · ${cortes.length} cortes · ${fires} fire · ${publicados} no ar`,
      rotulos: [dados?.titulo_live ?? 'live'],
      acoes: [
        ...(dados?.youtube_url
          ? [
              {
                icone: 'external-link' as const,
                texto: 'Ver no YouTube',
                onClick: () => window.open(dados.youtube_url, '_blank', 'noopener,noreferrer'),
              },
            ]
          : []),
        { icone: 'plus' as const, texto: 'Novo corte', onClick: () => setNovoCorteAberto(true) },
      ],
      // "nada a publicar" nao e alarme: e a live fechada. Pintar de amarelo
      // fazia o estado terminal parecer pendencia.
      estado:
        prontidao.total === 0
          ? {
              texto: 'nada a publicar',
              icone: 'circle-check',
              cor: 'var(--mute)',
              bg: 'var(--inset)',
            }
          : prontidao.liberado
            ? {
                texto: 'lote pronto',
                icone: 'circle-check',
                cor: 'var(--ok)',
                bg: 'var(--ok-soft)',
              }
            : {
                texto: prontidao.resumo,
                icone: 'triangle-alert',
                cor: 'var(--warn)',
                bg: 'var(--warn-soft)',
              },
    },
    [dados?.titulo_live, dados?.youtube_url, duracao, cortes.length, fires, publicados, prontidao],
  );

  const etapas: Array<{ icone: IconName; texto: string; valor: string; feita: boolean }> = [
    {
      icone: 'download',
      texto: 'Baixado',
      valor: dados?.arquivos_limpos ? 'limpo' : 'ok',
      feita: true,
    },
    { icone: 'brain', texto: 'Analisado', valor: `${cortes.length}`, feita: cortes.length > 0 },
    { icone: 'scissors', texto: 'Cortes', valor: `${aprovados}`, feita: aprovados > 0 },
    { icone: 'clapperboard', texto: 'Pós', valor: `${renderizados}`, feita: renderizados > 0 },
    {
      icone: 'tags',
      texto: 'Metadados',
      valor: `${statusList.filter((s) => s.metadados_completos).length}`,
      feita: statusList.some((s) => s.metadados_completos),
    },
    { icone: 'rocket', texto: 'Publicado', valor: `${publicados}`, feita: publicados > 0 },
  ];

  return { abrirPasta, agendados, agendarEm, alternarSelecao, analisando, analisarDesviosTodos, analiseAberta, aplicarEmLote, aprovados, atualizarTudo, auditoriaAberta, busca, canalAtivo, capaParaPublicar, capaQuebrou, confirmacao, confirmarLiberar, confirmarUrlManual, cortes, dados, destinoALiberar, dispararRefazerTranscricao, dispararTrechosTodos, emLote, enviandoId, enviarYoutube, etapas, fires, id, informarUrlDe, liberarDe, linhas, mover, notify, novoCorteAberto, progresso, prontidao, publicados, publicarAberto, publicarDe, refazerTranscricao, renderizados, reordenar, selecionados, setAgendarEm, setAnaliseAberta, setAuditoriaAberta, setBusca, setCapaQuebrou, setDestinoALiberar, setInformarUrlDe, setLiberarDe, setNovoCorteAberto, setPublicarAberto, setPublicarDe, setSelecionados, setTiktokAberto, setUrlManual, statusList, tiktokAberto, urlManual };
}
