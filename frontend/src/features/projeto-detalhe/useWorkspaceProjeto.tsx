import { useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useConfirmacao } from '@/components/ui/confirm-dialog';
import { useToast } from '@/components/ui/toaster';
import {
  alvosDoLote,
  linhaPassaNoFiltro,
  mesclarCortesComExport,
  selecionadosVisiveis,
  semFiltroNoAr,
  subDoWorkspace,
} from '@/features/projeto-detalhe/cortesDoWorkspace';
import { acoesDoWorkspace } from '@/features/projeto-detalhe/acoesDoWorkspace';
import {
  barraDoWorkspace,
  chipDaProntidao,
  pedidoAprovarPropostos,
  proximaAcaoDaLive,
} from '@/features/projeto-detalhe/rodapeDoWorkspace';
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
import type { Corte, DestinoPublicacao, StatusExportCorte } from '@/types/models';
import { useCanais } from '@/features/channels/useChannels';
import { filtroNoArLigado } from '@/upgrade/trilhaDaLive';
import { useDefinirChrome } from '@/upgrade/UpgradeChrome';
import type { CorteFiltro } from './WorkspaceProjetoPage';


// D-729: o container de WorkspaceProjetoPage — estado, efeitos e ações. A view, em
// WorkspaceProjetoPage.tsx, só desenha o que este hook devolve.
/** D-867: abrir a pasta saiu da tela para o "Mais" do cabeçalho; o aviso de
 *  erro, que morava no botão, vem junto. */
function useAbrirPastaDoProjeto(id: string) {
  const abrirPasta = useAbrirPastaProjeto();
  const { notify } = useToast();
  return {
    abrindo: abrirPasta.isPending,
    abrir: () =>
      abrirPasta.mutate(id, {
        onError: (erro) =>
          notify(erro instanceof Error ? erro.message : 'Não consegui abrir a pasta.', {
            tone: 'error',
          }),
      }),
  };
}

export function useWorkspaceProjeto() {
  const { id = '' } = useParams<{ id: string }>();
  const { notify } = useToast();

  const projeto = useProjeto(id);
  const cortesQuery = useCortesProjeto(id);
  const exportStatus = useExportStatus(id);
  const progresso = useProjetoProgressoWS(id);
  const analiseEmVoo = useAnaliseClaudeEmAndamento(id);

  const pasta = useAbrirPastaDoProjeto(id);
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
  // D-866: a etapa Publicado da trilha abre o Workspace com o filtro "No ar".
  // Ele mora na URL para o link da trilha chegar filtrado e o voltar desfazer.
  const [parametros, setParametros] = useSearchParams();
  const soNoAr = filtroNoArLigado(parametros.toString());
  const tirarFiltroNoAr = () => setParametros(semFiltroNoAr);

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
      .filter(({ status }) => linhaPassaNoFiltro(status, termo, soNoAr));
  }, [statusList, porId, busca, soNoAr]);

  const fires = useMemo(() => cortes.filter((c) => c.is_fire).length, [cortes]);
  const publicados = statusList.filter((s) => s.youtube_url_publicado).length;
  const agendados = statusList.filter(
    (s) => s.youtube_scheduled_at && !s.youtube_url_publicado,
  ).length;

  // D-746: numa live de 14 cortes a triagem era dezenas de cliques. Seleção
  // em lote + A/R na linha focada. "Devolver" nunca apaga: tira a aprovação.
  const [selecao, setSelecionados] = useState<Set<string>>(() => new Set());
  const selecionados = useMemo(() => selecionadosVisiveis(selecao, linhas), [selecao, linhas]);
  const [emLote, setEmLote] = useState(false);
  const alternarSelecao = (corteId: string) =>
    setSelecionados((atual) => {
      const proximo = new Set(atual);
      if (proximo.has(corteId)) proximo.delete(corteId);
      else proximo.add(corteId);
      return proximo;
    });

  /** Sem `todos`, age sobre a seleção visível; com `todos` (o rodapé), sobre a
   *  live inteira — e aí não mexe na seleção manual (decisão do Paulo). */
  async function aplicarEmLote(acao: 'aprovar' | 'devolver', todos?: Corte[]) {
    const alvos = todos ?? alvosDoLote(cortes, selecao, linhas);
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
    if (!falhas && !todos) setSelecionados(new Set());
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

  const navigate = useNavigate();
  const proxima = proximaAcaoDaLive({
    cortes,
    statusList,
    prontidao,
    arquivosLimpos: Boolean(dados?.arquivos_limpos),
    carregando: !dados || !cortesQuery.data,
    analisando,
    statusDoProjeto: dados?.status,
  });
  useDefinirChrome(
    {
      titulo: dados?.titulo_live || 'Workspace do projeto',
      sub: subDoWorkspace({
        duracao,
        cortes: cortes.length,
        fires,
        publicados,
        agendados,
        arquivosLimpos: Boolean(dados?.arquivos_limpos),
      }),
      rotulos: [dados?.titulo_live ?? 'live'],
      acoes: acoesDoWorkspace({
        youtubeUrl: dados?.youtube_url,
        temCortes: cortes.length > 0,
        abrindoPasta: pasta.abrindo,
        refazendoTranscricao: refazerTranscricao.isPending,
        novoCorte: () => setNovoCorteAberto(true),
        reanalisar: () => setAnaliseAberta(true),
        refazerTranscricao: dispararRefazerTranscricao,
        auditar: () => setAuditoriaAberta(true),
        abrirPasta: pasta.abrir,
      }),
      estado: chipDaProntidao(prontidao),
      // D-870: o próximo passo da live no rodapé, como no editor.
      barra: barraDoWorkspace(proxima, {
        analisar: () => setAnaliseAberta(true),
        aprovarPropostos: (n) =>
          confirmacao.executarOuPedir(pedidoAprovarPropostos(n), () => void aplicarEmLote('aprovar', cortes)),
        renderizar: (corte) => navigate(`/projetos/${id}/post-production?corte=${corte}`),
        publicar: () => setPublicarAberto(true),
      }),
    },
    [
      dados?.titulo_live, dados?.youtube_url, dados?.arquivos_limpos,
      duracao,
      cortes.length,
      fires,
      publicados,
      agendados,
      prontidao, cortes,
      pasta.abrindo, refazerTranscricao.isPending,
      // O passo é recriado a cada render: a chave estável evita republicar
      // a casca sem fim (efeito → casca → render → passo novo → efeito).
      JSON.stringify(proxima),
    ],
  );

  return { agendarEm, alternarSelecao, analisando, analisarDesviosTodos, analiseAberta, aplicarEmLote, atualizarTudo, auditoriaAberta, busca, canalAtivo, capaParaPublicar, capaQuebrou, confirmacao, confirmarLiberar, confirmarUrlManual, cortes, dados, destinoALiberar, dispararTrechosTodos, emLote, enviandoId, enviarYoutube, fires, id, informarUrlDe, liberarDe, linhas, mover, novoCorteAberto, progresso, prontidao, publicarAberto, publicarDe, reordenar, selecionados, setAgendarEm, setAnaliseAberta, setAuditoriaAberta, setBusca, setCapaQuebrou, setDestinoALiberar, setInformarUrlDe, setLiberarDe, setNovoCorteAberto, setPublicarAberto, setPublicarDe, setSelecionados, setTiktokAberto, setUrlManual, soNoAr, statusList, tiktokAberto, tirarFiltroNoAr, urlManual };
}
