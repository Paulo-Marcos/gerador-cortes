import { useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { EstiloNoModal } from '@/features/channels/EstiloNoModal';
import { PalcoDoTipoNoModal } from '@/features/channels/PalcoDoTipoNoModal';
import { RascunhoDoPalcoContext } from '@/features/channels/useChannels';
import { usePalcoDoModal } from '@/features/channels/usePalcoDoModal';
import { DEFAULT_YOUTUBE_BACKGROUND } from '@/shared/palco/youtubeLayout';
import { Secao } from './DefinirPalcoModal';
import { PalcoPrevia } from './PalcoPrevia';
import { tituloDoPalco } from './PalcoDoShortNoModal';
import { CabecalhoArrastavelNoShort, QUADRO_DO_SHORT } from './SecoesDoEstilo';
import type { PlanoDesenhavel, Retangulo } from './shortsApi';

// D-946: o `DefinirPalcoModal` no MODO CANAL, aberto pela tela de Canais.
//
// É o modo canal do horizontal (D-938) trazido para o short: a mesma moldura,
// a faixa do estilo e a prévia "como vai sair", mas só com o que é do PALCO DO
// CANAL. Arranjo, recortes, tamanho, moldura, textura, legenda e preset são
// campos de cada short — sem short não há onde gravá-los, como as telas, que o
// horizontal também esconde no canal. O estilo ativo decide a seção (D-960).
//
// A prévia não tem corte nem vídeo: desenha um palco de exemplo (tela em cima,
// pessoa embaixo) com as janelas vazias e rotuladas — é o que o horizontal faz
// sem vídeo. O que se julga aqui é o palco em volta delas: fundo, cabeçalho
// (que se arrasta na prévia, no limpo), contorno e sombra.
//
// Grava no Aplicar, como o modal leve que este substitui: mexer no canal muda
// todo short que herda dele, então não se grava a cada tecla como no corte.

const TELA: Retangulo = { x: 0, y: 352, w: 1080, h: 608 };
const PESSOA: Retangulo = { x: 0, y: 960, w: 1080, h: 960 };

const ROTULO: Record<string, string> = { tela: 'a tela compartilhada', pessoa: 'a pessoa' };

/** O palco de exemplo da prévia sem corte: a tela dividida, com a textura padrão. */
export function planoDeExemplo(): PlanoDesenhavel {
  const janelas = { tela: TELA, pessoa: PESSOA };
  const quadroDaLive = { x: 0, y: 0, w: 1920, h: 1080 };
  return {
    origem: 'exemplo',
    modelo: null,
    arranjo: 'dividida_empilhada',
    arranjos: [],
    regioes: { tela: quadroDaLive, pessoa: quadroDaLive },
    canvas: { ...QUADRO_DO_SHORT },
    fundo: '',
    fundo_editorial: DEFAULT_YOUTUBE_BACKGROUND,
    legenda_cor: '',
    legenda_fonte: '',
    legenda_x: 0,
    legenda_y: 0,
    legenda_largura: 0,
    gancho_cor: '',
    gancho_realce: '',
    gancho_ate_seg: 0,
    gancho_fonte: '',
    gancho_tamanho: 0,
    gancho_x: 0,
    gancho_y: 0,
    gancho_largura: 0,
    recortes: Object.entries(janelas).map(([regiao, janela]) => ({
      regiao,
      origem: quadroDaLive,
      destino: janela,
      recorta: janela,
      janela,
    })),
    slots: janelas,
    ajustados: [],
    moldura: 'palco',
    faixas: [],
  };
}

const PLANO_DE_EXEMPLO = planoDeExemplo();

/** As janelas do exemplo, vazias e rotuladas: sem vídeo, é onde ele entraria. */
function JanelasDeExemplo({ plano }: { plano: PlanoDesenhavel }) {
  const { largura, altura } = plano.canvas;
  return plano.recortes.map(({ regiao, janela }) => (
    <div
      key={regiao}
      className="pointer-events-none absolute flex items-center justify-center border border-dashed border-[var(--wb-border)]"
      style={{
        left: `${(janela.x / largura) * 100}%`,
        top: `${(janela.y / altura) * 100}%`,
        width: `${(janela.w / largura) * 100}%`,
        height: `${(janela.h / altura) * 100}%`,
      }}
    >
      <span className="rounded-full bg-[var(--wb-bg-panel)] px-2 py-0.5 text-[11px] text-[var(--wb-text-mute)]">
        {ROTULO[regiao] ?? regiao}
      </span>
    </div>
  ));
}

type PalcoDoCanal = ReturnType<typeof usePalcoDoModal>;

/** Cancelar não muda nada; Aplicar grava no palco do canal e fecha. */
export function RodapeDoCanal({ palco, onClose }: { palco: PalcoDoCanal; onClose: () => void }) {
  return (
    <div className="flex w-full justify-end gap-2">
      <Button type="button" variant="ghost" size="sm" onClick={onClose}>
        Cancelar
      </Button>
      <Button type="button" size="sm" disabled={!palco.mudou || palco.salvando} onClick={() => palco.aplicar(onClose)}>
        {palco.salvando ? 'Salvando…' : 'Aplicar e fechar'}
      </Button>
    </div>
  );
}

export function DefinirPalcoDoCanalModal({ onClose }: { onClose: () => void }) {
  const palco = usePalcoDoModal({ tipo: 'short', projetoId: undefined, alvo: 'canal', aberto: true });
  const quadroRef = useRef<HTMLDivElement>(null);
  // Sem vídeo: a prévia não pinta janela nenhuma, e o rótulo diz o que entraria ali.
  const semVideo = useRef<HTMLVideoElement>(null);
  return (
    <Modal
      open
      onClose={onClose}
      title="Definir o palco do short do canal"
      description="Vale para todo short do canal que não ajustou o próprio palco."
      size="2xl"
      footer={<RodapeDoCanal palco={palco} onClose={onClose} />}
    >
      <EstiloNoModal alvo="canal" estilo={palco.estilo} origem={palco.origem} onEstilo={palco.setEstilo} />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_260px]">
        <Secao numero={1} titulo={tituloDoPalco(palco.estilo)}>
          {palco.rascunho && palco.efetivo ? (
            <PalcoDoTipoNoModal tipo="short" rascunho={palco.rascunho} efetivo={palco.efetivo} onMudar={palco.mudar} />
          ) : (
            <p className="text-sm text-[var(--wb-text-mute)]">Carregando o palco…</p>
          )}
        </Secao>
        <div className="flex flex-col items-center gap-1 lg:sticky lg:top-0 lg:self-start">
          <span className="font-code text-[11px] uppercase tracking-[0.06em] text-[var(--wb-text-mute)]">
            como vai sair
          </span>
          <div className="w-full max-w-[220px]">
            <RascunhoDoPalcoContext.Provider value={palco.componentes}>
              <PalcoPrevia plano={PLANO_DE_EXEMPLO} video={semVideo} quadroRef={quadroRef}>
                <JanelasDeExemplo plano={PLANO_DE_EXEMPLO} />
                <CabecalhoArrastavelNoShort palco={palco} quadroRef={quadroRef} />
              </PalcoPrevia>
            </RascunhoDoPalcoContext.Provider>
          </div>
          <p className="text-center text-[11px] text-[var(--wb-text-mute)]">
            Um palco de exemplo: o vídeo de cada short entra nas janelas.
          </p>
        </div>
      </div>
    </Modal>
  );
}
