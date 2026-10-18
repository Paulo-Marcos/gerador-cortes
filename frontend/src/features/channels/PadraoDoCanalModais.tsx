import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { PosicionamentoModal } from '@/features/editor/fase2/PosicionamentoModal';
import { settingsApi } from '@/features/settings/api';
import {
  DEFAULT_YOUTUBE_LAYOUT,
  normalizeYoutubeLayout,
  sharedConfigFromFull,
  type YoutubeLayout,
} from '@/shared/palco/youtubeLayout';
import type { AppSettings } from '@/types/models';
import { PalcoDoTipoNoModal } from './PalcoDoTipoNoModal';
import { usePalcoDoModal } from './usePalcoDoModal';

// D-938: o padrão do canal se edita no MESMO modal do ambiente de edição,
// aberto pela tela de Canais no alvo `canal`: o rascunho é o palco do canal e
// "Aplicar" grava nele. As telas (recortes de cada vídeo) continuam no editor.

/** O layout global como base da prévia; sem nada salvo, o padrão do app. */
export function layoutGlobalDe(json: string | null | undefined): YoutubeLayout {
  if (!json || json === '{}') return DEFAULT_YOUTUBE_LAYOUT;
  try {
    return normalizeYoutubeLayout(JSON.parse(json));
  } catch {
    return DEFAULT_YOUTUBE_LAYOUT;
  }
}

/** O modo do Global como a cascata o lê: sem modo gravado, o padrão do app (D-966). */
export function modoDoGlobal(json: string | null | undefined) {
  return layoutGlobalDe(json).modo_padrao;
}

export function PadraoDoHorizontalNoCanal({ onClose }: { onClose: () => void }) {
  const { data: settings } = useQuery<AppSettings>({
    queryKey: ['app-settings'],
    queryFn: settingsApi.obterSettings,
    staleTime: 30_000,
  });
  if (!settings) return null;
  const json = settings.youtube_layout_padrao_global;
  const modo = modoDoGlobal(json);
  const layout = layoutGlobalDe(json);
  return (
    <PosicionamentoModal
      open
      onClose={onClose}
      mode={modo}
      initialConfig={modo === 'full' ? sharedConfigFromFull(layout.full) : layout.compartilhada}
      // O layout das telas não muda daqui: só o palco do canal, gravado no Aplicar.
      onSave={() => undefined}
      scopeLabel="Padrão do canal"
      videoSrc=""
      currentTime={0}
      fundo={layout.fundo}
      placa={layout.placa}
      fundoPlacaEditavel={false}
      alvoDoEstilo="canal"
    />
  );
}

export function PadraoDoShortNoCanal({ onClose }: { onClose: () => void }) {
  const palco = usePalcoDoModal({ tipo: 'short', projetoId: undefined, alvo: 'canal', aberto: true });
  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title="Padrão do short do canal"
      description="Vale para todo short do canal que não ajustou o próprio palco."
      footer={
        <div className="flex w-full justify-end gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="button" size="sm" disabled={!palco.mudou || palco.salvando} onClick={() => palco.aplicar(onClose)}>
            {palco.salvando ? 'Salvando…' : 'Aplicar e fechar'}
          </Button>
        </div>
      }
    >
      {palco.rascunho && palco.efetivo ? (
        <PalcoDoTipoNoModal tipo="short" rascunho={palco.rascunho} efetivo={palco.efetivo} onMudar={palco.mudar} />
      ) : (
        <p className="text-sm text-[var(--wb-text-mute)]">Carregando o palco…</p>
      )}
    </Modal>
  );
}
