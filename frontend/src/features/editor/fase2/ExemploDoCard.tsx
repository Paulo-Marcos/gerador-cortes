import { Thumbnail } from '@remotion/player';
import { EstiloDasCenasProvider, FrameOffsetContext, SharedCardZoneFrame, renderCenaV2 } from '@video-renderer/public-api';
import type { CenaRemotion } from '@/types/models';
import type { YoutubeSharedRect } from '@/shared/palco/youtubeLayout';

// D-928: um card de exemplo desenhado sobre a prévia do modal de posição, com
// o mesmo código do vídeo (renderCenaV2) e a customização em rascunho — para
// ver, antes de salvar, como um card fica na zona ou no vídeo cheio.

const EXEMPLOS: Record<string, Record<string, unknown>> = {
  definicao_termo: { texto: 'Clericalismo', contexto: 'Doutrina que defende a influência do clero sobre o Estado.', subtexto: 's.m.' },
  card_informacao: { contexto: 'Contexto', texto: 'Franco tinha a Igreja como aliada', subtexto: 'A carta dos bispos legitimou o golpe.' },
  pergunta_transicao: { texto: 'E se a Igreja nunca tivesse apoiado Franco?' },
  ficha_biografica: { texto: 'Aristóteles', ano: '384-322 a.C.', contexto: 'Política' },
  marco_historico: { ano: '1936', texto: 'Começa a Guerra Civil Espanhola', contexto: 'Espanha' },
  citacao_autor: { texto: 'O homem está condenado a ser livre.', autor: 'Sartre', obra: 'O Ser e o Nada', ano: '1943' },
  destaque_numerico: { numero: '45,7%', contexto: 'dos eleitores do grupo', fonte: 'Datafolha' },
  enfase: { texto: 'based', subtexto: 'a palavra do dia' },
  comparativo_contraponto: { texto: 'Determinismo', subtexto: 'Livre-arbítrio' },
  lista_enumerada: { texto: 'Três alianças', itens: [{ titulo: 'Igreja aliada' }, { titulo: 'Nacional-catolicismo' }] },
  linha_tempo: { texto: 'Espanha', marcos: [{ data: '1931', titulo: 'República' }, { data: '1936', titulo: 'Guerra' }, { data: '1975', titulo: 'Morte de Franco' }] },
  fonte_referencia: { fonte: 'Stanford Encyclopedia of Philosophy' },
  barra_inferior: { texto: 'Rodrigo', subtexto: 'Insider' },
  tela_cheia: { contexto: 'A tese', texto: 'Não é fé. É poder com batina.' },
  chamada_final: { texto: 'A live completa está no canal', subtexto: '@canal' },
  pergunta_chat: { autor: '@Fulano_de_Tal', texto: 'o Franco era fascista mesmo?' },
};

/** Os tipos que têm exemplo (todos os que o renderer desenha). */
export const TIPOS_COM_EXEMPLO = Object.keys(EXEMPLOS);

const FPS = 30;
const DURACAO_SEG = 5;
/** O quadro mostrado: depois da entrada do card, antes da saída. */
const QUADRO_DO_EXEMPLO = 75;

/** A cena de exemplo do tipo: na zona dos cards (compartilhada) ou sobre o vídeo cheio. */
export function cenaDeExemplo(tipo: string, zona: YoutubeSharedRect | null): CenaRemotion {
  const naZona = zona ? { layout_card: 'vertical', layout_youtube_modo: 'compartilhada', layout_card_zone: zona } : {};
  return { tipo, inicio: 0, fim: DURACAO_SEG, modelo_cena: 'card', ...EXEMPLOS[tipo], ...naZona } as unknown as CenaRemotion;
}

interface PropsDoExemplo extends Record<string, unknown> {
  cena: CenaRemotion;
  estiloCenas: Record<string, unknown>;
}

function ExemploNoQuadro({ cena, estiloCenas }: PropsDoExemplo) {
  return (
    <EstiloDasCenasProvider valor={estiloCenas}>
      <FrameOffsetContext.Provider value={0}>
        <SharedCardZoneFrame cena={cena}>{renderCenaV2(cena)}</SharedCardZoneFrame>
      </FrameOffsetContext.Provider>
    </EstiloDasCenasProvider>
  );
}

/** O card desenhado em 1920x1080; quem chama escala junto com o palco. */
export function ExemploDoCard({ cena, estiloCenas }: PropsDoExemplo) {
  return (
    <Thumbnail
      component={ExemploNoQuadro}
      inputProps={{ cena, estiloCenas }}
      compositionWidth={1920}
      compositionHeight={1080}
      frameToDisplay={QUADRO_DO_EXEMPLO}
      durationInFrames={DURACAO_SEG * FPS}
      fps={FPS}
      style={{ width: 1920, height: 1080 }}
    />
  );
}

/** A escolha do card de exemplo (nenhum = a prévia sem card). */
export function EscolhaDoExemplo({
  tipos,
  valor,
  onEscolher,
}: {
  tipos: ReadonlyArray<{ id: string; nome: string }>;
  valor: string;
  onEscolher: (tipo: string) => void;
}) {
  return (
    <label className="grid gap-1 text-xs font-medium text-text-300">
      Card de exemplo na prévia
      <select
        aria-label="Card de exemplo"
        value={valor}
        onChange={(e) => onEscolher(e.target.value)}
        className="h-8 rounded-[var(--radius-xs)] border border-[var(--wb-border)] bg-[var(--wb-bg-card)] px-2 text-[13px] text-[var(--wb-text)]"
      >
        <option value="">Nenhum</option>
        {tipos
          .filter((t) => TIPOS_COM_EXEMPLO.includes(t.id))
          .map((t) => (
            <option key={t.id} value={t.id}>
              {t.nome}
            </option>
          ))}
      </select>
    </label>
  );
}
