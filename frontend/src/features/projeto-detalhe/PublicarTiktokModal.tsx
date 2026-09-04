import { useMemo, useState } from 'react';
import { Check, ExternalLink, ImageOff, Loader2, Package, Send, Youtube } from 'lucide-react';
import { useMutation } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { cn } from '@/lib/utils';
import { resolveThumbUrl } from '@/lib/api';
import { shortsApi } from '@/features/shorts/shortsApi';
import type { StatusExportCorte } from '@/types/models';
import { pendentesNoTiktok } from './listasDePublicacao';

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
// ## Por que o "em massa" só prepara
//
// O YouTube publica N cortes numa tacada porque tem API. O TikTok não: cliente
// sem auditoria só posta SELF_ONLY, e automatizar o login viola os Termos — o
// risco não é a macro falhar, é a CONTA ser banida.
//
// E há um limite físico: a pasta do pacote é POR CORTE. Não existe pasta-mãe
// para abrir uma vez só, e abrir dez exploradores com dez abas seria pior que
// fazer à mão. Então o lote faz o trabalho repetitivo — montar as pastas e
// escrever a legenda de cada uma — e para aí.
// O upload segue um por vez, e o botão de cada linha abre a pasta, a aba e
// copia a legenda DAQUELE corte, que é a única forma de a área de transferência
// ter a legenda certa.
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
  const [quantidade, setQuantidade] = useState(0);

  const pendentes = useMemo(() => pendentesNoTiktok(cortes), [cortes]);
  const alvo = quantidade > 0 ? quantidade : pendentes.length;

  const lote = useMutation({
    mutationFn: async () => {
      const fila = pendentes.slice(0, alvo);
      for (const corte of fila) {
        // Em série, e não em paralelo. O pacote não copia o MP4 — aponta para
        // ele —, então o ganho de disparar tudo junto seria pequeno, e o custo
        // é grande: numa rajada de dez chamadas, uma que falhe não diz qual
        // corte ficou sem pasta. Em fila, o `preparados` marca linha a linha e
        // o erro para exatamente onde parou.
        // `abrir_pasta: false` — no lote ninguém quer dez exploradores.
        await shortsApi.stagingTiktokHorizontal(corte.corte_id, { abrirPasta: false });
        setPreparados((atual) => ({ ...atual, [corte.corte_id]: true }));
      }
      return fila.length;
    },
  });

  return (
    <Modal open={open} onClose={onClose} title="TikTok — cortes horizontais">
      <div className="space-y-3">
        <p className="text-[12px] leading-relaxed text-[var(--wb-text-mute)]">
          O TikTok aceita 16:9, e o MP4 já existe — é o mesmo que foi para o YouTube, sem
          render novo. <strong>O envio é manual</strong>: a API só publica em modo privado
          enquanto o app não passar pela auditoria deles.
        </p>

        {cortes.length === 0 ? (
          <p className="rounded-[8px] bg-[var(--wb-bg-inset)] p-3 text-[12px] text-[var(--wb-text-mute)]">
            Nenhum corte com vídeo final ainda. O pacote sai do MP4 exportado.
          </p>
        ) : (
          <>
            {/* D-517: o lote monta os pacotes; o upload continua um por vez. */}
            <div className="flex flex-wrap items-center gap-2 rounded-[9px] border border-[var(--wb-border)] bg-[var(--wb-bg-panel)] px-2.5 py-2">
              <label className="flex items-center gap-1.5 text-[12px]">
                Preparar
                <Input
                  type="number"
                  min={1}
                  max={pendentes.length}
                  value={quantidade || ''}
                  placeholder={String(pendentes.length)}
                  onChange={(e) => setQuantidade(Number(e.target.value) || 0)}
                  className="h-7 w-[68px] text-center text-[12px]"
                  aria-label="Quantos pacotes preparar"
                />
                de {pendentes.length}
              </label>
              <Button
                size="sm"
                disabled={lote.isPending || pendentes.length === 0}
                onClick={() => lote.mutate()}
              >
                {lote.isPending ? <Loader2 className="animate-spin" /> : <Package />}
                {lote.isPending ? 'montando…' : 'Preparar pacotes'}
              </Button>
              <span className="text-[11px] leading-relaxed text-[var(--wb-text-mute)]">
                Monta as pastas de uma vez, sem abrir nada. Depois use “abrir” em cada linha
                para subir.
              </span>
              {lote.isError && (
                <span className="w-full text-[11px] text-[var(--wb-warn-ink)]">
                  {(lote.error as Error)?.message ?? 'não consegui montar os pacotes'}
                </span>
              )}
            </div>

            <ul className="max-h-[50vh] space-y-1.5 overflow-y-auto">
              {cortes.map((corte) => (
                <LinhaDoCorte
                  key={corte.corte_id}
                  corte={corte}
                  projetoId={projetoId}
                  preparado={Boolean(preparados[corte.corte_id])}
                  onPreparado={() =>
                    setPreparados((atual) => ({ ...atual, [corte.corte_id]: true }))
                  }
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
  onPreparado,
}: {
  corte: StatusExportCorte;
  projetoId: string;
  preparado: boolean;
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
          ? 'border-[var(--wb-ok)]/40 bg-[var(--wb-ok-soft)]/30'
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
          <ImageOff size={11} aria-hidden />
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
          <Youtube size={11} aria-hidden />
          no YouTube
        </span>
      )}

      {publicado ? (
        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[var(--wb-ok-ink)]">
          <Check size={11} aria-hidden />
          publicado no TikTok
        </span>
      ) : (
        <>
          {preparado && !abrir.isPending && (
            <span
              className="inline-flex items-center gap-1 text-[11px] text-[var(--wb-text-mute)]"
              title={copiada ? 'Legenda copiada' : 'A legenda está no pacote.txt'}
            >
              <Check size={11} aria-hidden />
              pacote pronto
            </span>
          )}
          <Button
            variant="outline"
            size="sm"
            disabled={abrir.isPending}
            onClick={() => abrir.mutate()}
            title="Monta o pacote se preciso, abre a pasta, copia a legenda e abre a aba de upload."
          >
            {abrir.isPending ? <Loader2 className="animate-spin" /> : <Send />}
            {preparado ? 'abrir' : 'Preparar'}
          </Button>
          <Button
            size="sm"
            variant="secondary"
            disabled={confirmar.isPending}
            onClick={() => confirmar.mutate()}
            title="Libera a limpeza automática deste MP4. Sem isto ele fica no disco."
          >
            {confirmar.isPending ? <Loader2 className="animate-spin" /> : <Check />}
            publiquei
          </Button>
        </>
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
          <ExternalLink size={11} aria-hidden />
          arraste o MP4 na aba que abriu e confirme em “publiquei”
        </span>
      )}
    </li>
  );
}
