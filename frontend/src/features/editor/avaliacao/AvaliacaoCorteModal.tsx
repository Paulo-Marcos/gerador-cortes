import { useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toaster';
import { AvaliacaoCorteForm, RASCUNHO_VAZIO, type RascunhoAvaliacao } from './AvaliacaoCorteForm';
import { useAvaliacaoCorte, useSalvarAvaliacaoCorte } from './useAvaliacaoCorte';

/**
 * D-419: avaliação da qualidade de um corte.
 *
 * Abre sozinho no clique de "Gerar bruto" da 1ª vez — não quando o bruto fica
 * pronto: é no clique que o editor acabou de assistir e ajustar as bordas, com
 * o corte no pico da memória. A geração já foi disparada e corre em segundo
 * plano; nada aqui a bloqueia, e fechar sem responder não perde o vídeo.
 *
 * O mesmo modal serve para ajustar depois (botão "Avaliar" na Pós-produção):
 * ele carrega a avaliação existente, então reabrir mostra a nota atual em vez
 * de um formulário em branco.
 */
interface AvaliacaoCorteModalProps {
  open: boolean;
  onClose: () => void;
  corteId: string;
  tituloCorte?: string;
  /** Texto sob o título; a 1ª vez explica que o bruto está sendo gerado. */
  descricao?: string;
}

export function AvaliacaoCorteModal({
  open,
  onClose,
  corteId,
  tituloCorte,
  descricao,
}: AvaliacaoCorteModalProps) {
  const { notify } = useToast();
  const avaliacao = useAvaliacaoCorte(open ? corteId : undefined);
  const salvar = useSalvarAvaliacaoCorte(corteId);
  const [rascunho, setRascunho] = useState<RascunhoAvaliacao>(RASCUNHO_VAZIO);

  // Semeia o rascunho UMA vez por abertura, com o que está gravado (vazio na 1ª
  // vez). Sem a trava, um refetch do react-query com o modal aberto — foco na
  // janela, invalidação — trocaria a referência de `data` e apagaria por cima
  // do que o editor está digitando.
  const semeado = useRef(false);
  const { data: avaliacaoAtual, isLoading } = avaliacao;
  useEffect(() => {
    if (!open) {
      semeado.current = false;
      return;
    }
    if (semeado.current || isLoading) return;
    semeado.current = true;
    setRascunho(
      avaliacaoAtual
        ? {
            voto: avaliacaoAtual.voto,
            motivos: avaliacaoAtual.motivos,
            comentario: avaliacaoAtual.comentario,
          }
        : RASCUNHO_VAZIO,
    );
  }, [open, isLoading, avaliacaoAtual]);

  function confirmar() {
    if (!rascunho.voto) return;
    salvar.mutate(
      { voto: rascunho.voto, motivos: rascunho.motivos, comentario: rascunho.comentario },
      {
        onSuccess: () => {
          notify('Avaliação registrada.', { tone: 'success' });
          onClose();
        },
        onError: (err) =>
          notify(err instanceof Error ? err.message : 'Falha ao salvar avaliação.', {
            tone: 'error',
          }),
      },
    );
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="md"
      title="Como ficou esse corte?"
      description={descricao ?? tituloCorte}
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Agora não
          </Button>
          <Button size="sm" onClick={confirmar} disabled={!rascunho.voto || salvar.isPending}>
            {salvar.isPending && <Loader2 className="animate-spin" aria-hidden />}
            Salvar avaliação
          </Button>
        </>
      }
    >
      <AvaliacaoCorteForm rascunho={rascunho} onChange={setRascunho} />
    </Modal>
  );
}
