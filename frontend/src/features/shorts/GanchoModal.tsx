import { useEffect, useState, type RefObject } from 'react';
import { Eraser, Loader2, Minus, Plus, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { cn } from '@/lib/utils';
import {
  contarPalavras,
  CORES_DO_GANCHO,
  REALCES_DO_GANCHO,
  MAX_VARIACOES,
  DURACAO_MAX_SEG,
  DURACAO_MIN_SEG,
  DURACAO_PASSO_SEG,
  duracaoEfetiva,
  PALAVRAS_MAX,
  PALAVRAS_MIN,
  LARGURA_MAX,
  LARGURA_MIN,
  LARGURA_PASSO,
  lugarEfetivo,
  recadoDoTom,
  resumoDaAparenciaPadrao,
  temAparenciaPropria,
  tomDoGancho,
  type LugarDoGancho,
  type TomDoGancho,
} from './ganchoDoShort';
import type { GanchoShortPreset } from '@/types/presets';
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
  /**
   * D-594: o gancho padrão do corte. Vazio/zero aqui significam "do padrão", e
   * o modal precisa saber qual é para mostrá-lo — e para a prévia desenhar a
   * fonte e o tamanho, que só o padrão decide.
   */
  padrao: Partial<GanchoShortPreset> | null;
  /** Zero e vazio em qualquer campo = seguir o padrão do corte. */
  onGravar: (edicao: EdicaoDoGancho) => void;
}

/** O que este modal grava num trecho. D-600 trocou os posicionais por isto. */
export interface EdicaoDoGancho {
  texto: string;
  ateSeg: number;
  cor: string;
  realce: string;
  x: number;
  y: number;
  largura: number;
}

export function GanchoModal({
  open,
  onClose,
  short,
  plano,
  video,
  palavras,
  ocupado,
  padrao,
  onGravar,
}: Props) {
  // `?? ''` porque um backend ainda nao reiniciado nao manda o campo, e um
  // textarea que comeca `undefined` vira uncontrolled — o React reclama e o
  // campo para de responder ao estado a partir da primeira tecla.
  const [texto, setTexto] = useState(short.gancho_tela ?? '');
  // D-594: 0 = "do padrão". Abrir já com 2,5s e gravar de volta carimbava o
  // default no trecho — e um trecho carimbado não segue preset nenhum.
  const [ateSeg, setAteSeg] = useState(short.gancho_ate_seg ?? 0);
  // D-581: a aparencia do gancho. Mesma regra do texto — o estado nasce do
  // short e e re-semeado ao reabrir, senao o modal levaria a cor de um trecho
  // para outro sem erro nenhum, que e o pior jeito de errar (D-542).
  // D-585: abre no que o short TEM, e não no que ele vai usar.
  //
  // Parece contraintuitivo — o campo mostra vazio enquanto a prévia ao lado
  // desenha amarelo —, mas é o que mantém a herança viva: gravar aqui o valor
  // herdado transformaria "não decidi" em "decidi isto", e trocar o padrão do
  // corte depois deixaria de alcançar este trecho. É a mesma regra da cascata
  // de layout, onde chave ausente É o mecanismo de herança.
  const [cor, setCor] = useState(short.gancho_cor ?? '');
  // D-594: mesma regra da duração — vazio é "do padrão", e não o véu.
  const [realce, setRealce] = useState(short.gancho_realce ?? '');
  // D-600: o lugar. Mesma regra de todo o resto desta tela — 0 é "não decidi",
  // e é assim que "voltar ao lugar do padrão" devolve o trecho à herança.
  const [lugarProprio, setLugarProprio] = useState<Partial<LugarDoGancho>>({
    x: short.gancho_x ?? 0,
    y: short.gancho_y ?? 0,
    largura: short.gancho_largura ?? 0,
  });
  // Em quase todo short a aparência é a do padrão do corte, então as opções
  // nascem escondidas. Só abrem sozinhas quando o trecho JÁ tem algo próprio —
  // escondê-lo ali faria uma personalização gravada passar despercebida.
  const [personalizado, setPersonalizado] = useState(temAparenciaPropria(short));

  // Reabrir o modal em outro candidato tem de trazer o gancho DELE. Sem isto o
  // estado do anterior ficaria na tela e o operador salvaria o texto errado no
  // short errado — em silêncio, porque os dois campos parecem iguais.
  useEffect(() => {
    if (!open) return;
    setTexto(short.gancho_tela ?? '');
    setAteSeg(short.gancho_ate_seg ?? 0);
    setCor(short.gancho_cor ?? '');
    setRealce(short.gancho_realce ?? '');
    setLugarProprio({
      x: short.gancho_x ?? 0,
      y: short.gancho_y ?? 0,
      largura: short.gancho_largura ?? 0,
    });
    setPersonalizado(temAparenciaPropria(short));
    gerar.reset();
    // `gerar` fora das dependencias de proposito: a mutation muda de identidade
    // a cada resultado, e inclui-la faria este efeito rodar de novo logo apos
    // as variacoes chegarem — apagando-as no instante em que aparecem.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    open,
    short.id,
    short.gancho_tela,
    short.gancho_ate_seg,
    short.gancho_cor,
    short.gancho_realce,
    short.gancho_x,
    short.gancho_y,
    short.gancho_largura,
  ]);

  const gerar = useSugerirGanchos();
  // D-573: as da geração de agora, ou as que ficaram gravadas deste short.
  //
  // A mutation continua mandando enquanto está fresca — é ela que traz o
  // resultado sem esperar o refetch da lista. O que mudou é o que acontece
  // depois: antes, fechar o modal zerava tudo, e uma chamada real leva minutos
  // (231s no log do canal). Agora as propostas ficam com o short, então reabrir
  // encontra o que a última geração produziu.
  //
  // Continuam sendo DESTE trecho, e não do anterior: elas vêm de `short`, que
  // troca junto com o candidato.
  const variacoes = gerar.data?.variacoes ?? short.gancho_sugestoes ?? [];

  const tom = tomDoGancho(texto);
  const palavrasEscritas = contarPalavras(texto);
  const tempoDaPrevia = short.inicio_seg + INSTANTE_DA_PREVIA_SEG;
  // O que vai sair: o que o trecho decidiu, ou o do padrão do corte.
  const duracaoNaTela = duracaoEfetiva(ateSeg || padrao?.duracao);
  // O lugar que a prévia desenha: o do trecho, o do padrão do corte, ou o fixo
  // de sempre — a mesma cascata que o backend resolve antes do render.
  const lugarNaTela = lugarEfetivo(lugarProprio, padrao);
  const noLugarDoPadrao =
    !lugarProprio.x && !lugarProprio.y && !lugarProprio.largura;

  // Arrastar na prévia JÁ é decidir: o gesto grava os três campos de uma vez,
  // inclusive a largura, porque uma caixa que anda sem levar o próprio tamanho
  // voltaria a herdá-lo do padrão na primeira troca de preset — e o operador
  // veria o gancho que ele posicionou mudar de forma sozinho.
  const mover = (novo: LugarDoGancho) => {
    setLugarProprio(novo);
    if (!personalizado) setPersonalizado(true);
  };

  /** O que vai ao banco: 0 em tudo quando o trecho ainda segue o padrão. */
  const lugarGravado = {
    x: lugarProprio.x ?? 0,
    y: lugarProprio.y ?? 0,
    largura: lugarProprio.largura ?? 0,
  };

  // Desligar devolve o trecho ao padrão de verdade: esconder os campos com
  // valores próprios ainda dentro gravaria uma personalização invisível.
  const alternarPersonalizado = () => {
    if (personalizado) {
      setCor('');
      setRealce('');
      setAteSeg(0);
      setLugarProprio({ x: 0, y: 0, largura: 0 });
    }
    setPersonalizado(!personalizado);
  };


  const sobreposicoes = (
    <>
      <GanchoPrevia
        texto={texto}
        ateSeg={duracaoNaTela}
        inicioSeg={short.inicio_seg}
        fimSeg={short.fim_seg}
        tempoAtualSeg={tempoDaPrevia}
        // Enquanto o operador não escolhe, a prévia mostra o que o corte manda
        // — que é o que o arquivo vai ter.
        cor={cor || padrao?.cor || ''}
        realce={realce || padrao?.realce || 'veu'}
        fonte={padrao?.fonte}
        tamanho={padrao?.tamanho}
        lugar={lugarNaTela}
        // D-600: é aqui que a prévia deixa de ser só espelho. A pergunta "onde
        // este gancho cabe" só se responde olhando o quadro — pedir dois
        // números num campo ao lado seria obrigar o operador a traduzir o que
        // está vendo e de volta.
        onMover={mover}
      />
      {palavras.length > 0 && (
        <LegendaPrevia
          palavras={palavras}
          inicioSeg={short.inicio_seg}
          fimSeg={short.fim_seg}
          tempoAtualSeg={tempoDaPrevia}
          cor={short.legenda_cor}
          fonte={short.legenda_fonte}
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
                // O tempo real medido no canal foi de quase quatro minutos. Sem
                // dizer isso, o spinner vira a mesma escuridão do render antes
                // da D-568 — e aqui é pior, porque a tentação é fechar a janela.
                <span className="text-[11.5px] text-[var(--wb-text-mute)]">
                  lendo a transcrição deste trecho — costuma levar alguns minutos. Pode fechar:
                  as variações ficam guardadas.
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
            {gerar.isSuccess && gerar.data?.variacoes.length === 0 && (
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

          {/* D-581: a aparência, logo abaixo do texto e ANTES da duração.
              A ordem é a da dúvida real: escrita a frase, a pergunta seguinte é
              "dá para ler?" — e era ali que o gancho branco sumia dentro da
              legenda branca. Quanto tempo ela fica é a decisão de depois. */}
          <section className="border-t border-[var(--wb-border-soft)] pt-3">
            <button
              type="button"
              role="switch"
              aria-checked={personalizado}
              disabled={ocupado}
              onClick={alternarPersonalizado}
              className="flex w-full items-center gap-2.5 text-left disabled:opacity-45"
            >
              <span
                aria-hidden
                className={cn(
                  'relative h-4 w-7 flex-none rounded-full transition-colors',
                  personalizado ? 'bg-[var(--wb-accent)]' : 'bg-[var(--wb-border)]',
                )}
              >
                <span
                  className={cn(
                    'absolute top-0.5 h-3 w-3 rounded-full bg-white transition-transform',
                    personalizado ? 'translate-x-3.5' : 'translate-x-0.5',
                  )}
                />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[12.5px] font-semibold text-[var(--wb-text)]">
                  Aparência própria neste trecho
                </span>
                <span className="block truncate text-[11px] text-[var(--wb-text-mute)]">
                  {personalizado
                    ? 'cor, destaque, tempo e lugar só deste short'
                    : `segue o padrão do corte — ${resumoDaAparenciaPadrao(padrao)}`}
                </span>
              </span>
            </button>
          </section>

          {personalizado && (
          <>
          <section className="space-y-2.5 border-t border-[var(--wb-border-soft)] pt-3">
            <div>
              <p className="text-[12.5px] font-semibold text-[var(--wb-text)]">Cor do gancho</p>
              <p className="text-[11.5px] leading-relaxed text-[var(--wb-text-mute)]">
                A legenda também é branca e divide o quadro com ele. Uma cor só do gancho é o que
                diz ao olho qual dos dois é a promessa.
              </p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {CORES_DO_GANCHO.map(({ hex, nome }) => (
                <button
                  key={hex || 'branco'}
                  type="button"
                  disabled={ocupado}
                  onClick={() => setCor(hex)}
                  // D-594: com padrão no corte, a amostra vazia deixa de ser
                  // "branco" e passa a ser "a do padrão" — e pinta a cor dele.
                  title={!hex && padrao?.cor ? 'do padrão do corte' : nome}
                  aria-label={!hex && padrao?.cor ? 'do padrão do corte' : nome}
                  aria-pressed={cor === hex}
                  className={cn(
                    'h-7 w-7 rounded-[7px] border-2 transition-transform disabled:opacity-45',
                    cor === hex
                      ? 'border-[var(--wb-accent)] scale-110'
                      : 'border-[var(--wb-border)] hover:border-[var(--wb-text-dim)]',
                  )}
                  // Amostra sobre xadrez escuro: a cor do gancho é julgada
                  // CONTRA vídeo, e um fundo claro faria o branco desaparecer
                  // do seletor justamente por ser a opção padrão.
                  style={{ backgroundColor: hex || padrao?.cor || '#ffffff' }}
                />
              ))}
            </div>

            <div>
              <p className="text-[12.5px] font-semibold text-[var(--wb-text)]">Destaque</p>
              <p className="text-[11.5px] leading-relaxed text-[var(--wb-text-mute)]">
                O que separa o texto do vídeo por trás. Veja o efeito na prévia ao lado.
              </p>
            </div>
            <div className="grid gap-1">
              <button
                type="button"
                disabled={ocupado}
                onClick={() => setRealce('')}
                aria-pressed={realce === ''}
                className={cn(
                  'flex items-baseline gap-2 rounded-[7px] border px-2 py-1.5 text-left transition-colors disabled:opacity-45',
                  realce === ''
                    ? 'border-[var(--wb-accent)] bg-[var(--wb-accent-soft)]'
                    : 'border-[var(--wb-border-soft)] hover:bg-[var(--wb-bg-inset)]',
                )}
              >
                <span className="flex-none text-[12.5px] font-semibold">Do padrão</span>
                <span className="text-[11px] leading-snug text-[var(--wb-text-mute)]">
                  {padrao?.realce
                    ? `o do corte (${REALCES_DO_GANCHO.find((r) => r.id === padrao.realce)?.nome ?? padrao.realce})`
                    : 'véu, enquanto o corte não tiver padrão'}
                </span>
              </button>
              {REALCES_DO_GANCHO.map(({ id, nome, nota }) => (
                <button
                  key={id}
                  type="button"
                  disabled={ocupado}
                  onClick={() => setRealce(id)}
                  aria-pressed={realce === id}
                  className={cn(
                    'flex items-baseline gap-2 rounded-[7px] border px-2 py-1.5 text-left transition-colors disabled:opacity-45',
                    realce === id
                      ? 'border-[var(--wb-accent)] bg-[var(--wb-accent-soft)]'
                      : 'border-[var(--wb-border-soft)] hover:bg-[var(--wb-bg-inset)]',
                  )}
                >
                  <span className="flex-none text-[12.5px] font-semibold">{nome}</span>
                  <span className="text-[11px] leading-snug text-[var(--wb-text-mute)]">
                    {nota}
                  </span>
                </button>
              ))}
            </div>
          </section>

          {/* D-600: o LUGAR. O gesto principal é o arraste na prévia ao lado —
              esta seção existe para a largura, que não tem alça, e para o
              caminho de volta à herança, que um arraste não sabe expressar. */}
          <section className="space-y-2 border-t border-[var(--wb-border-soft)] pt-3">
            <div>
              <p className="text-[12.5px] font-semibold text-[var(--wb-text)]">Onde ele fica</p>
              <p className="text-[11.5px] leading-relaxed text-[var(--wb-text-mute)]">
                Arraste o gancho na prévia ao lado. A largura da caixa é o que decide onde a
                frase quebra de linha.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                aria-label="Caixa mais estreita"
                disabled={ocupado || lugarNaTela.largura <= LARGURA_MIN}
                onClick={() =>
                  mover({
                    ...lugarNaTela,
                    largura: Math.max(LARGURA_MIN, lugarNaTela.largura - LARGURA_PASSO),
                  })
                }
              >
                <Minus />
              </Button>
              <span className="font-code text-[13px] tabular-nums text-[var(--wb-text)]">
                {Math.round(lugarNaTela.largura)}% de largura
              </span>
              <Button
                variant="outline"
                size="sm"
                aria-label="Caixa mais larga"
                disabled={ocupado || lugarNaTela.largura >= LARGURA_MAX}
                onClick={() =>
                  mover({
                    ...lugarNaTela,
                    largura: Math.min(LARGURA_MAX, lugarNaTela.largura + LARGURA_PASSO),
                  })
                }
              >
                <Plus />
              </Button>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="font-code text-[11px] tabular-nums text-[var(--wb-text-mute)]">
                {Math.round(lugarNaTela.x)}% / {Math.round(lugarNaTela.y)}% do quadro
              </span>
              {noLugarDoPadrao ? (
                <span className="text-[11px] text-[var(--wb-text-mute)]">do padrão</span>
              ) : (
                <button
                  type="button"
                  disabled={ocupado}
                  onClick={() => setLugarProprio({ x: 0, y: 0, largura: 0 })}
                  className="text-[11.5px] text-[var(--wb-accent)] underline-offset-2 hover:underline disabled:opacity-45"
                >
                  usar o lugar do padrão
                </button>
              )}
            </div>
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
                disabled={ocupado || duracaoNaTela <= DURACAO_MIN_SEG}
                onClick={() => setAteSeg(Math.max(DURACAO_MIN_SEG, duracaoNaTela - DURACAO_PASSO_SEG))}
              >
                <Minus />
              </Button>
              <span className="font-code text-[13px] tabular-nums text-[var(--wb-text)]">
                {duracaoNaTela.toFixed(1)}s
              </span>
              <Button
                variant="outline"
                size="sm"
                aria-label="Mais tempo"
                disabled={ocupado || duracaoNaTela >= DURACAO_MAX_SEG}
                onClick={() => setAteSeg(Math.min(DURACAO_MAX_SEG, duracaoNaTela + DURACAO_PASSO_SEG))}
              >
                <Plus />
              </Button>
              {ateSeg > 0 ? (
                <button
                  type="button"
                  disabled={ocupado}
                  onClick={() => setAteSeg(0)}
                  className="text-[11.5px] text-[var(--wb-accent)] underline-offset-2 hover:underline disabled:opacity-45"
                >
                  usar a do padrão
                </button>
              ) : (
                <span className="text-[11px] text-[var(--wb-text-mute)]">do padrão</span>
              )}
            </div>
            <p className="text-[11.5px] leading-relaxed text-[var(--wb-text-mute)]">
              Abaixo de {DURACAO_MIN_SEG.toFixed(1)}s a frase é vista, não lida. Acima de{' '}
              {DURACAO_MAX_SEG.toFixed(1)}s ela deixa de ser abertura e vira uma segunda legenda.
            </p>
          </section>
          </>
          )}

          <div className="flex flex-wrap items-center gap-2 border-t border-[var(--wb-border-soft)] pt-3">
            <Button
              size="sm"
              disabled={ocupado}
              onClick={() => onGravar({ texto, ateSeg, cor, realce, ...lugarGravado })}
            >
              Gravar o gancho
            </Button>
            {short.gancho_tela && (
              <Button
                variant="outline"
                size="sm"
                disabled={ocupado}
                onClick={() => onGravar({ texto: '', ateSeg, cor, realce, ...lugarGravado })}
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
