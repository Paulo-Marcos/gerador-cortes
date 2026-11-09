import type { ReactNode } from 'react';
import { useMemo } from 'react';
import { Tooltip } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import type { Desvio, TranscricaoLinha } from '@/types/models';
import { Icon } from '@/upgrade/Icon';
import { hmsParaSeg } from '../timeUtils';
import { falaDoTrecho } from './falaDoTrecho';
import { bordaDoTrecho, type BordaDoTrecho } from './perguntaDosDesvios';
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
        className="font-code text-[11px] font-bold text-[var(--wb-text)]"
        style={{ fontVariantNumeric: 'tabular-nums' }}
      >
        {mmssDecimo(desvio.inicio_hms)}
      </span>
      <Icon name="chevron-down" className="text-[var(--wb-text-dim)]" />
      <span
        className="font-code text-[11px] text-[var(--wb-text-mute)]"
        style={{ fontVariantNumeric: 'tabular-nums' }}
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
        className="inline-flex items-center rounded-full px-2 py-0.5 font-code text-[11px] font-semibold uppercase tracking-[0.04em]"
        style={{ background: badge.bg, color: badge.fg }}
        title={badge.titulo}
      >
        {badge.label}
      </span>
      {/* D-871: o tempo que sai é informação, não alarme — em cinza, como no
          canvas ("cor fica para estado"). */}
      <span
        className="font-code text-[11px] font-semibold text-[var(--wb-text-mute)]"
        style={{ fontVariantNumeric: 'tabular-nums' }}
      >
        −{delta.toFixed(1)}s
      </span>
    </div>
  );
}

/** D-1089: "SAI" e "FICA", como no canvas — a fala riscada e a emenda lidas sem legenda. */
function RotuloDaFala({ children }: { children: ReactNode }) {
  return (
    <span className="w-[30px] flex-none font-code text-[11px] font-semibold uppercase tracking-[0.04em] text-[var(--wb-text-dim)]">
      {children}
    </span>
  );
}

/** A fala que sai e as palavras que ficam vizinhas. A marca `▸◂` é onde o corte encosta. */
export function FalaQueSai({ desvio, linhas, riscada }: { desvio: Desvio; linhas: TranscricaoLinha[]; riscada?: boolean }) {
  const fala = useMemo(() => falaDoTrecho(desvio, linhas), [desvio, linhas]);
  if (!fala) return null;
  const semCitacao =
    (desvio.origem === 'claude' || desvio.origem === 'gemini') && !desvio.inicio_texto && !desvio.fim_texto;
  return (
    <div className="mt-1.5 flex flex-col gap-1">
      {semCitacao ? (
        <div className="text-[11px] font-semibold leading-[1.4] text-[var(--wb-text-mute)]">
          Sem citação da IA: fala estimada pelo tempo, não conferida
        </div>
      ) : null}
      <div className="flex items-baseline gap-1.5">
        {riscada ? null : <RotuloDaFala>Sai</RotuloDaFala>}
        <div className={cn('min-w-0 break-words text-[12px] leading-[1.4] text-[var(--wb-text)]', riscada && 'line-through')}>
          {fala.sai}
        </div>
      </div>
      {riscada ? null : (
        <div className="flex items-baseline gap-1.5">
          <RotuloDaFala>Fica</RotuloDaFala>
          <div
            aria-label="Como a emenda fica"
            className="min-w-0 break-words border-l-2 border-[var(--wb-border)] pl-1.5 text-[11px] leading-[1.4] text-[var(--wb-text-mute)]"
          >
            …{fala.antes} <span className="font-code font-semibold text-[var(--wb-text)]">▸◂</span> {fala.depois}…
          </div>
        </div>
      )}
    </div>
  );
}

const ROTULO_DA_BORDA: Record<BordaDoTrecho, string> = {
  ia: 'Auto · borda da IA',
  ajustada: 'Manual · você ajustou',
  manual: 'Manual · você marcou',
};

/**
 * De quem é a borda. A da IA em tinta cheia, a sua apagada: na casca o acento é
 * vermelho, e cor fica para estado — a borda da IA não é um problema.
 */
function SeloDaBorda({ borda }: { borda: BordaDoTrecho }) {
  return (
    <span
      className={cn(
        'ml-auto flex-none text-[11px] font-semibold',
        borda === 'ia' ? 'text-[var(--wb-text)]' : 'text-[var(--wb-text-mute)]',
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
}

const BOTAO_DO_TRECHO =
  'h-6 rounded-[6px] border border-[var(--wb-border-soft)] px-2 text-[11px] font-medium text-[var(--wb-text-mute)] transition-colors hover:bg-[var(--wb-bg-inset)] hover:text-[var(--wb-text)] disabled:pointer-events-none disabled:opacity-40';

export const LinhaDoTrecho = function LinhaDoTrecho({
  desvio,
  ativo,
  linhas,
  pendente,
  onSeek,
  onRiscar,
  onVoltarABordaDaIa,
}: LinhaDoTrechoProps) {
  const borda = bordaDoTrecho(desvio);
  return (
    <article
      aria-current={ativo || undefined}
      className={cn(
        'rounded-[var(--radius-sm)] border bg-[var(--wb-bg-card-elev)] transition-colors',
        ativo ? 'border-[var(--sel-line)] bg-[var(--sel-bg)]' : 'border-[var(--wb-border-soft)] hover:border-[var(--wb-border)]',
      )}
    >
      <button
        type="button"
        onClick={() => onSeek(hmsParaSeg(desvio.inicio_hms))}
        className="group flex w-full cursor-pointer items-start gap-2.5 rounded-[var(--radius-sm)] px-2.5 pb-1 pt-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--wb-focus)]"
        aria-label={`Pular para ${desvio.inicio_hms}`}
      >
        <TempoDoTrecho desvio={desvio} />
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-1.5">
            <CabecalhoDoTrecho desvio={desvio} />
            <SeloDaBorda borda={borda} />
          </div>
          {/* D-511: o motivo não é cortado: pela metade, ele custa uma ida e volta. */}
          <div className="whitespace-pre-wrap break-words text-[11px] leading-[1.4] text-[var(--wb-text-mute)]">
            {desvio.motivo || '—'}
          </div>
          <FalaQueSai desvio={desvio} linhas={linhas} />
          {borda === 'ajustada' ? (
            <div className="mt-1 text-[11px] leading-[1.4] text-[var(--wb-text-mute)]">
              Desfazer a rodada não leva este trecho. "Voltar à borda da IA" o devolve à rodada.
            </div>
          ) : null}
        </div>
      </button>
      {/* Fora do botão da linha: botão dentro de botão não é HTML válido. */}
      <div className="flex justify-end gap-1.5 px-2.5 pb-2">
        {borda === 'ajustada' && onVoltarABordaDaIa ? (
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
            className={cn(BOTAO_DO_TRECHO, 'hover:text-[var(--wb-err-ink)]')}
          >
            Riscar
          </button>
        </Tooltip>
      </div>
    </article>
  );
};
