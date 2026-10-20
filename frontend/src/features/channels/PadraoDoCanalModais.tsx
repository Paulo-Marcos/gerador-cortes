import { useQuery } from '@tanstack/react-query';
import { PosicionamentoModal } from '@/features/editor/fase2/PosicionamentoModal';
import { settingsApi } from '@/features/settings/api';
import { DefinirPalcoDoCanalModal } from '@/features/shorts/DefinirPalcoDoCanal';
import {
  DEFAULT_YOUTUBE_LAYOUT,
  normalizeYoutubeLayout,
  sharedConfigFromFull,
  type YoutubeLayout,
} from '@/shared/palco/youtubeLayout';
import type { AppSettings } from '@/types/models';
import type { TipoDoPadrao } from './EstiloDoCanal';

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

/**
 * D-946: o modal do padrão de cada tipo — o mesmo do ambiente de edição, no
 * modo canal: o horizontal no `PosicionamentoModal`, o short no `DefinirPalcoModal`.
 */
export function PadraoDoCanal({ tipo, onClose }: { tipo: TipoDoPadrao; onClose: () => void }) {
  return tipo === 'short' ? <DefinirPalcoDoCanalModal onClose={onClose} /> : <PadraoDoHorizontalNoCanal onClose={onClose} />;
}
