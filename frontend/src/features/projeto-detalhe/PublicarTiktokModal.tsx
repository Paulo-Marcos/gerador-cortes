import { useState } from 'react';
import { Check, ExternalLink, Loader2, Send } from 'lucide-react';
import { useMutation } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { shortsApi } from '@/features/shorts/shortsApi';
import type { StatusExportCorte } from '@/types/models';

// D-510: o TikTok horizontal ao lado da publicação em massa, no workspace do
// projeto — que é onde a publicação do horizontal já mora.
//
// Estava na tela de Shorts (D-503), com a justificativa de que era onde o
// operador já olhava o corte. Justificativa errada: a tela de Shorts é sobre o
// VERTICAL, e um botão de horizontal ali é uma pista falsa toda vez que alguém
// abre a tela para outra coisa.
//
// ## Por que uma lista, e não um lote de verdade
//
// O YouTube publica N cortes numa tacada porque tem API para isso. O TikTok não:
// cliente sem auditoria só posta SELF_ONLY, e automatizar o login viola os
// Termos — o risco não é a macro falhar, é a CONTA ser banida.
//
// Então o "em massa" aqui é a LISTA: os cortes prontos reunidos, cada um a um
// clique de ter o pacote montado, a pasta aberta, a legenda copiada e a aba de
// upload na frente. O envio continua manual, um por vez, porque é o que o
// TikTok permite. O que a tela economiza é a procura, não o upload.

interface Props {
  open: boolean;
  onClose: () => void;
  cortesProntos: StatusExportCorte[];
}

export function PublicarTiktokModal({ open, onClose, cortesProntos }: Props) {
  const [enviados, setEnviados] = useState<Record<string, boolean>>({});

  return (
    <Modal open={open} onClose={onClose} title="TikTok — cortes horizontais">
      <div className="space-y-3">
        <p className="text-[12px] leading-relaxed text-[var(--wb-text-mute)]">
          O TikTok aceita 16:9, e o MP4 já existe — é o mesmo que foi para o YouTube, sem
          render novo. Cada botão monta o pacote, abre a pasta, copia a legenda e abre a
          aba de upload. <strong>O envio é manual</strong>: a API só publica em modo
          privado enquanto o app não passar pela auditoria deles.
        </p>

        {cortesProntos.length === 0 ? (
          <p className="rounded-[8px] bg-[var(--wb-bg-inset)] p-3 text-[12px] text-[var(--wb-text-mute)]">
            Nenhum corte com vídeo final ainda. O pacote sai do MP4 exportado.
          </p>
        ) : (
          <ul className="max-h-[50vh] space-y-1.5 overflow-y-auto">
            {cortesProntos.map((corte) => (
              <LinhaDoCorte
                key={corte.corte_id}
                corte={corte}
                enviado={Boolean(enviados[corte.corte_id])}
                onEnviado={() => setEnviados((atual) => ({ ...atual, [corte.corte_id]: true }))}
              />
            ))}
          </ul>
        )}
      </div>
    </Modal>
  );
}

function LinhaDoCorte({
  corte,
  enviado,
  onEnviado,
}: {
  corte: StatusExportCorte;
  enviado: boolean;
  onEnviado: () => void;
}) {
  const [copiada, setCopiada] = useState(false);

  const staging = useMutation({
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
      onEnviado();
      // A aba por último: abrir antes tira o foco da página, e a API de
      // clipboard exige documento em foco.
      window.open(dados.url_upload, '_blank', 'noopener');
    },
  });

  return (
    <li className="flex flex-wrap items-center gap-2 rounded-[8px] border border-[var(--wb-border-soft)] bg-[var(--wb-bg-panel)] px-2.5 py-2">
      <span className="font-code text-[11px] text-[var(--wb-text-mute)]">#{corte.numero}</span>
      <span className="min-w-0 flex-1 truncate text-[12px]">{corte.titulo || 'sem título'}</span>

      {enviado && !staging.isPending && (
        <span
          className="inline-flex items-center gap-1 text-[11px] text-[var(--wb-ok-ink)]"
          title={copiada ? 'Legenda copiada' : 'A legenda está no pacote.txt'}
        >
          <Check size={11} aria-hidden />
          pacote pronto
        </span>
      )}

      <Button
        variant={enviado ? 'ghost' : 'outline'}
        size="sm"
        disabled={staging.isPending}
        onClick={() => staging.mutate()}
        title="Monta o pacote, abre a pasta e a página de upload. O login é seu, no navegador."
      >
        {staging.isPending ? <Loader2 className="animate-spin" /> : <Send />}
        {enviado ? 'de novo' : 'Preparar'}
      </Button>

      {staging.isSuccess && staging.data?.erro_ao_abrir && (
        <span className="w-full text-[11px] text-[var(--wb-warn-ink)]">
          Não consegui abrir a pasta: {staging.data.pasta}
        </span>
      )}
      {staging.isError && (
        <span className="w-full text-[11px] text-[var(--wb-warn-ink)]">
          {(staging.error as Error)?.message ?? 'não consegui montar o pacote'}
        </span>
      )}
      {staging.isSuccess && (
        <span className="inline-flex items-center gap-1 text-[11px] text-[var(--wb-text-mute)]">
          <ExternalLink size={11} aria-hidden />
          arraste o MP4 na aba que abriu
        </span>
      )}
    </li>
  );
}
