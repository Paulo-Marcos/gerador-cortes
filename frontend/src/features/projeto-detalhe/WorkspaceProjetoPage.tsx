import { MenuDeIa } from '@/components/ui/acao-de-ia';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
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
import type { Corte,  StatusExportCorte } from '@/types/models';
import { Icon, ICONE_DO_CONCEITO, type IconName } from '@/upgrade/Icon';
import { MolduraDeVideo } from '@/upgrade/MolduraDeVideo';
import { ModalFields, ModalText, UpgradeModal } from '@/upgrade/UpgradeModal';
import { CorteLinhaAp } from './CorteLinhaAp';
import { listaVaziaDoWorkspace, podeReordenar } from './cortesDoWorkspace';
import { SeloNoAr } from './SeloNoAr';
import { useWorkspaceProjeto } from './useWorkspaceProjeto';

// ─────────────────────────────────────────────────────────────────
// D-599 Etapa 3 · o Workspace do projeto.
//
// A tela responde o que cada corte ainda deve (a lista). Onde a live parou
// e quanto ela rendeu moram na trilha da casca (D-866), que trocou os
// quatro cartões de números e a faixa "Etapas da live" desta tela; o que
// só os cartões diziam (agendados, disco) foi para o subtítulo.
//
// As ações do projeto inteiro ficam na faixa logo acima da lista.
// ─────────────────────────────────────────────────────────────────

export type CorteFiltro = { status: StatusExportCorte; corte: Corte | undefined };

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
      <Icon name={icone} />
    </button>
  );
}

export default function WorkspaceProjetoPage() {
  const { agendarEm, alternarSelecao, analisando, analisarDesviosTodos, analiseAberta, aplicarEmLote, atualizarTudo, auditoriaAberta, busca, canalAtivo, capaParaPublicar, capaQuebrou, confirmacao, confirmarLiberar, confirmarUrlManual, cortes, dados, destinoALiberar, dispararTrechosTodos, emLote, enviandoId, enviarYoutube, fires, id, informarUrlDe, liberarDe, linhas, mover, novoCorteAberto, progresso, prontidao, publicarAberto, publicarDe, reordenar, selecionados, setAgendarEm, setAnaliseAberta, setAuditoriaAberta, setBusca, setCapaQuebrou, setDestinoALiberar, setInformarUrlDe, setLiberarDe, setNovoCorteAberto, setPublicarAberto, setPublicarDe, setSelecionados, setTiktokAberto, setUrlManual, soNoAr, statusList, tiktokAberto, tirarFiltroNoAr, urlManual } = useWorkspaceProjeto();
  const listaVazia = listaVaziaDoWorkspace(busca, soNoAr);


  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
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
        <div style={{ flex: 1 }} />

        {/* D-867: reanalisar, refazer a transcrição, auditar e abrir a pasta
            foram para o "Mais" do cabeçalho, com rótulo. Ficam aqui o gerar
            trechos e o TikTok, que são do fluxo (D-870 os leva ao rodapé). */}
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
          {/* Mesmo ícone da fileira, mas abre a escolha do provedor: aqui não
              cabe um grupo com texto sem quebrar o ritmo dos utilitários. */}
          <MenuDeIa
            rotulo="Gerar trechos de todos os cortes"
            icone={ICONE_DO_CONCEITO.iaGera}
            ocupado={analisarDesviosTodos.disparado}
            desabilitado={cortes.length === 0}
            onGerar={dispararTrechosTodos}
            classeGatilho="h-[26px] w-[26px]"
            // A fileira mora na borda direita: abrindo para a direita, o menu vazava da tela.
            alinhamento="direita"
          />
          <Utilitario
            icone={ICONE_DO_CONCEITO.publicar}
            titulo="Subir para o TikTok (robô ou pacote)"
            cor="var(--mute)"
            onClick={() => setTiktokAberto(true)}
          />
        </span>
        {/* D-870: o Publicar desceu para o rodapé, onde mora o próximo passo
            da live (rodapeDoWorkspace). */}
      </div>

      {/* D-746: a análise da live só aparecia dentro do modal — fechado, não
          havia sinal de que a IA estava trabalhando. */}
      {analisando ? (
        <div
          className="card"
          style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 12px' }}
        >
          <Icon name="brain" style={{ color: 'var(--info)' }} />
          <b style={{ fontSize: 12.5 }}>Analisando a live com a IA</b>
          <span style={{ fontSize: 12, color: 'var(--mute)' }}>
            os cortes propostos aparecem aqui quando terminar — pode seguir usando o app
          </span>
          <span style={{ flex: 1 }} />
          <Icon name="loader" style={{ color: 'var(--info)' }} />
        </div>
      ) : null}

      {progresso && (progresso.status === 'baixando' || progresso.status === 'transcrevendo') ? (
        <div
          className="card"
          style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 12px' }}
        >
          <Icon
            name={progresso.status === 'baixando' ? 'download' : 'captions'}
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
        {soNoAr ? <SeloNoAr total={linhas.length} onTirar={tirarFiltroNoAr} /> : null}
        <div style={{ flex: 1 }} />
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--dim)' }}>
          <kbd>A</kbd> aprova/devolve · <kbd>R</kbd> exclui · <kbd>J</kbd>
          <kbd>K</kbd> anda
        </span>
        <label className="fld" style={{ width: 200 }}>
          <Icon name="search" style={{ color: 'var(--dim)' }} />
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
            <Icon name="undo-2" />
            Devolver
          </button>
          <button
            type="button"
            className="btn"
            disabled={emLote}
            onClick={() => void aplicarEmLote('aprovar')}
            style={{ borderColor: 'var(--ok)', color: 'var(--ok)' }}
          >
            <Icon name={emLote ? 'loader' : 'check'} />
            Aprovar
          </button>
          <button
            type="button"
            className="btn btn-icon"
            onClick={() => setSelecionados(new Set())}
            title="Limpar a seleção"
            aria-label="Limpar a seleção"
          >
            <Icon name="x" />
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
            podeSubir={podeReordenar(busca, soNoAr) && i > 0}
            podeDescer={podeReordenar(busca, soNoAr) && i < linhas.length - 1}
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
            <Icon name="inbox" size={20} style={{ color: 'var(--dim)' }} />
            <span style={{ fontSize: 12.5, fontWeight: 700 }}>
              {listaVazia.texto}
            </span>
            {!listaVazia.ofereceAnalise ? null : (
              <button type="button" className="btn btn-pri" onClick={() => setAnaliseAberta(true)}>
                <Icon name="brain" />
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
        icon={ICONE_DO_CONCEITO.publicar}
        title={`Enviar o corte #${publicarDe?.numero ?? ''} ao YouTube`}
        width="600px"
        subtitle={
          canalAtivo
            ? `canal de destino: ${canalAtivo.nome} (${canalAtivo.handle})`
            : 'canal de destino: o canal ativo'
        }
        footerNote="público e sem desfazer pelo app"
        primaryLabel={agendarEm ? 'Agendar no YouTube' : 'Enviar ao YouTube agora'}
        primaryIcon={agendarEm ? 'clock' : ICONE_DO_CONCEITO.publicar}
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
        icon={ICONE_DO_CONCEITO.urlPublicada}
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
