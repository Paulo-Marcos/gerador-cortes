// D-994: avisa na tela quando a sincronização do YouTube falha. Antes o erro só
// ia para o log e a aba seguia dizendo "Último sync: <data velha>" sem causa.
import { Icon } from '@/upgrade/Icon';
import type { YoutubeStatsStatus } from './api';

type Props = {
  falha: YoutubeStatsStatus['falha'];
  /** Última sincronização que deu certo (ISO), se houve. */
  sincronizadoEm: string | null;
};

export function AvisoFalhaSync({ falha, sincronizadoEm }: Props) {
  if (!falha) return null;
  return (
    <div
      role="alert"
      className="flex items-start gap-3 rounded-[var(--radius)] border border-wb-warn/40 bg-[var(--wb-bg-card)] p-4"
    >
      <Icon name="triangle-alert" size={20} className="mt-0.5 shrink-0 text-[var(--wb-warn)]" />
      <div className="text-[14px] text-[var(--wb-text-mute)]">
        <p className="font-medium text-[var(--wb-text)]">
          {falha.precisa_reautorizar ? 'Reautorização necessária' : 'A sincronização falhou'}
        </p>
        <p className="mt-1">{falha.mensagem}</p>
        <p className="mt-2 text-[13px] text-[var(--wb-text-dim)]">
          {sincronizadoEm
            ? `Última sincronização com sucesso: ${new Date(sincronizadoEm).toLocaleDateString('pt-BR')}.`
            : 'Nunca sincronizou com sucesso.'}
        </p>
      </div>
    </div>
  );
}
