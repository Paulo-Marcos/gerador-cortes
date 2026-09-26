import { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Scissors } from 'lucide-react';
import { MenuDeIa } from '@/components/ui/acao-de-ia';
import { ConfirmDialog, useConfirmacao } from '@/components/ui/confirm-dialog';
import { useToast } from '@/components/ui/toaster';
import { AdicionarCorteModal } from '@/features/editor/AdicionarCorteModal';
import { AnaliseIaModal } from '@/features/projeto-detalhe/AnaliseIaModal';
import { AuditoriaAnaliseModal } from '@/features/projeto-detalhe/AuditoriaAnaliseModal';
import { PublicarMassaModal } from '@/features/projeto-detalhe/PublicarMassaModal';
import { PublicarTiktokModal } from '@/features/projeto-detalhe/PublicarTiktokModal';
import {
  cortesParaTiktok,
  cortesParaYoutube,
  destinosPublicados,
} from '@/features/projeto-detalhe/listasDePublicacao';
import { mesclarCortesComExport } from '@/features/projeto-detalhe/cortesDoWorkspace';
import { avaliarProntidaoPublicacao } from '@/features/projeto-detalhe/prontidaoPublicacao';
import { moverCorte, useCortesProjeto, useReordenarCortes } from '@/hooks/useEditor';
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
} from '@/hooks/useProjetoDetalhe';
import { useAnaliseClaudeEmAndamento } from '@/hooks/useDiarizacao';
import { useWarmupWaveforms } from '@/hooks/useWarmupWaveforms';
import type { ProviderIA } from '@/lib/providerIa';
import { api, resolveThumbUrl } from '@/lib/api';
import { formatarDuracao } from '@/lib/utils';
import type { Corte, DestinoPublicacao, StatusExportCorte } from '@/types/models';
import { useCanais } from '@/features/channels/useChannels';
import { Icon, type IconName } from '../Icon';
import { MolduraDeVideo } from '../MolduraDeVideo';
import { ModalFields, ModalText, UpgradeModal } from '../UpgradeModal';
import { useDefinirChrome } from '../UpgradeChrome';
import { CorteLinhaAp } from './CorteLinhaAp';

// ─────────────────────────────────────────────────────────────────
// D-599 Etapa 3 · o Workspace do projeto.
//
// A tela responde três perguntas em três alturas, de cima para baixo:
// quanto esta live rendeu (os quatro números), onde ela parou (a faixa
// de etapas, que também é onde moram as ações do projeto inteiro) e o
// que cada corte ainda deve (a lista).
//
// As ações do projeto ficam na faixa de etapas, e não espalhadas: é ali
// que se lê o estado da live, e decidir ao lado de onde se lê evita o
// vaivém entre o topo e o rodapé que a tela antiga exigia.
// ─────────────────────────────────────────────────────────────────

type CorteFiltro = { status: StatusExportCorte; corte: Corte | undefined };

function Estatistica({
  icone,
  rotulo,
  valor,
  sub,
  cor,
}: {
  icone: IconName;
  rotulo: string;
  valor: string;
  sub: string;
  cor: string;
}) {
  return (
    <div className="card" style={{ padding: '11px 12px' }}>
      <span className="lbl" style={{ display: 'flex', alignItems: 'center', gap: 5, color: cor }}>
        <Icon name={icone} size={12} />
        {rotulo}
      </span>
      <div
        style={{
          marginTop: 5,
          fontSize: 24,
          fontWeight: 700,
          letterSpacing: '-.02em',
          lineHeight: 1,
        }}
      >
        {valor}
      </div>
      <div style={{ marginTop: 2, fontSize: 11, color: 'var(--mute)' }}>{sub}</div>
    </div>
  );
}

function Utilitario({
  icone,
  titulo,
  cor,
  onClick,
  disabled,
}: {
  icone: IconName;
  titulo: string;
  cor: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      className="btn btn-icon"
      title={titulo}
      aria-label={titulo}
      onClick={onClick}
      disabled={disabled}
      style={{
        height: 26,
        width: 26,
        border: 0,
        background: 'none',
        boxShadow: 'none',
        color: cor,
      }}
    >
      <Icon name={icone} size={13} />
    </button>
  );
}

export default function WorkspaceProjetoPage() {
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
          ? api.aprovarCorte(c.id)
          : api.atualizarCorte(c.id, { status: 'proposto' }),
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div
        style={{
          display: 'grid',
          gap: 10,
          gridTemplateColumns: 'repeat(auto-fit,minmax(170px,1fr))',
        }}
      >
        <Estatistica
          icone="scissors"
          rotulo="Cortes"
          valor={String(cortes.length)}
          sub={`${aprovados} aprovados · ${fires} fire`}
          // R4: estatística é dado, não ação — o acento fica com os botões.
          cor="var(--ink)"
        />
        <Estatistica
          icone="clapperboard"
          rotulo="Renders"
          valor={`${renderizados}/${aprovados || cortes.length}`}
          sub={renderizados === aprovados ? 'todos prontos' : 'aguardando render'}
          cor="var(--info)"
        />
        <Estatistica
          icone="rocket"
          rotulo="No ar"
          valor={String(publicados)}
          sub={agendados > 0 ? `+${agendados} agendados` : 'sem agendamentos'}
          cor="var(--ok)"
        />
        <Estatistica
          icone="hard-drive"
          rotulo="Disco"
          valor={dados?.arquivos_limpos ? 'limpo' : 'em uso'}
          sub={dados?.arquivos_limpos ? 'mídia pesada apagada' : 'bruto guardado'}
          cor="var(--warn)"
        />
      </div>

      <div
        className="card"
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: 10,
          padding: '11px 12px',
          // O vidro (backdrop-filter) faz do card um contexto de empilhamento:
          // sem subir a faixa, o menu Claude/Gemini de "gerar trechos" abria
          // POR BAIXO da lista de cortes que vem depois.
          position: 'relative',
          zIndex: 5,
        }}
      >
        <span className="lbl">Etapas da live</span>
        {etapas.map((e, i) => (
          <span key={e.texto} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span
              className="chip"
              style={{
                height: 26,
                background: e.feita ? 'var(--ok-soft)' : 'var(--inset)',
                color: e.feita ? 'var(--ok)' : 'var(--dim)',
              }}
            >
              <Icon name={e.icone} size={12} />
              {e.texto}
              <span style={{ fontFamily: 'var(--mono)', fontSize: 10, opacity: 0.8 }}>
                {e.valor}
              </span>
            </span>
            {i < etapas.length - 1 ? (
              <span style={{ width: 14, height: 1, background: 'var(--line)' }} aria-hidden />
            ) : null}
          </span>
        ))}

        <div style={{ flex: 1 }} />

        {/* Cluster de utilitários: as ferramentas raras ficam recuadas, sem
            borda própria, para não disputarem peso com as duas decisões da
            direita. Cada uma leva a sua cor — a fileira toda em cinza some. */}
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 1,
            padding: 2,
            border: '1px solid var(--line)',
            borderRadius: 'var(--r2)',
            background: 'var(--inset)',
          }}
        >
          <Utilitario
            icone="hard-drive"
            titulo="Abrir a pasta do projeto"
            cor="var(--mute)"
            onClick={() =>
              abrirPasta.mutate(id, {
                onError: (erro) =>
                  notify(erro instanceof Error ? erro.message : 'Não consegui abrir a pasta.', {
                    tone: 'error',
                  }),
              })
            }
            disabled={abrirPasta.isPending}
          />
          <Utilitario
            icone="rotate-ccw"
            titulo="Refazer transcrição — re-baixa as legendas em json3 e re-sincroniza todos os cortes."
            cor="var(--accent)"
            onClick={dispararRefazerTranscricao}
            disabled={refazerTranscricao.isPending}
          />
          <Utilitario
            icone="search"
            titulo="Auditar análise — ver por que a IA escolheu cada corte e o que foi descartado."
            cor="var(--info)"
            onClick={() => setAuditoriaAberta(true)}
            disabled={cortes.length === 0}
          />
          {/* Mesmo ícone da fileira, mas abre a escolha do provedor: aqui não
              cabe um grupo com texto sem quebrar o ritmo dos utilitários. */}
          <MenuDeIa
            rotulo="Gerar trechos de todos os cortes"
            icone={Scissors}
            ocupado={analisarDesviosTodos.disparado}
            desabilitado={cortes.length === 0}
            onGerar={dispararTrechosTodos}
            classeGatilho="h-[26px] w-[26px]"
            // A fileira mora na borda direita: abrindo para a direita, o menu vazava da tela.
            alinhamento="direita"
          />
          <Utilitario
            icone="send"
            titulo="Preparar pacote para o TikTok (envio manual)"
            cor="var(--mute)"
            onClick={() => setTiktokAberto(true)}
          />
        </span>

        <button type="button" className="btn" onClick={() => setAnaliseAberta(true)}>
          <Icon name="brain" size={13} />
          Reanalisar
        </button>
        {/* D-439: o lote só abre com todos prontos. O `title` no invólucro
            porque botão desabilitado não recebe eventos — sem ele o motivo
            do bloqueio nunca apareceria. */}
        <span style={{ display: 'inline-flex' }} title={prontidao.detalhe}>
          <button
            type="button"
            className="btn btn-pri"
            disabled={!prontidao.liberado}
            onClick={() => setPublicarAberto(true)}
            style={prontidao.liberado ? undefined : { opacity: 0.45, cursor: 'not-allowed' }}
          >
            <Icon name="send" size={13} />
            {prontidao.total === 0
              ? 'Nada a publicar'
              : `Publicar ${prontidao.total} ${prontidao.total === 1 ? 'corte' : 'cortes'}`}
          </button>
        </span>
      </div>

      {/* D-746: a análise da live só aparecia dentro do modal — fechado, não
          havia sinal de que a IA estava trabalhando. */}
      {analisando ? (
        <div
          className="card"
          style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 12px' }}
        >
          <Icon name="brain" size={14} style={{ color: 'var(--info)' }} />
          <b style={{ fontSize: 12.5 }}>Analisando a live com a IA</b>
          <span style={{ fontSize: 12, color: 'var(--mute)' }}>
            os cortes propostos aparecem aqui quando terminar — pode seguir usando o app
          </span>
          <span style={{ flex: 1 }} />
          <Icon name="loader" size={14} style={{ color: 'var(--info)' }} />
        </div>
      ) : null}

      {progresso && (progresso.status === 'baixando' || progresso.status === 'transcrevendo') ? (
        <div
          className="card"
          style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 12px' }}
        >
          <Icon
            name={progresso.status === 'baixando' ? 'download' : 'captions'}
            size={14}
            style={{ color: 'var(--info)' }}
          />
          <b style={{ fontSize: 12.5 }}>
            {progresso.status === 'baixando' ? 'Baixando vídeo' : 'Transcrevendo'}
          </b>
          <span
            style={{
              flex: 1,
              minWidth: 80,
              height: 4,
              borderRadius: 2,
              background: 'var(--inset)',
            }}
          >
            <span
              style={{
                display: 'block',
                width: `${Math.round(progresso.progresso ?? 0)}%`,
                height: '100%',
                borderRadius: 2,
                background: 'var(--info)',
              }}
            />
          </span>
          <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--mute)' }}>
            {Math.round(progresso.progresso ?? 0)}%
          </span>
        </div>
      ) : null}

      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span className="lbl">Cortes da live</span>
        <span style={{ fontSize: 11.5, color: 'var(--mute)' }}>
          {cortes.length} cortes · {prontidao.prontos} prontos · {fires} fire
        </span>
        <div style={{ flex: 1 }} />
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--dim)' }}>
          <kbd>A</kbd> aprova · <kbd>R</kbd> devolve · <kbd>J</kbd>
          <kbd>K</kbd> anda
        </span>
        <label className="fld" style={{ width: 200 }}>
          <Icon name="search" size={12} style={{ color: 'var(--dim)' }} />
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="buscar corte"
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
      </div>

      {selecionados.size > 0 ? (
        <div
          className="card"
          role="toolbar"
          aria-label="Ações em lote"
          style={{
            position: 'sticky',
            top: 0,
            zIndex: 5,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '8px 11px',
            background: 'var(--solid)',
          }}
        >
          <b style={{ fontSize: 12.5 }}>
            {selecionados.size} selecionado{selecionados.size === 1 ? '' : 's'}
          </b>
          <span style={{ flex: 1 }} />
          <button
            type="button"
            className="btn"
            disabled={emLote}
            onClick={() => void aplicarEmLote('devolver')}
            title="Tira a aprovação dos selecionados — não apaga nada"
          >
            <Icon name="undo-2" size={13} />
            Devolver
          </button>
          <button
            type="button"
            className="btn"
            disabled={emLote}
            onClick={() => void aplicarEmLote('aprovar')}
            style={{ borderColor: 'var(--ok)', color: 'var(--ok)' }}
          >
            <Icon name={emLote ? 'loader' : 'check'} size={13} />
            Aprovar
          </button>
          <button
            type="button"
            className="btn btn-icon"
            onClick={() => setSelecionados(new Set())}
            title="Limpar a seleção"
            aria-label="Limpar a seleção"
          >
            <Icon name="x" size={13} />
          </button>
        </div>
      ) : null}

      <div style={{ display: 'grid', gap: 8 }}>
        {linhas.map(({ status, corte }, i) => (
          <CorteLinhaAp
            key={status.corte_id}
            projetoId={id}
            corte={corte}
            status={status}
            podeSubir={i > 0}
            podeDescer={i < linhas.length - 1}
            reordenando={reordenar.isPending}
            onMover={(delta) => mover(status.corte_id, delta)}
            onEnviarYoutube={() => {
              setAgendarEm('');
              setCapaQuebrou(false);
              setPublicarDe(status);
            }}
            onInformarUrl={() => {
              setInformarUrlDe(status);
              setUrlManual(status.youtube_url_publicado ?? '');
            }}
            onLiberarPublicacao={() => {
              setDestinoALiberar(null);
              setLiberarDe(status);
            }}
            enviando={enviandoId === status.corte_id}
            selecionado={selecionados.has(status.corte_id)}
            onAlternarSelecao={() => alternarSelecao(status.corte_id)}
          />
        ))}
        {linhas.length === 0 ? (
          <div
            className="card"
            style={{
              display: 'grid',
              placeItems: 'center',
              gap: 7,
              padding: 22,
              textAlign: 'center',
            }}
          >
            <Icon name="inbox" size={22} style={{ color: 'var(--dim)' }} />
            <span style={{ fontSize: 12.5, fontWeight: 700 }}>
              {busca ? 'Nenhum corte com esse termo' : 'Esta live ainda não tem cortes'}
            </span>
            {busca ? null : (
              <button type="button" className="btn btn-pri" onClick={() => setAnaliseAberta(true)}>
                <Icon name="brain" size={12} />
                Analisar com a IA
              </button>
            )}
          </div>
        ) : null}
      </div>

      <AnaliseIaModal
        key={id}
        open={analiseAberta}
        onClose={() => setAnaliseAberta(false)}
        projetoId={id}
        duracaoSegundos={dados?.duracao_segundos ?? 0}
        totalCortesExistentes={cortes.length}
      />
      <AuditoriaAnaliseModal
        open={auditoriaAberta}
        onClose={() => setAuditoriaAberta(false)}
        projetoId={id}
      />
      <PublicarMassaModal
        open={publicarAberto}
        onClose={() => setPublicarAberto(false)}
        projetoId={id}
        cortesProntos={cortesParaYoutube(statusList)}
      />
      <PublicarTiktokModal
        open={tiktokAberto}
        onClose={() => setTiktokAberto(false)}
        projetoId={id}
        cortes={cortesParaTiktok(statusList)}
      />
      <AdicionarCorteModal
        open={novoCorteAberto}
        onClose={() => setNovoCorteAberto(false)}
        projetoId={id}
        onCreated={atualizarTudo}
      />

      <UpgradeModal
        open={publicarDe !== null}
        onClose={() => setPublicarDe(null)}
        icon="send"
        title={`Enviar o corte #${publicarDe?.numero ?? ''} ao YouTube`}
        width="600px"
        subtitle={
          canalAtivo
            ? `canal de destino: ${canalAtivo.nome} (${canalAtivo.handle})`
            : 'canal de destino: o canal ativo'
        }
        footerNote="público e sem desfazer pelo app"
        primaryLabel={agendarEm ? 'Agendar no YouTube' : 'Enviar ao YouTube agora'}
        primaryIcon={agendarEm ? 'clock' : 'send'}
        onPrimary={() => {
          if (!publicarDe) return;
          enviarYoutube(publicarDe.corte_id, agendarEm ? new Date(agendarEm).toISOString() : null);
          setPublicarDe(null);
        }}
      >
        {publicarDe ? (
          <div style={{ display: 'grid', gridTemplateColumns: '150px minmax(0,1fr)', gap: 12 }}>
            <MolduraDeVideo mat={4} proporcao="16/9">
              {capaParaPublicar && !capaQuebrou ? (
                <img
                  src={capaParaPublicar}
                  onError={() => setCapaQuebrou(true)}
                  alt=""
                  style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
                />
              ) : (
                <span
                  style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', fontSize: 11, color: 'var(--dim)' }}
                >
                  sem capa
                </span>
              )}
            </MolduraDeVideo>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
              <span style={{ fontSize: 13, fontWeight: 700, lineHeight: 1.35 }}>
                {publicarDe.titulo_youtube || publicarDe.titulo}
              </span>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--mute)' }}>
                  Agendar (opcional — vazio envia agora)
                </span>
                <span className="fld">
                  <input
                    type="datetime-local"
                    value={agendarEm}
                    onChange={(e) => setAgendarEm(e.target.value)}
                    style={{ flex: 1, minWidth: 0, border: 0, outline: 'none', background: 'transparent', fontSize: 12 }}
                  />
                </span>
              </label>
            </div>
          </div>
        ) : null}
      </UpgradeModal>

      <UpgradeModal
        open={informarUrlDe !== null}
        onClose={() => setInformarUrlDe(null)}
        icon="play"
        title={`Informar a URL do corte #${informarUrlDe?.numero ?? ''}`}
        subtitle="para quando o vídeo já subiu fora do app"
        width="480px"
        footerNote="o app só guarda a marca — nada é enviado"
        primaryLabel="Confirmar publicação"
        primaryIcon="check"
        onPrimary={confirmarUrlManual}
      >
        <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--mute)' }}>
            URL do YouTube
          </span>
          <span className="fld">
            <input
              value={urlManual}
              onChange={(e) => setUrlManual(e.target.value)}
              placeholder="https://youtube.com/watch?v=…"
              style={{
                minWidth: 0,
                flex: 1,
                border: 0,
                outline: 'none',
                background: 'transparent',
                fontSize: 12,
              }}
            />
          </span>
        </label>
      </UpgradeModal>

      <UpgradeModal
        open={liberarDe !== null}
        onClose={() => setLiberarDe(null)}
        icon="rotate-ccw"
        title={`Liberar a publicação do corte #${liberarDe?.numero ?? ''}`}
        subtitle="o corte volta para a fila e pode subir de novo"
        width="440px"
        secondaryLabel="Fechar"
        primaryLabel="Liberar"
        primaryIcon="rotate-ccw"
        onPrimary={() => {
          const destinos = liberarDe ? destinosPublicados(liberarDe) : [];
          const escolhido = destinoALiberar ?? destinos[0]?.destino;
          if (escolhido) confirmarLiberar(escolhido);
        }}
      >
        <ModalText>
          Isto não apaga nada lá fora: é o app aceitando ser informado de que o vídeo saiu do ar.
          Depois disso o botão de enviar reaparece sozinho.
        </ModalText>
        {(() => {
          const destinos = liberarDe ? destinosPublicados(liberarDe) : [];
          if (destinos.length <= 1) {
            return (
              <ModalFields fields={destinos.map((d) => ({ label: d.rotulo, value: d.detalhe }))} />
            );
          }
          const atual = destinoALiberar ?? destinos[0].destino;
          return (
            <div role="radiogroup" aria-label="Qual destino liberar" style={{ display: 'grid', gap: 6 }}>
              {destinos.map((d) => (
                <label
                  key={d.destino}
                  className="row"
                  style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 9px', cursor: 'pointer' }}
                >
                  <input
                    type="radio"
                    name="destino-a-liberar"
                    checked={atual === d.destino}
                    onChange={() => setDestinoALiberar(d.destino)}
                    style={{ accentColor: 'var(--accent)' }}
                  />
                  <span style={{ fontSize: 12.5, fontWeight: 600 }}>{d.rotulo}</span>
                  <span style={{ fontSize: 11.5, color: 'var(--mute)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {d.detalhe}
                  </span>
                </label>
              ))}
            </div>
          );
        })()}
      </UpgradeModal>

      <ConfirmDialog
        pedido={confirmacao.pedido}
        onCancel={confirmacao.cancelar}
        onConfirm={confirmacao.confirmar}
      />
    </div>
  );
}
