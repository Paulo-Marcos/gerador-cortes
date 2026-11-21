import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { metadataKey } from '@/features/metadata/useMetadataCard';
import { comVersao, resolveThumbUrl } from '@/lib/api';
import { metadadosApi } from '@/features/metadata/api/metadados';
import { copyTextToClipboard } from '@/lib/clipboard';
import { cn } from '@/lib/utils';
import type { Corte, StatusExportCorte } from '@/types/models';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { IconButton } from '@/components/ui/icon-button';
import { PELE_FLUTUANTE } from '@/components/ui/superficie-flutuante';
import { ICONE_DO_CONCEITO } from '@/upgrade/Icon';
import { montarTira } from '@/upgrade/tiraDoCorte';
import { TiraDoCorteAp } from '@/upgrade/TiraDoCorteAp';
import { statusExportPendente } from '@/features/publicacao/statusExport';
import { MetadataCard } from '@/features/metadata/MetadataCard';
import { useFocoDoModal } from '@/features/metadata/useFocoDoModal';

// ─────────────────────────────────────────────────────────────────
// D-746 · RODADA 3 · consultar o metadado de um corte sem sair da lista.
//
// O botão de metadados da linha fazia `navigate('/metadados')`: conferir
// o título de UM corte custava a lista inteira e a posição de rolagem.
// Consultar não é navegar — o modal mostra, e só o "Editar" leva à tela.
//
// D-767: com o corte em mãos, o modal traz o editor inteiro da tela de
// metadados (gerar título/prompt, escolher sugestão, colar/subir capa) — o
// operador trabalha sem perder a lista. Sem o corte, cai na consulta.
// ─────────────────────────────────────────────────────────────────

function Campo({ rotulo, valor, alto = false }: { rotulo: string; valor: string; alto?: boolean }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className="text-pequeno text-fg-2">{rotulo}</span>
      <div
        className={cn(
          'whitespace-pre-wrap break-words rounded-campo border border-fio bg-poco px-3 py-2 text-corpo',
          valor ? 'text-fg' : 'text-fg-3',
          alto && 'max-h-[120px] overflow-auto',
        )}
      >
        {valor || 'vazio'}
      </div>
    </div>
  );
}

/** R4: corte ainda sem linha no status de export — a tira sai toda pendente
 *  em vez de o modal não abrir. */
export function statusMinimo(corte: Corte): StatusExportCorte {
  return statusExportPendente({
    corte_id: corte.id,
    numero: corte.numero,
    titulo: corte.titulo_proposto,
  });
}

export function MetadadosDoCorteModal({
  projetoId,
  status,
  statusCorte,
  corte,
  aoFechar,
}: {
  projetoId: string;
  corte?: Corte;
  status: StatusExportCorte;
  statusCorte?: string;
  aoFechar: () => void;
}) {
  const navigate = useNavigate();
  const caixa = useRef<HTMLDivElement>(null);
  const [copiado, setCopiado] = useState(false);
  const [capaErro, setCapaErro] = useState(false);
  const meta = useQuery({
    queryKey: metadataKey(status.corte_id),
    queryFn: () => metadadosApi.obterMetadado(status.corte_id),
    enabled: !corte,
  });

  useFocoDoModal(caixa, aoFechar);

  const m = meta.data;
  const prompt = m?.prompt_thumbnail ?? '';
  const capa = comVersao(resolveThumbUrl(projetoId, m?.thumbnail_path || status.thumbnail_path), meta.dataUpdatedAt);

  const copiar = async () => {
    if (await copyTextToClipboard(prompt)) {
      setCopiado(true);
      window.setTimeout(() => setCopiado(false), 1400);
    }
  };

  // Portal para a `.ap`: aberto de dentro da linha do corte, o modal ficaria preso a ela.
  // Na `.ap` ele cobre a tela e continua com os tokens.
  const destino = document.querySelector('.ap') ?? document.body;
  return createPortal(
    <div
      role="presentation"
      onClick={aoFechar}
      className="fixed inset-0 z-[60] grid place-items-center bg-veu p-6"
    >
      <div
        ref={caixa}
        role="dialog"
        aria-modal="true"
        aria-label={`Metadados do corte ${status.numero}`}
        data-sala=""
        onClick={(e) => e.stopPropagation()}
        className={cn(
          'flex max-h-[calc(100dvh-48px)] flex-col overflow-hidden rounded-dialogo',
          PELE_FLUTUANTE,
          corte ? 'w-[min(1100px,100%)]' : 'w-[min(720px,100%)]',
        )}
      >
        <header className="flex items-center gap-3 border-b border-fio px-5 py-3">
          <Icon name="tags" size={16} className="flex-none text-iris" />
          <span className="flex min-w-0 flex-1 flex-col">
            <strong className="truncate text-linha text-fg">
              #{status.numero} · {status.titulo}
            </strong>
            <span className="text-pequeno text-fg-3">
              {corte
                ? 'metadados do corte — edite aqui; a lista atrás fica onde estava'
                : 'metadados do corte — só consulta; a lista atrás fica onde estava'}
            </span>
          </span>
          <IconButton variant="fantasma" size="pq" onClick={aoFechar} aria-label="Fechar" title="Fechar (Esc)">
            <Icon name="x" />
          </IconButton>
        </header>

        {corte ? (
          <div className="overflow-auto p-5">
            <MetadataCard
              projetoId={projetoId}
              cut={corte}
              status={status}
              variant="modal"
              onRequestClose={aoFechar}
            />
          </div>
        ) : (
          <div className="grid grid-cols-[minmax(0,1fr)_216px] gap-4 overflow-auto p-5">
            <div className="flex min-w-0 flex-col gap-3">
              {meta.isLoading ? (
                <span className="text-corpo text-fg-3" role="status">
                  Carregando…
                </span>
              ) : meta.isError ? (
                <span className="text-corpo text-erro" role="alert">
                  Não foi possível ler os metadados deste corte.
                </span>
              ) : (
                <>
                  <Campo rotulo="Título" valor={m?.titulo_youtube ?? ''} />
                  <Campo rotulo="Texto da capa" valor={m?.texto_capa ?? ''} />
                  <Campo rotulo="Descrição" valor={m?.descricao_youtube ?? ''} alto />
                  <Campo rotulo="Tags" valor={(m?.tags_youtube ?? []).join(', ')} />
                  <Campo rotulo="Prompt da capa" valor={prompt} alto />
                </>
              )}
            </div>

            <div className="flex flex-col gap-3">
              <div className="relative aspect-video overflow-hidden rounded-capa border border-fio-2 bg-vidro-3">
                {capa && !capaErro ? (
                  <img
                    src={capa}
                    alt=""
                    onError={() => setCapaErro(true)}
                    className="absolute inset-0 size-full object-cover"
                  />
                ) : (
                  <span className="absolute inset-0 grid place-items-center text-pequeno text-fg-3">sem capa</span>
                )}
              </div>
              <TiraDoCorteAp tira={montarTira(status, statusCorte)} />
            </div>
          </div>
        )}

        <footer className="flex items-center justify-end gap-2 border-t border-fio px-5 py-3">
          {corte ? null : (
            <Button
              type="button"
              variant="secundario"
              onClick={() => void copiar()}
              disabled={!prompt}
              title={prompt ? 'Copiar o prompt da capa' : 'Este corte ainda não tem prompt de capa'}
            >
              <Icon name={copiado ? 'check' : 'copy'} />
              {copiado ? 'Copiado' : 'Copiar prompt'}
            </Button>
          )}
          <Button type="button" variant="secundario" onClick={() => navigate(`/projetos/${projetoId}/metadados`)}>
            <Icon name={ICONE_DO_CONCEITO.editar} />
            {corte ? 'Abrir a tela de metadados' : 'Editar na tela de metadados'}
          </Button>
        </footer>
      </div>
    </div>,
    destino,
  );
}
