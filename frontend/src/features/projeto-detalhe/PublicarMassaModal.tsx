import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Modal } from '@/components/ui/modal';
import { useQueryClient } from '@tanstack/react-query';
import { exportStatusKey } from '@/features/projeto-detalhe/useProjetoDetalhe';
import type { StatusExportCorte } from '@/types/models';
import { publicacaoApi } from '@/features/publicacao/api';
import type { ModoDeQuando } from '@/features/shorts/agendaDoLote';
import { notasDeAgendamento } from '@/features/shorts/agendamentoDoLote';
import { QuandoDoLote } from '@/features/shorts/QuandoDoLote';
import { useQuandoDoLote } from '@/features/shorts/useQuandoDoLote';
import { Icon, ICONE_DO_CONCEITO } from '@/upgrade/Icon';
import { pedirGavetaDaFila } from '@/upgrade/useGavetaDaFila';
import { pedidoDoLoteYoutube } from './pedidoDoLoteYoutube';

// D-934: o lote do YouTube longo respeita a janela do público, como o de shorts.
//
// Antes, a agenda era local: um horário digitado e 15 minutos entre um corte e
// outro, sem blocos, sem teto por dia e sem olhar o que já estava agendado. Agora
// ela vem do backend — os blocos do destino `youtube` na tela de Canais, a partir
// do último corte já marcado — e aparece antes do clique, ajustável por linha.

interface Props {
  open: boolean;
  onClose: () => void;
  projetoId: string;
  cortesProntos: StatusExportCorte[];
}

// Fora do componente: a agenda é chaveada por eles, e um array novo a cada
// render pediria a agenda de novo.
const PLATAFORMAS = ['youtube'];
const NOTAS = notasDeAgendamento(PLATAFORMAS, { tiktokAssistido: false, instagramAssistido: false });
// Sem "agora": o lote do YouTube sempre agendou, e N vídeos públicos de uma vez
// é a cadência que a janela existe para evitar.
const MODOS: ModoDeQuando[] = ['uma_data', 'distribuir'];

export function PublicarMassaModal({ open, onClose, projetoId, cortesProntos }: Props) {
  const totalProntos = cortesProntos.length;
  const [quantidade, setQuantidade] = useState(totalProntos);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  // D-746: depois de enfileirar, o lote NÃO pode ser enviado de novo — um
  // segundo clique duplicava os vídeos no canal. O rodapé vira só "Fechar".
  const [loteEnviado, setLoteEnviado] = useState(false);
  const qc = useQueryClient();

  useEffect(() => {
    if (!open) return;
    setQuantidade(totalProntos);
    setErro(null);
    setEnviando(false);
    setLoteEnviado(false);
  }, [open, totalProntos]);

  const escolhidos = useMemo(
    () => cortesProntos.slice(0, Math.max(0, Math.min(quantidade, totalProntos))),
    [cortesProntos, quantidade, totalProntos],
  );
  const alvos = useMemo(() => escolhidos.map((c) => `corte:${c.corte_id}`), [escolhidos]);
  const quando = useQuandoDoLote({
    alvos,
    plataformas: PLATAFORMAS,
    aberto: open,
    notas: NOTAS,
    modoInicial: 'distribuir',
  });
  const pedido = pedidoDoLoteYoutube(
    quando.modo,
    escolhidos.map((c) => c.corte_id),
    quando.linhas,
    quando.agendarPara,
  );
  const total = pedido.corte_ids.length;
  const rotuloDoAlvo = (alvoId: string) => {
    const corte = escolhidos.find((c) => c.corte_id === alvoId);
    return corte ? `#${corte.numero} ${corte.titulo_youtube || corte.titulo}` : alvoId;
  };

  const onPublicar = async () => {
    if (total === 0) return;
    setEnviando(true);
    setErro(null);
    // Backend segura a fila; o navegador só dispara o lote.
    try {
      // Com as datas no pedido, o backend ignora o ritmo antigo (por dia e hora).
      await publicacaoApi.bulkYoutube(projetoId, { ...pedido, videos_por_dia: total, hora_publicacao: '00:00' });
      setLoteEnviado(true);
      void qc.invalidateQueries({ queryKey: exportStatusKey(projetoId) });
      // D-897: os uploads já são jobs da fila; o modal sai da frente e a gaveta mostra o andamento.
      onClose();
      pedirGavetaDaFila();
    } catch (err) {
      setErro((err as Error).message);
    }
    setEnviando(false);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={
        <span className="flex items-center gap-2">
          <Icon name={ICONE_DO_CONCEITO.publicar} size={20} className="text-accent-300" /> Publicar em massa
        </span>
      }
      description="Cada corte cai num horário da janela do canal (tela de Canais), depois do último já agendado."
    >
      {totalProntos === 0 ? (
        <div className="rounded-[var(--radius-sm)] border border-[var(--border)] bg-bg-900/60 p-4 text-center text-sm text-text-300">
          Nenhum corte pronto para publicar no momento.
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex w-1/2 flex-col gap-1.5">
            <Label htmlFor="qtd">Quantidade (máx. {totalProntos})</Label>
            <Input
              id="qtd"
              type="number"
              min={1}
              max={totalProntos}
              value={quantidade}
              onChange={(e) =>
                setQuantidade(Math.max(1, Math.min(totalProntos, Number(e.target.value) || 1)))
              }
              disabled={enviando}
            />
          </div>
          <QuandoDoLote {...quando.secao} modos={MODOS} rotuloDoAlvo={rotuloDoAlvo} />
          {erro && (
            <p role="alert" className="flex items-center gap-1 text-[12px] text-error">
              <Icon name="x-circle" /> {erro}
            </p>
          )}
        </div>
      )}

      <div className="mt-5 flex items-center justify-end gap-2">
        <Button
          type="button"
          variant={loteEnviado ? 'default' : 'ghost'}
          onClick={onClose}
          disabled={enviando}
        >
          {enviando ? 'Aguarde...' : 'Fechar'}
        </Button>
        {totalProntos > 0 && !loteEnviado && (
          <Button type="button" onClick={onPublicar} disabled={enviando || !quando.pronto || total === 0}>
            {enviando ? <Icon name="loader-2" size={16} className="animate-spin" /> : <Icon name={ICONE_DO_CONCEITO.publicar} size={16} />}
            Publicar {total} {total === 1 ? 'corte' : 'cortes'}
          </Button>
        )}
      </div>
    </Modal>
  );
}
