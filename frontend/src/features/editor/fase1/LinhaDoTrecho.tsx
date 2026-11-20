import type { CSSProperties, ReactNode } from 'react';
import { useMemo } from 'react';
import { Tooltip } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import type { Desvio, TranscricaoLinha } from '@/types/models';
import { Icon } from '@/upgrade/Icon';
import { hmsParaSeg } from '../timeUtils';
import { falaDoSilencio, falaDoTrecho } from './falaDoTrecho';
import { classificarBorda, podeVoltarABordaDaIa, type BordaDoTrecho } from './perguntaDosDesvios';
import { resolverBadgeTrecho } from './trechoBadge';

// O bloco de um trecho na pergunta dos desvios (D-1089, P10), e as peças que o
// riscado também usa. Saiu do TrechosList para ele caber na catraca de tamanho.
//
// D-1017: cada bloco mostra a fala que sai e como a emenda fica, para decidir lendo,
// sem reouvir o corte. D-1089: diz de quem é a borda, e a que você mexeu volta à da IA.

/**
 * "00:22:09.000" → "22:09.0". O protótipo v3 mostra décimos: os milissegundos
 * cheios alargavam a coluna de tempo e empurravam o texto do trecho, sem
 * acrescentar precisão útil na leitura.
 */
function mmssDecimo(hms: string): string {
  const semHora = hms.slice(3);
  const ponto = semHora.indexOf('.');
  return ponto === -1 ? semHora : semHora.slice(0, ponto + 2);
}

export function TempoDoTrecho({ desvio }: { desvio: Desvio }) {
  return (
    <div className="flex min-w-[52px] flex-col items-center gap-0.5 rounded text-left transition-opacity group-hover:opacity-80">
      <span
        className="font-mono text-micro font-bold text-fg tabular-nums"
      >
        {mmssDecimo(desvio.inicio_hms)}
      </span>
      <Icon name="chevron-down" className="text-fg-3" />
      <span
        className="font-mono text-micro text-fg-2 tabular-nums"
      >
        {mmssDecimo(desvio.fim_hms)}
      </span>
    </div>
  );
}

export function CabecalhoDoTrecho({ desvio }: { desvio: Desvio }) {
  const badge = resolverBadgeTrecho(desvio);
  const delta = Math.max(0, hmsParaSeg(desvio.fim_hms) - hmsParaSeg(desvio.inicio_hms));
  return (
    <div className="mb-1 flex items-center gap-1.5">
      <span
        className="inline-flex items-center rounded-etiqueta bg-[var(--fundo)] px-2 py-0.5 font-mono text-micro text-[color:var(--tinta)]"
        style={{ '--fundo': badge.bg, '--tinta': badge.fg } as CSSProperties}
        title={badge.titulo}
      >
        {badge.label}
      </span>
      {/* D-871: o tempo que sai é informação, não alarme — em cinza, como no
          canvas ("cor fica para estado"). */}
      <span
        className="font-mono text-micro font-semibold text-fg-2 tabular-nums"
      >
        −{delta.toFixed(1)}s
      </span>
    </div>
  );
}

/** D-1089: "SAI" e "FICA", como no canvas — a fala riscada e a emenda lidas sem legenda. */
function RotuloDaFala({ children }: { children: ReactNode }) {
  return (
    <span className="w-[30px] flex-none font-mono text-micro font-semibold tracking-[0.04em] text-fg-3">
      {children}
    </span>
  );
}

interface FalaQueSaiProps {
  desvio: Desvio;
  linhas: TranscricaoLinha[];
  riscada?: boolean;
  /** D-1093: o silêncio mostra a emenda mesmo sem fala dentro. */
  silencio?: boolean;
}

/** A fala que sai e as palavras que ficam vizinhas. A marca `▸◂` é onde o corte encosta. */
export function FalaQueSai({ desvio, linhas, riscada, silencio }: FalaQueSaiProps) {
  const fala = useMemo(
    () => (silencio ? falaDoSilencio : falaDoTrecho)(desvio, linhas),
    [desvio, linhas, silencio],
  );
  if (!fala) return null;
  const semCitacao =
    (desvio.origem === 'claude' || desvio.origem === 'gemini') && !desvio.inicio_texto && !desvio.fim_texto;
  return (
    <div className="mt-1.5 flex flex-col gap-1">
      {semCitacao ? (
        <div className="text-micro font-semibold leading-[1.4] text-fg-2">
          Sem citação da IA: fala estimada pelo tempo, não conferida
        </div>
      ) : null}
      <div className="flex items-baseline gap-1.5">
        {riscada ? null : <RotuloDaFala>Sai</RotuloDaFala>}
        <div className={cn('min-w-0 break-words text-pequeno leading-[1.4] text-fg', riscada && 'line-through')}>
          {fala.sai || <span className="text-fg-2">pausa, sem fala</span>}
        </div>
      </div>
      {riscada ? null : (
        <div className="flex items-baseline gap-1.5">
          <RotuloDaFala>Fica</RotuloDaFala>
          <div
            aria-label="Como a emenda fica"
            className="min-w-0 break-words border-l-2 border-fio-2 pl-1.5 text-micro leading-[1.4] text-fg-2"
          >
            …{fala.antes} <span className="font-mono font-semibold text-fg">▸◂</span> {fala.depois}…
          </div>
        </div>
      )}
    </div>
  );
}

const ROTULO_DA_BORDA: Record<BordaDoTrecho, string> = {
  ia: 'Auto · borda da IA',
  voce: 'Manual · você ajustou',
};

/**
 * De quem é a borda. A da IA em tinta cheia, a sua apagada: na casca o acento é
 * vermelho, e cor fica para estado — a borda da IA não é um problema.
 */
function SeloDaBorda({ borda }: { borda: BordaDoTrecho }) {
  return (
    <span
      className={cn(
        'ml-auto flex-none text-micro font-semibold',
        borda === 'ia' ? 'text-fg' : 'text-fg-2',
      )}
    >
      {ROTULO_DA_BORDA[borda]}
    </span>
  );
}

interface LinhaDoTrechoProps {
  desvio: Desvio;
  ativo: boolean;
  linhas: TranscricaoLinha[];
  pendente?: boolean;
  onSeek: (seg: number) => void;
  onRiscar: () => void;
  onVoltarABordaDaIa?: () => void;
  /** D-1093: o bloco é de um silêncio do app (a pergunta 1). */
  silencio?: boolean;
}

const BOTAO_DO_TRECHO =
  'h-6 rounded-pilula border border-fio px-2 text-micro text-fg-2 transition-colors duration-150 hover:bg-vidro-2 hover:text-fg disabled:pointer-events-none disabled:text-fg-off motion-reduce:transition-none ' +
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foco';

export const LinhaDoTrecho = function LinhaDoTrecho({
  desvio,
  ativo,
  linhas,
  pendente,
  onSeek,
  onRiscar,
  onVoltarABordaDaIa,
  silencio,
}: LinhaDoTrechoProps) {
  const borda = classificarBorda(desvio);
  const podeVoltar = podeVoltarABordaDaIa(desvio);
  return (
    <article
      aria-current={ativo || undefined}
      className={cn(
        'rounded-campo border bg-vidro-2 transition-colors',
        ativo ? 'border-[var(--sel-line)] bg-[var(--sel-bg)]' : 'border-fio hover:border-campo',
      )}
    >
      <button
        type="button"
        onClick={() => onSeek(hmsParaSeg(desvio.inicio_hms))}
        className="group flex w-full cursor-pointer items-start gap-2.5 rounded-campo px-2.5 pb-1 pt-2 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foco"
        aria-label={`Pular para ${desvio.inicio_hms}`}
      >
        <TempoDoTrecho desvio={desvio} />
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-1.5">
            <CabecalhoDoTrecho desvio={desvio} />
            <SeloDaBorda borda={borda} />
          </div>
          {/* D-511: o motivo não é cortado: pela metade, ele custa uma ida e volta. */}
          <div className="whitespace-pre-wrap break-words text-micro leading-[1.4] text-fg-2">
            {desvio.motivo || '—'}
          </div>
          <FalaQueSai desvio={desvio} linhas={linhas} silencio={silencio} />
          {podeVoltar ? (
            <div className="mt-1 text-micro leading-[1.4] text-fg-2">
              Desfazer a rodada não leva este trecho. "Voltar à borda da IA" o devolve à rodada.
            </div>
          ) : null}
        </div>
      </button>
      {/* Fora do botão da linha: botão dentro de botão não é HTML válido. */}
      <div className="flex justify-end gap-1.5 px-2.5 pb-2">
        {podeVoltar && onVoltarABordaDaIa ? (
          <button type="button" onClick={onVoltarABordaDaIa} disabled={pendente} className={BOTAO_DO_TRECHO}>
            Voltar à borda da IA
          </button>
        ) : null}
        <Tooltip label="Riscar: sai do corte e fica na lista dos riscados" side="left">
          <button
            type="button"
            onClick={onRiscar}
            disabled={pendente}
            aria-label="Riscar trecho"
            className={cn(BOTAO_DO_TRECHO, 'hover:text-erro')}
          >
            Riscar
          </button>
        </Tooltip>
      </div>
    </article>
  );
};
