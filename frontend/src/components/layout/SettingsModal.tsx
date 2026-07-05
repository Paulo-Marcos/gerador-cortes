import { AppSettingsControls } from '@/features/settings/AppSettingsControls';
import { Modal } from '@/components/ui/modal';

// Re-export para compat com quem importa LOG_OPTIONS daqui (ex.: testes).
export { LOG_OPTIONS } from '@/features/settings/AppSettingsControls';

interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
}

// Acesso rápido às configurações GLOBAIS (app_settings). A tela completa
// (globais + por canal) vive em Configurações; aqui é o atalho em modal.
export function SettingsModal({ open, onClose }: SettingsModalProps) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Ajustes"
      description="Preferencias globais do processamento"
      size="md"
    >
      <AppSettingsControls />
    </Modal>
  );
}
