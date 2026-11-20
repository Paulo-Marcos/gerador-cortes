import { MenuDeIa } from '@/components/ui/acao-de-ia';
import { Busca } from '@/components/ui/busca';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Icon, type IconName } from '@/components/ui/icon';
import { IconButton } from '@/components/ui/icon-button';
import { CabecalhoDaLista, LinhaDaLista, Lista } from '@/components/ui/lista';
import { AdicionarCorteModal } from '@/features/editor/AdicionarCorteModal';
import { AnaliseIaModal } from '@/features/projeto-detalhe/AnaliseIaModal';
import { AuditoriaAnaliseModal } from '@/features/projeto-detalhe/AuditoriaAnaliseModal';
import { PublicarMassaModal } from '@/features/projeto-detalhe/PublicarMassaModal';
import { PublicarTiktokModal } from '@/features/projeto-detalhe/PublicarTiktokModal';
import { cortesParaTiktok, cortesParaYoutube } from '@/features/projeto-detalhe/listasDePublicacao';
import type { Corte, StatusExportCorte } from '@/types/models';
import { BARRA_EM_COLUNA_MIN_PX, useJanelaMin } from '@/upgrade/medidas';
import { ICONE_DO_CONCEITO } from '@/upgrade/Icon';
import { estadoDaLinha } from './acoesDaLinha';
import { CorteLinhaAp } from './CorteLinhaAp';
import { colunasDaLinha, titulosDasColunas } from './colunasDaLista';
import { EnviarAoYoutubeDialog, InformarLinkDialog, LiberarPublicacaoDialog } from './DialogosDaLinha';
import { FalhaDosCortes, ListaVazia } from './FalhaDosCortes';
import { listaVaziaDoWorkspace, podeReordenar } from './cortesDoWorkspace';
import { abertoNaLista, cortesDoMapa } from './leituraDoMapa';
import { MapaDosCortes } from './MapaDosCortes';
import { AtalhosDaLista, AvisoDaLive, LoteDaSelecao, TituloDaLive } from './PartesDaTela';
import { SeloNoAr } from './SeloNoAr';
import { useCorteAberto } from './useCorteAberto';
import { useWorkspaceProjeto } from './useWorkspaceProjeto';

// ─────────────────────────────────────────────────────────────────
// D-599 Etapa 3 · o Workspace do projeto: a tela dos cortes da live.
//
// D-1149 (E-069 H-16, DIRECAO §7.2): de cima para baixo, o título da live, o mapa da live
// (o cartão com fio de luz) e a lista dos cortes. O mapa e a lista mostram o MESMO corte
// aberto: clicar no mapa leva à linha, e a linha com o foco acende o corte no mapa. A única
// primária da tela é a da barra de ação da casca ("Publicar N cortes", `rodapeDoWorkspace`);
// na lista a ação é texto. Onde a live parou e quanto rendeu moram na trilha da casca (D-866).
// ─────────────────────────────────────────────────────────────────

export type CorteFiltro = { status: StatusExportCorte; corte: Corte | undefined };

/** Os utilitários da live, ao lado da busca: só ícone, com rótulo e dica. */
function Utilitario({
  icone,
  titulo,
  onClick,
  disabled,
}: {
  icone: IconName;
  titulo: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <IconButton variant="fantasma" size="pq" title={titulo} aria-label={titulo} onClick={onClick} disabled={disabled}>
      <Icon name={icone} />
    </IconButton>
  );
}

export default function WorkspaceProjetoPage() {
  const { agendarEm, alternarSelecao, analisando, analisarDesviosTodos, analiseAberta, aplicarEmLote, atualizarTudo, auditoriaAberta, busca, canalAtivo, capaParaPublicar, confirmacao, confirmarLiberar, confirmarUrlManual, cortes, cortesCarregados, dados, destinoALiberar, dispararTrechosTodos, emLote, enviandoId, enviarYoutube, falhaDosCortes, fires, id, informarUrlDe, liberarDe, linhas, mover, novoCorteAberto, progresso, prontidao, publicarAberto, publicarDe, reordenar, resumo, selecionados, setAgendarEm, setAnaliseAberta, setAuditoriaAberta, setBusca, setDestinoALiberar, setInformarUrlDe, setLiberarDe, setNovoCorteAberto, setPublicarAberto, setPublicarDe, setSelecionados, setTiktokAberto, setUrlManual, soNoAr, statusList, tiktokAberto, tirarFiltroNoAr, urlManual } = useWorkspaceProjeto();
  const listaVazia = listaVaziaDoWorkspace(busca, soNoAr, cortesCarregados);
  const { abertoId, abrirPeloMapa, abrirPelaLinha } = useCorteAberto();
  const aberto = abertoNaLista(abertoId, linhas);
  const etapasEmColuna = useJanelaMin(BARRA_EM_COLUNA_MIN_PX);

  return (
    <div data-parte="cortes-da-live" className="flex flex-col gap-4">
      <TituloDaLive titulo={dados?.titulo_live ?? ''} resumo={resumo} />

      {/* D-746: a análise da live só aparecia dentro do modal — fechado, não
          havia sinal de que a IA estava trabalhando. */}
      {analisando ? (
        <AvisoDaLive
          icone="brain"
          titulo="Analisando a live com a IA"
          detalhe="os cortes propostos aparecem aqui quando terminar — pode seguir usando o app"
        />
      ) : null}
      {progresso && (progresso.status === 'baixando' || progresso.status === 'transcrevendo') ? (
        <AvisoDaLive
          icone={progresso.status === 'baixando' ? 'download' : 'captions'}
          titulo={progresso.status === 'baixando' ? 'Baixando vídeo' : 'Transcrevendo'}
          progresso={Math.round(progresso.progresso ?? 0)}
        />
      ) : null}

      <MapaDosCortes
        duracaoSeg={dados?.duracao_segundos ?? 0}
        cortes={cortesDoMapa(linhas)}
        abertoId={aberto}
        onAbrir={abrirPeloMapa}
        prontos={prontidao.prontos}
        fires={fires}
      />

      <section aria-labelledby="lista-dos-cortes" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h2 id="lista-dos-cortes" className="text-secao text-fg">
            Cortes
          </h2>
          {soNoAr ? <SeloNoAr total={linhas.length} onTirar={tirarFiltroNoAr} /> : null}
          <span className="flex-1" />
          <AtalhosDaLista />
          {/* D-867: reanalisar, refazer a transcrição, auditar e abrir a pasta moram no
              "Mais" da linha do topo. Ficam aqui o gerar trechos (fora do rodapé por decisão
              do Paulo, D-870) e o TikTok. */}
          <span className="inline-flex items-center gap-0.5">
            <MenuDeIa
              rotulo="Gerar trechos de todos os cortes"
              icone={ICONE_DO_CONCEITO.iaGera}
              ocupado={analisarDesviosTodos.disparado}
              desabilitado={cortes.length === 0}
              onGerar={dispararTrechosTodos}
              classeGatilho="h-[30px] w-[30px]"
              // A fileira mora na borda direita: abrindo para a direita, o menu vazava da tela.
              alinhamento="direita"
            />
            <Utilitario
              icone={ICONE_DO_CONCEITO.publicar}
              titulo="Subir para o TikTok (robô ou pacote)"
              onClick={() => setTiktokAberto(true)}
            />
          </span>
          <span className="w-[220px]">
            <Busca value={busca} aoMudar={setBusca} placeholder="Buscar corte" aria-label="Buscar corte" name="buscar-corte" autoComplete="off" />
          </span>
        </div>

        {selecionados.size > 0 ? (
          <LoteDaSelecao
            total={selecionados.size}
            ocupado={emLote}
            aoAprovar={() => void aplicarEmLote('aprovar')}
            aoDevolver={() => void aplicarEmLote('devolver')}
            aoLimpar={() => setSelecionados(new Set())}
          />
        ) : null}

        <Lista colunas={colunasDaLinha(true, etapasEmColuna)}>
          {linhas.length > 0 ? (
            <CabecalhoDaLista>
              {titulosDasColunas(true, etapasEmColuna).map((t, i) => (
                <span key={i}>{t}</span>
              ))}
            </CabecalhoDaLista>
          ) : null}
          {linhas.map(({ status, corte }, i) => (
            <LinhaDaLista
              key={status.corte_id}
              atual={status.corte_id === aberto}
              marcada={selecionados.has(status.corte_id)}
              riscada={estadoDaLinha(corte, status) === 'rejeitado'}
            >
              <CorteLinhaAp
                projetoId={id}
                corte={corte}
                status={status}
                podeSubir={podeReordenar(busca, soNoAr) && i > 0}
                podeDescer={podeReordenar(busca, soNoAr) && i < linhas.length - 1}
                reordenando={reordenar.isPending}
                onMover={(delta) => mover(status.corte_id, delta)}
                onEnviarYoutube={() => {
                  setAgendarEm('');
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
                onAbrir={() => abrirPelaLinha(status.corte_id)}
              />
            </LinhaDaLista>
          ))}
        </Lista>
        {linhas.length === 0 && falhaDosCortes ? <FalhaDosCortes {...falhaDosCortes} /> : null}
        {linhas.length === 0 && !falhaDosCortes ? (
          <ListaVazia {...listaVazia} analisar={() => setAnaliseAberta(true)} />
        ) : null}
      </section>

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

      <EnviarAoYoutubeDialog
        corte={publicarDe}
        canal={canalAtivo}
        capa={capaParaPublicar}
        agendarEm={agendarEm}
        setAgendarEm={setAgendarEm}
        aoFechar={() => setPublicarDe(null)}
        aoEnviar={(corte, quando) => {
          enviarYoutube(corte.corte_id, quando ? new Date(quando).toISOString() : null);
          setPublicarDe(null);
        }}
      />
      <InformarLinkDialog
        corte={informarUrlDe}
        link={urlManual}
        setLink={setUrlManual}
        aoFechar={() => setInformarUrlDe(null)}
        aoConfirmar={confirmarUrlManual}
      />
      <LiberarPublicacaoDialog
        corte={liberarDe}
        destino={destinoALiberar}
        setDestino={setDestinoALiberar}
        aoFechar={() => setLiberarDe(null)}
        aoLiberar={confirmarLiberar}
      />

      <ConfirmDialog
        pedido={confirmacao.pedido}
        onCancel={confirmacao.cancelar}
        onConfirm={confirmacao.confirmar}
      />
    </div>
  );
}
