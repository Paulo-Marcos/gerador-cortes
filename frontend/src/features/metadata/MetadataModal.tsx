import { Modal } from '@/components/ui/modal';
import type { Corte } from '@/types/models';
import { MetadataCard } from './MetadataCard';

type Props = {
  open: boolean;
  projetoId: string;
  corte: Corte;
  onClose: () => void;
};

export function MetadataModal({ open, projetoId, corte, onClose }: Props) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Metadados — Corte #${corte.numero}`}
      description={corte.titulo_proposto}
      size="xl"
    >
      <MetadataCard projetoId={projetoId} cut={corte} />
    </Modal>
  );
}
