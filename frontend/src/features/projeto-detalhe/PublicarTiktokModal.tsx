import { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { exportStatusKey } from '@/shared/chavesDeCache';
import { useMutation } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  PASSO_EM_SEGUNDOS,
  sugestaoDeHorario,
} from '@/features/shorts/agendamentoDoLote';
import { Modal } from '@/components/ui/modal';
import { cn } from '@/lib/utils';
import { resolveThumbUrl } from '@/lib/api';
import { shortsApi, type EnvioAssistido } from '@/features/shorts/shortsApi';
import type { StatusExportCorte } from '@/types/models';
import { pendentesNoTiktok } from './listasDePublicacao';
import { LoteDoTiktokHorizontal } from './LoteDoTiktokHorizontal';
import { Icon } from '@/upgrade/Icon';

// D-510/D-516/D-517: o TikTok horizontal, no workspace do projeto.
//
// ## A lista é por VÍDEO PRONTO, não por "falta publicar no YouTube"
//
// A primeira versão reusou `cortesProntos`, a lista do botão do YouTube — que
// exclui o que já subiu, porque o YouTube não republica. Para o TikTok isso é o
// avesso do certo: o corte que acabou de ir para o YouTube é justamente o que
// tem MP4 e ainda falta aqui. O sintoma foi exato: os cortes SUMIAM da lista do
// TikTok conforme eram publicados no YouTube.
//
// Agora o critério é ter vídeo final, e o estado dos dois destinos aparece na
// linha como contexto. Filtro e informação são coisas diferentes: uma tira da
// vista, a outra ajuda a decidir.
//
// ## O "em massa" (D-799)
//
// O YouTube publica N cortes numa tacada porque tem API. O TikTok não: cliente
// sem auditoria só posta SELF_ONLY. Por isso o lote é o ROBÔ, em sequência, no
// Chrome do operador — ver `LoteDoTiktokHorizontal`. O login continua sendo
// dele, uma vez só; o robô nunca vê senha.
//
// Cada linha segue com os botões avulsos: "Assistido" para um corte só, e
// "Só o pacote", que abre a pasta, a aba e copia a legenda DAQUELE corte.
//
// ## A capa (D-518)
//
// O TikTok deixa escolher a capa no upload e, sem escolha, congela um frame
// qualquer do vídeo. O corte já tem uma imagem feita — a mesma do YouTube —, e
// ela agora vai dentro da pasta do pacote. A miniatura aqui é conferência: ver
// QUAL imagem vai subir antes de abrir o explorador, e saber quando não há
// nenhuma.

interface Props {
  open: boolean;
  onClose: () => void;
  /** Para montar a URL da capa, que o backend serve em `/videos/<projeto>/…`. */
  projetoId: string;
  /** Cortes com MP4 final — o único requisito para montar um pacote. */
  cortes: StatusExportCorte[];
}

export function PublicarTiktokModal({ open, onClose, projetoId, cortes }: Props) {
  // Preparados NESTA sessão do modal. O que foi confirmado como publicado vem
  // do servidor (`tiktok_publicado_em`) e sobrevive a fechar e reabrir; o
  // "pacote montado" não precisa sobreviver — refazer é barato.
  const [preparados, setPreparados] = useState<Record<string, boolean>>({});
  // D-580: uma data para o modal inteiro, e não uma por linha. O operador vem
  // aqui com uma janela em mente ("solta às 19h") e manda os cortes um a um; um
  // campo por linha seria a mesma data digitada N vezes.
  const [agendarPara, setAgendarPara] = useState('');
  // D-834: o "publicar sozinho" era só do lote; agora vale para cada corte também.
  const [publicarSozinho, setPublicarSozinho] = useState(false);
  const envio = { agendarPara, publicarSozinho };

  const pendentes = useMemo(() => pendentesNoTiktok(cortes), [cortes]);
  const marcarPreparado = (corteId: string) =>
    setPreparados((atual) => ({ ...atual, [corteId]: true }));

  return (
    <Modal open={open} onClose={onClose} title="TikTok — cortes horizontais">
      <div className="space-y-3">
        <p className="text-[12px] leading-relaxed text-[var(--wb-text-mute)]">
          O TikTok aceita 16:9, e o MP4 já existe — é o mesmo que foi para o YouTube, sem
          render novo. O robô sobe pelo navegador dele, fora da tela; a API deles só publica em
          modo privado enquanto o app não passar pela auditoria.
        </p>

        {cortes.length === 0 ? (
          <p className="rounded-[8px] bg-[var(--wb-bg-inset)] p-3 text-[12px] text-[var(--wb-text-mute)]">
            Nenhum corte com vídeo final ainda. O pacote sai do MP4 exportado.
          </p>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2 rounded-[8px] bg-[var(--wb-bg-inset)] px-2.5 py-2">
              <label className="flex items-center gap-1.5 text-[11.5px] text-[var(--wb-text-dim)]">
                <input
                  type="checkbox"
                  checked={Boolean(agendarPara)}
                  onChange={(e) => setAgendarPara(e.target.checked ? sugestaoDeHorario() : '')}
                />
                Marcar dia e hora
              </label>
              {Boolean(agendarPara) && (
                <>
                  <Input
                    type="datetime-local"
                    value={agendarPara}
                    step={PASSO_EM_SEGUNDOS}
                    onChange={(e) => setAgendarPara(e.target.value)}
                    className="w-[210px]"
                  />
                  <span className="text-[11px] leading-relaxed text-[var(--wb-text-mute)]">
                    O robô liga o “Programar” no Studio e marca a data antes de devolver a aba.
                    Vale para os cortes que você mandar daqui pra frente.
                  </span>
                </>
              )}
              <label className="flex w-full items-center gap-1.5 text-[11.5px] text-[var(--wb-text-dim)]">
                <input
                  type="checkbox"
                  checked={publicarSozinho}
                  onChange={(e) => setPublicarSozinho(e.target.checked)}
                />
                Publicar sozinho — o robô aperta Publicar, e só nos cortes cuja capa entrou. Vale
                para o lote e para o botão Assistido de cada corte.
              </label>
            </div>

            <LoteDoTiktokHorizontal
              projetoId={projetoId}
              pendentes={pendentes}
              envio={envio}
              onPreparado={marcarPreparado}
            />

            <ul className="max-h-[50vh] space-y-1.5 overflow-y-auto">
              {cortes.map((corte) => (
                <LinhaDoCorte
                  key={corte.corte_id}
                  corte={corte}
                  projetoId={projetoId}
                  preparado={Boolean(preparados[corte.corte_id])}
                  envio={envio}
                  onPreparado={() => marcarPreparado(corte.corte_id)}
                />
              ))}
            </ul>
          </>
        )}
      </div>
    </Modal>
  );
}

function LinhaDoCorte({
  corte,
  projetoId,
  preparado,
  envio,
  onPreparado,
}: {
  corte: StatusExportCorte;
  projetoId: string;
  preparado: boolean;
  envio: EnvioAssistido;
  onPreparado: () => void;
}) {
  const [copiada, setCopiada] = useState(false);
  const [confirmadoAgora, setConfirmadoAgora] = useState(false);
  const publicado = Boolean(corte.tiktok_publicado_em) || confirmadoAgora;
  const capa = resolveThumbUrl(projetoId, corte.thumbnail_path);

  const confirmar = useMutation({
    mutationFn: () => shortsApi.confirmarTiktokHorizontal(corte.corte_id),
    onSuccess: () => setConfirmadoAgora(true),
  });

  // D-540: o robô do D-537, no lugar onde o operador realmente publica.
  //
  // Ele nasceu num componente que NENHUMA tela renderiza — o botão existia, os
  // testes passavam, e a tela seguia com os dois manuais. Um botão que não está
  // montado é indistinguível de um botão que não existe.
  const assistido = useMutation({
    mutationFn: () => shortsApi.assistidoTiktokHorizontal(corte.corte_id, envio),
    onSuccess: (dados) => (dados.publicado ? setConfirmadoAgora(true) : onPreparado()),
  });

  // D-546: depois que a aba fica pronta, o backend continua de olho nela. Aqui
  // só perguntamos ao servidor de tempos em tempos se ele já viu a publicação.
  //
  // Perguntar é mais simples que ser avisado, e o custo é uma requisição a cada
  // cinco segundos enquanto UMA linha espera. Um canal de tempo real para isso
  // seria infra nova para transportar um booleano que muda uma vez.
  const esperandoPublicar = assistido.isSuccess && assistido.data.vigiando && !publicado;
  const cliente = useQueryClient();
  useEffect(() => {
    if (!esperandoPublicar) return;
    const relogio = setInterval(() => {
      void cliente.invalidateQueries({ queryKey: exportStatusKey(projetoId) });
    }, 5000);
    return () => clearInterval(relogio);
  }, [esperandoPublicar, cliente, projetoId]);

  const abrir = useMutation({
    mutationFn: () => shortsApi.stagingTiktokHorizontal(corte.corte_id),
    onSuccess: async (dados) => {
      const legenda = [dados.descricao, (dados.hashtags ?? []).join(' ')]
        .filter(Boolean)
        .join('\n\n');
      try {
        if (legenda) {
          await navigator.clipboard.writeText(legenda);
          setCopiada(true);
        }
      } catch {
        // Área de transferência negada (foco, permissão). O texto está no
        // `pacote.txt` da pasta que acabou de abrir — o operador não fica sem
        // ele, só não ganha o atalho.
        setCopiada(false);
      }
      onPreparado();
      // A aba por último: abrir antes tira o foco da página, e a API de
      // clipboard exige documento em foco.
      window.open(dados.url_upload, '_blank', 'noopener');
    },
  });

  return (
    <li
      className={cn(
        'flex flex-wrap items-center gap-2 rounded-[8px] border px-2.5 py-2',
        publicado
          ? 'border-wb-ok/40 bg-wb-ok-soft/30'
          : 'border-[var(--wb-border-soft)] bg-[var(--wb-bg-panel)]',
      )}
    >
      {/* D-518: a capa, que o pacote copia para dentro da pasta. Aqui ela e
          conferencia — o operador ve QUAL imagem vai subir antes de abrir o
          explorador, e o clique abre a imagem inteira numa aba. */}
      {capa ? (
        <a
          href={capa}
          target="_blank"
          rel="noopener noreferrer"
          title="Ver a capa em tamanho real. Ela tambem vai na pasta do pacote."
          className="shrink-0 overflow-hidden rounded-[4px] border border-[var(--wb-border-soft)]"
        >
          <img src={capa} alt="" className="h-[24px] w-[42px] object-cover" />
        </a>
      ) : (
        <span
          className="inline-flex shrink-0 items-center gap-1 text-[11px] text-[var(--wb-warn-ink)]"
          title="Sem thumbnail gerada: o TikTok vai congelar um frame qualquer do video."
        >
          <Icon name="image-off" />
          sem capa
        </span>
      )}
      <span className="font-code text-[11px] text-[var(--wb-text-mute)]">#{corte.numero}</span>
      <span className="min-w-0 flex-1 truncate text-[12px]">{corte.titulo || 'sem título'}</span>

      {/* D-516: o estado do YouTube é CONTEXTO, não filtro. Saber que o corte já
          subiu lá ajuda a decidir a ordem aqui; escondê-lo por isso era o bug. */}
      {corte.youtube_url_publicado && (
        <span
          className="inline-flex items-center gap-1 text-[11px] text-[var(--wb-text-dim)]"
          title="Já publicado no YouTube"
        >
          <Icon name="youtube" />
          no YouTube
        </span>
      )}

      {publicado ? (
        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[var(--wb-ok-ink)]">
          <Icon name="check" />
          publicado no TikTok
        </span>
      ) : (
        <>
          {preparado && !abrir.isPending && (
            <span
              className="inline-flex items-center gap-1 text-[11px] text-[var(--wb-text-mute)]"
              title={copiada ? 'Legenda copiada' : 'A legenda está no pacote.txt'}
            >
              <Icon name="check" />
              pacote pronto
            </span>
          )}
          {/* O assistido vem primeiro e em destaque: é o caminho normal. O
              manual fica ao lado porque depende de seletores de uma página que
              não é nossa — no dia em que o TikTok redesenhar o Studio, ele é o
              que continua funcionando. */}
          <Button
            size="sm"
            disabled={assistido.isPending || abrir.isPending}
            onClick={() => assistido.mutate()}
            title="Sobe o vídeo, escreve a legenda e põe a capa no navegador do robô. Só publica com “Publicar sozinho” ligado."
          >
            {assistido.isPending ? <Icon name="loader-2" className="animate-spin" /> : <Icon name="bot" />}
            {assistido.isPending ? 'subindo…' : 'Assistido'}
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={abrir.isPending || assistido.isPending}
            onClick={() => abrir.mutate()}
            title="Só monta o pacote, abre a pasta, copia a legenda e abre a aba. Você sobe à mão."
          >
            {abrir.isPending ? <Icon name="loader-2" className="animate-spin" /> : <Icon name="package" />}
            {preparado ? 'abrir' : 'Só o pacote'}
          </Button>
          {/* D-546: continua aqui como retaguarda. A vigilia devolve "nao sei"
              tanto para "nao publicou" quanto para "nao consegui ver" — aba
              fechada, meia hora de espera — e nesses casos a marca precisa de
              alguem que SAIBA. Errar para menos custa este clique; errar para
              mais apaga o MP4, porque a marca libera a limpeza (D-512). */}
          <Button
            size="sm"
            variant="secondary"
            disabled={confirmar.isPending}
            onClick={() => confirmar.mutate()}
            title="Libera a limpeza automática deste MP4. Sem isto ele fica no disco."
          >
            {confirmar.isPending ? <Icon name="loader-2" className="animate-spin" /> : <Icon name="check" />}
            publiquei
          </Button>
        </>
      )}

      {assistido.isPending && (
        <span className="w-full text-[11px] leading-relaxed text-[var(--wb-text-mute)]">
          Subindo no navegador do robô, fora da tela… num corte longo o TikTok leva minutos para
          processar. Quando a aba ficar pronta, a janela volta para a tela.
        </span>
      )}
      {assistido.isSuccess && (
        <span className="inline-flex w-full flex-wrap items-center gap-1 text-[11px] text-[var(--wb-text-mute)]">
          {esperandoPublicar ? (
            <>
              <Icon name="loader-2" className="animate-spin" />
              Pronto na aba. Revise e clique em <strong>Publicar</strong> — daqui eu vejo e marco
              sozinho.
            </>
          ) : (
            <>
              <Icon name="check" className="text-[var(--wb-ok-ink)]" />
              Pronto para conferir: {assistido.data.resumo}.
            </>
          )}
          {(assistido.data.avisos ?? []).map((aviso) => (
            <span key={aviso} className="text-[var(--wb-warn-ink)]">
              {aviso}
            </span>
          ))}
        </span>
      )}
      {assistido.isError && (
        <span className="w-full text-[11px] leading-relaxed text-[var(--wb-warn-ink)]">
          {(assistido.error as Error)?.message ?? 'não consegui subir'}
        </span>
      )}
      {abrir.isSuccess && abrir.data?.erro_ao_abrir && (
        <span className="w-full text-[11px] text-[var(--wb-warn-ink)]">
          Não consegui abrir a pasta: {abrir.data.pasta}
        </span>
      )}
      {abrir.isError && (
        <span className="w-full text-[11px] text-[var(--wb-warn-ink)]">
          {(abrir.error as Error)?.message ?? 'não consegui montar o pacote'}
        </span>
      )}
      {abrir.isSuccess && !publicado && (
        <span className="inline-flex w-full items-center gap-1 text-[11px] text-[var(--wb-text-mute)]">
          <Icon name="external-link" />
          arraste o MP4 na aba que abriu e confirme em “publiquei”
        </span>
      )}
    </li>
  );
}
