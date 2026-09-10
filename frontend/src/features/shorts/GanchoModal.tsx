import { useEffect, useState, type RefObject } from 'react';
import { Eraser, Loader2, Minus, Plus, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { cn } from '@/lib/utils';
import {
  contarPalavras,
  MAX_VARIACOES,
  DURACAO_MAX_SEG,
  DURACAO_MIN_SEG,
  DURACAO_PASSO_SEG,
  duracaoEfetiva,
  PALAVRAS_MAX,
  PALAVRAS_MIN,
  recadoDoTom,
  tomDoGancho,
  type TomDoGancho,
} from './ganchoDoShort';
import { GanchoPrevia } from './GanchoPrevia';
import { LegendaPrevia } from './LegendaPrevia';
import { PalcoPrevia } from './PalcoPrevia';
import { useSugerirGanchos } from './useShortsDoCorte';
import type { PalavraTranscrita, PlanoDesenhavel, ShortSugerido } from './shortsApi';

// D-565: onde o título-gancho é escrito.
//
// ## Por que um modal, e não campos no card
//
// Mesmo motivo da D-509 no palco: o card do candidato já foi uma parede de
// controles uma vez (D-492), e um campo de texto aberto em cinco cards ao mesmo
// tempo reconstrói exatamente essa parede.
//
// ## Por que a prévia fica ao lado
//
// Porque a dúvida real não é "que palavras escrever" — é SE ISSO POLUI. As
// cenas saíram do short por serem texto demais sobre uma fala que a legenda já
// escrevia (D-560), e o gancho corre o risco de ser lido como a volta delas com
// outro nome. Não é: é um só, ancorado no zero, e sai antes dos 3s. Mas isso se
// prova mostrando — o modal congela a prévia em meio segundo de short, com a
// legenda daquele instante junto, exatamente como o arquivo vai sair.

/** Onde a prévia congela: meio segundo dentro do short. */
const INSTANTE_DA_PREVIA_SEG = 0.5;

const TONS: Record<TomDoGancho, string> = {
  vazio: 'text-[var(--wb-text-mute)]',
  curto: 'text-[var(--wb-warn-ink,var(--wb-text-dim))]',
  ideal: 'text-[var(--wb-ok-ink,var(--wb-accent))]',
  longo: 'text-[var(--wb-warn-ink,var(--wb-text-dim))]',
};

interface Props {
  open: boolean;
  onClose: () => void;
  short: ShortSugerido;
  /** O plano do palco, quando há — a prévia desenha o short como ele sai. */
  plano: PlanoDesenhavel | null;
  /** O player do bruto: a prévia com palco desenha os quadros dele. */
  video: RefObject<HTMLVideoElement | null>;
  /** Palavras da transcrição, para mostrar a legenda que coexiste com o gancho. */
  palavras: PalavraTranscrita[];
  ocupado: boolean;
  onGravar: (texto: string, ateSeg: number) => void;
}

export function GanchoModal({
  open,
  onClose,
  short,
  plano,
  video,
  palavras,
  ocupado,
  onGravar,
}: Props) {
  // `?? ''` porque um backend ainda nao reiniciado nao manda o campo, e um
  // textarea que comeca `undefined` vira uncontrolled — o React reclama e o
  // campo para de responder ao estado a partir da primeira tecla.
  const [texto, setTexto] = useState(short.gancho_tela ?? '');
  const [ateSeg, setAteSeg] = useState(() => duracaoEfetiva(short.gancho_ate_seg));

  // Reabrir o modal em outro candidato tem de trazer o gancho DELE. Sem isto o
  // estado do anterior ficaria na tela e o operador salvaria o texto errado no
  // short errado — em silêncio, porque os dois campos parecem iguais.
  useEffect(() => {
    if (!open) return;
    setTexto(short.gancho_tela ?? '');
    setAteSeg(duracaoEfetiva(short.gancho_ate_seg));
    gerar.reset();
    // `gerar` fora das dependencias de proposito: a mutation muda de identidade
    // a cada resultado, e inclui-la faria este efeito rodar de novo logo apos
    // as variacoes chegarem — apagando-as no instante em que aparecem.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, short.id, short.gancho_tela, short.gancho_ate_seg]);

  const gerar = useSugerirGanchos();
  // Fechar o modal e reabrir noutro candidato nao pode manter as variacoes do
  // anterior na tela: elas foram escritas para OUTRO trecho.
  const variacoes = gerar.data?.variacoes ?? [];

  const tom = tomDoGancho(texto);
  const palavrasEscritas = contarPalavras(texto);
  const tempoDaPrevia = short.inicio_seg + INSTANTE_DA_PREVIA_SEG;

  const sobreposicoes = (
    <>
      <GanchoPrevia
        texto={texto}
        ateSeg={ateSeg}
        inicioSeg={short.inicio_seg}
        fimSeg={short.fim_seg}
        tempoAtualSeg={tempoDaPrevia}
      />
      {palavras.length > 0 && (
        <LegendaPrevia
          palavras={palavras}
          inicioSeg={short.inicio_seg}
          fimSeg={short.fim_seg}
          tempoAtualSeg={tempoDaPrevia}
        />
      )}
    </>
  );

  return (
    <Modal open={open} onClose={onClose} title="Escrever o gancho da abertura" size="2xl">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_260px]">
        <div className="space-y-4">
          <section className="space-y-2">
            <label
              htmlFor="gancho-texto"
              className="block text-[12.5px] font-semibold text-[var(--wb-text)]"
            >
              O que aparece nos primeiros segundos
            </label>
            <textarea
              id="gancho-texto"
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              rows={2}
              placeholder="ninguém te conta isso sobre juros"
              className="w-full resize-none rounded-[8px] border border-[var(--wb-border)] bg-[var(--wb-bg-inset)] px-2.5 py-2 font-display text-[15px] font-bold leading-snug text-[var(--wb-text)] outline-none focus:border-[var(--wb-accent)]"
            />
            <div className="flex items-baseline gap-2">
              <span className={cn('font-code text-[11px] tabular-nums', TONS[tom])}>
                {palavrasEscritas} {palavrasEscritas === 1 ? 'palavra' : 'palavras'}
                <span className="text-[var(--wb-text-mute)]">
                  {' '}
                  · alvo {PALAVRAS_MIN}–{PALAVRAS_MAX}
                </span>
              </span>
              <span className="text-[11.5px] leading-relaxed text-[var(--wb-text-dim)]">
                {recadoDoTom(tom)}
              </span>
            </div>
          </section>

          {/* D-565: o gerador. Ele PROPOE e nao grava — as variacoes ficam aqui
              ate um clique levar uma para o campo, onde ainda da para editar.
              O gancho e a promessa do short: escolher por ele seria a decisao
              mais editorial da tela tomada pela maquina. */}
          <section className="space-y-2 border-t border-[var(--wb-border-soft)] pt-3">
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={ocupado || gerar.isPending}
                onClick={() => gerar.mutate(short.id)}
              >
                {gerar.isPending ? <Loader2 className="animate-spin" /> : <Sparkles />}
                {gerar.isPending
                  ? 'escrevendo…'
                  : variacoes.length > 0
                    ? 'Gerar outras'
                    : `Gerar ${MAX_VARIACOES} variações`}
              </Button>
              {gerar.isPending && (
                <span className="text-[11.5px] text-[var(--wb-text-mute)]">
                  lendo a transcrição deste trecho…
                </span>
              )}
            </div>

            {gerar.isError && (
              <p className="text-[11.5px] leading-relaxed text-[var(--wb-text-dim)]">
                {(gerar.error as Error)?.message ?? 'não consegui gerar'}
              </p>
            )}

            {/* Sucesso com lista vazia NAO pode parecer botao quebrado: o
                modelo pode nao ter produzido nada aproveitavel, e isso e uma
                resposta, nao uma falha silenciosa. */}
            {gerar.isSuccess && variacoes.length === 0 && (
              <p className="text-[11.5px] leading-relaxed text-[var(--wb-text-dim)]">
                A IA não devolveu nada aproveitável desta vez. Tente de novo ou escreva o seu.
              </p>
            )}

            {variacoes.length > 0 && (
              <ul className="space-y-1">
                {variacoes.map((variacao) => {
                  const tomDela = tomDoGancho(variacao);
                  return (
                    <li key={variacao}>
                      <button
                        type="button"
                        disabled={ocupado}
                        onClick={() => setTexto(variacao)}
                        className={cn(
                          'flex w-full items-baseline gap-2 rounded-[7px] border px-2 py-1.5 text-left transition-colors disabled:opacity-45',
                          variacao === texto
                            ? 'border-[var(--wb-accent)] bg-[var(--wb-accent-soft)]'
                            : 'border-[var(--wb-border-soft)] hover:bg-[var(--wb-bg-inset)]',
                        )}
                      >
                        <span className="flex-1 text-[13px] font-semibold leading-snug">
                          {variacao}
                        </span>
                        <span
                          className={cn(
                            'flex-none font-code text-[10px] tabular-nums',
                            TONS[tomDela],
                          )}
                        >
                          {contarPalavras(variacao)}p
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section className="space-y-2 border-t border-[var(--wb-border-soft)] pt-3">
            <p className="text-[12.5px] font-semibold text-[var(--wb-text)]">
              Quanto tempo em tela
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                aria-label="Menos tempo"
                disabled={ocupado || ateSeg <= DURACAO_MIN_SEG}
                onClick={() => setAteSeg((v) => Math.max(DURACAO_MIN_SEG, v - DURACAO_PASSO_SEG))}
              >
                <Minus />
              </Button>
              <span className="font-code text-[13px] tabular-nums text-[var(--wb-text)]">
                {ateSeg.toFixed(1)}s
              </span>
              <Button
                variant="outline"
                size="sm"
                aria-label="Mais tempo"
                disabled={ocupado || ateSeg >= DURACAO_MAX_SEG}
                onClick={() => setAteSeg((v) => Math.min(DURACAO_MAX_SEG, v + DURACAO_PASSO_SEG))}
              >
                <Plus />
              </Button>
            </div>
            <p className="text-[11.5px] leading-relaxed text-[var(--wb-text-mute)]">
              Abaixo de {DURACAO_MIN_SEG.toFixed(1)}s a frase é vista, não lida. Acima de{' '}
              {DURACAO_MAX_SEG.toFixed(1)}s ela deixa de ser abertura e vira uma segunda legenda.
            </p>
          </section>

          <div className="flex flex-wrap items-center gap-2 border-t border-[var(--wb-border-soft)] pt-3">
            <Button size="sm" disabled={ocupado} onClick={() => onGravar(texto, ateSeg)}>
              Gravar o gancho
            </Button>
            {short.gancho_tela && (
              <Button
                variant="outline"
                size="sm"
                disabled={ocupado}
                onClick={() => onGravar('', ateSeg)}
              >
                <Eraser />
                Tirar o gancho
              </Button>
            )}
            {/* O gancho da IA é de CURADORIA ("qual é a graça deste trecho") e
                costuma ser longo demais para a tela — mas é a melhor matéria-
                prima que existe antes do gerador chegar (onda 2). */}
            {short.gancho && !texto.trim() && (
              <button
                type="button"
                disabled={ocupado}
                onClick={() => setTexto(short.gancho)}
                className="text-[11.5px] text-[var(--wb-accent)] underline-offset-2 hover:underline disabled:opacity-45"
              >
                partir do gancho que a IA escreveu
              </button>
            )}
          </div>
        </div>

        <aside className="space-y-1.5">
          {plano ? (
            <PalcoPrevia plano={plano} video={video}>
              {sobreposicoes}
            </PalcoPrevia>
          ) : (
            // Sem palco não há o que desenhar do vídeo aqui, mas a pergunta do
            // modal é a OCUPAÇÃO do texto — e essa a moldura 9:16 responde.
            <div
              className="relative mx-auto w-full max-w-[220px] overflow-hidden rounded-[8px] border border-[var(--wb-border)] bg-black"
              style={{ aspectRatio: '9 / 16', containerType: 'inline-size' }}
            >
              {sobreposicoes}
            </div>
          )}
          <p className="text-center text-[11px] leading-relaxed text-[var(--wb-text-mute)]">
            Como sai em {INSTANTE_DA_PREVIA_SEG.toFixed(1)}s de short — com a legenda daquele
            instante, que é o que divide a tela com o gancho.
          </p>
        </aside>
      </div>
    </Modal>
  );
}
