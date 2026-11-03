import { memo, useEffect, useMemo, useRef } from 'react';
import { AcaoDeIa } from '@/components/ui/acao-de-ia';
import { IconButton } from '@/components/ui/icon-button';
import { Tooltip } from '@/components/ui/tooltip';
import type { ProviderIA } from '@/lib/providerIa';
import { cn } from '@/lib/utils';
import type { Desvio, TranscricaoLinha } from '@/types/models';
import { Icon } from '@/upgrade/Icon';
import { hmsParaSeg } from '../timeUtils';
import { falaDoTrecho } from './falaDoTrecho';
import { resolverBadgeTrecho } from './trechoBadge';

// ───── TrechosList — v2_bruto.jsx:484-548 ─────

// D-422: o badge do trecho mostra o MOTIVO da remoção (repetição, tangente…) em
// vez de um "IA" único para tudo. A resolução vive em `trechoBadge.ts`.
//
// D-1017: cada linha mostra a fala que sai e como a emenda fica, para decidir lendo,
// sem reouvir o corte. A lixeira risca (RN-36): o riscado fica logo abaixo, de onde
// volta. Saiu do RightTabsPanel, que está no teto da catraca de tamanho (D-771).

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

function TempoDoTrecho({ desvio }: { desvio: Desvio }) {
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

function CabecalhoDoTrecho({ desvio }: { desvio: Desvio }) {
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

/** A fala que sai e as palavras que ficam vizinhas. A marca `▸◂` é onde o corte encosta. */
function FalaQueSai({ desvio, linhas, riscada }: { desvio: Desvio; linhas: TranscricaoLinha[]; riscada?: boolean }) {
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
      <div className={cn('break-words text-[12px] leading-[1.4] text-[var(--wb-text)]', riscada && 'line-through')}>
        {fala.sai}
      </div>
      {riscada ? null : (
        <div
          aria-label="Como a emenda fica"
          className="break-words border-l-2 border-[var(--wb-border)] pl-1.5 text-[11px] leading-[1.4] text-[var(--wb-text-mute)]"
        >
          …{fala.antes} <span className="font-code font-semibold text-[var(--wb-text)]">▸◂</span> {fala.depois}…
        </div>
      )}
    </div>
  );
}

interface LinhaDoTrechoProps {
  desvio: Desvio;
  ativo: boolean;
  linhas: TranscricaoLinha[];
  pendente?: boolean;
  onSeek: (seg: number) => void;
  onRiscar: () => void;
}

const LinhaDoTrecho = function LinhaDoTrecho({ desvio, ativo, linhas, pendente, onSeek, onRiscar }: LinhaDoTrechoProps) {
  return (
    <>
      <button
        type="button"
        onClick={() => onSeek(hmsParaSeg(desvio.inicio_hms))}
        className={cn(
          'group flex w-full cursor-pointer items-start gap-2.5 rounded-[var(--radius-sm)] border bg-[var(--wb-bg-card-elev)] px-2.5 py-2 pr-10 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--wb-focus)]',
          ativo
            ? 'border-[var(--sel-line)] bg-[var(--sel-bg)]'
            : 'border-[var(--wb-border-soft)] hover:border-[var(--wb-border)]',
        )}
        aria-label={`Pular para ${desvio.inicio_hms}`}
      >
        <TempoDoTrecho desvio={desvio} />
        <div className="min-w-0 flex-1">
          <CabecalhoDoTrecho desvio={desvio} />
          {/* D-511: o motivo não é cortado: pela metade, ele custa uma ida e volta. */}
          <div className="whitespace-pre-wrap break-words text-[11px] leading-[1.4] text-[var(--wb-text-mute)]">
            {desvio.motivo || '—'}
          </div>
          <FalaQueSai desvio={desvio} linhas={linhas} />
        </div>
      </button>
      <Tooltip label="Riscar: sai do corte e fica na lista dos riscados" side="left">
        {/* D-746: a ação menos frequente da linha era o elemento mais pesado dela.
            Pequena e apagada; acende quando a linha é apontada ou o teclado chega. */}
        <IconButton
          type="button"
          variant="ghost"
          size="sm"
          className="absolute right-1.5 top-1.5 h-6 w-6 text-[var(--wb-text-dim)] opacity-40 transition-opacity hover:text-[var(--wb-err-ink)] focus-visible:opacity-100 group-hover/trecho:opacity-100"
          onClick={onRiscar}
          disabled={pendente}
          aria-label="Riscar trecho"
        >
          <Icon name="trash-2" />
        </IconButton>
      </Tooltip>
    </>
  );
};

interface RiscadosDoCorteProps {
  riscados: Desvio[];
  linhas: TranscricaoLinha[];
  pendente?: boolean;
  onRestaurar?: (indice: number) => void;
}

function RiscadosDoCorte({ riscados, linhas, pendente, onRestaurar }: RiscadosDoCorteProps) {
  return (
    <details open className="mt-2 border-t border-[var(--wb-border-soft)] pt-2">
      <summary className="cursor-pointer text-[12px] font-semibold text-[var(--wb-text-mute)]">
        Riscados · {riscados.length}
      </summary>
      <div className="mt-1.5 flex flex-col gap-1.5">
        {riscados.map((desvio, indice) => (
          <div
            key={`${desvio.inicio_hms}-${indice}`}
            className="flex items-start gap-2.5 rounded-[var(--radius-sm)] border border-dashed border-[var(--wb-border-soft)] px-2.5 py-2"
          >
            <TempoDoTrecho desvio={desvio} />
            <div className="min-w-0 flex-1">
              <CabecalhoDoTrecho desvio={desvio} />
              {desvio.recusa ? (
                <div className="mb-1 text-[11px] font-semibold leading-[1.4] text-[var(--wb-err-ink)]">
                  {desvio.recusa}
                </div>
              ) : null}
              <div className="whitespace-pre-wrap break-words text-[11px] leading-[1.4] text-[var(--wb-text-mute)]">
                {desvio.motivo || '—'}
              </div>
              <FalaQueSai desvio={desvio} linhas={linhas} riscada />
            </div>
            <Tooltip label="Volta para o corte" side="left">
              <IconButton
                type="button"
                variant="ghost"
                size="sm"
                className="h-6 w-6 flex-none text-[var(--wb-text-mute)]"
                onClick={() => onRestaurar?.(indice)}
                disabled={pendente}
                aria-label="Restaurar trecho"
              >
                <Icon name="undo-2" />
              </IconButton>
            </Tooltip>
          </div>
        ))}
      </div>
    </details>
  );
}

interface BarraDosTrechosProps {
  emVoo: ProviderIA | null;
  adicionando?: boolean;
  onGerarManual: () => void;
  onGerarTrechosIA: (provider: 'claude' | 'gemini') => void;
  onAdicionar: () => void;
}

/** D-871: "Gerar | Claude | Gemini", e o Manual (raro) como ícone: com o rótulo, não cabia em 344 px. */
function barraDosTrechos({ emVoo, adicionando, onGerarManual, onGerarTrechosIA, onAdicionar }: BarraDosTrechosProps) {
  return (
    <div className="flex flex-shrink-0 items-center gap-1.5 px-3 pb-2 pt-2">
      <AcaoDeIa
        rotulo="Gerar"
        descricao="Gerar trechos a remover"
        emVoo={emVoo}
        onGerar={onGerarTrechosIA}
        comNome
        className="h-[30px] min-w-0 flex-1"
      />
      <Tooltip label="Importar trechos manualmente (cola JSON da IA)" side="bottom">
        <button
          type="button"
          onClick={onGerarManual}
          aria-label="Importar trechos manualmente"
          className="flex h-[30px] w-[30px] flex-none items-center justify-center rounded-[8px] border border-[var(--wb-border)] text-[var(--wb-text-mute)] transition-colors hover:bg-[var(--wb-bg-inset)] hover:text-[var(--wb-text)]"
        >
          <Icon name="wand-sparkles" size={16} />
        </button>
      </Tooltip>
      <Tooltip label="Adicionar trecho" side="bottom">
        <button
          type="button"
          onClick={onAdicionar}
          disabled={adicionando}
          aria-label="Adicionar trecho"
          className="flex h-[30px] w-[30px] items-center justify-center rounded-[8px] bg-[var(--wb-accent-soft)] text-[var(--wb-accent)] transition-colors hover:bg-[var(--wb-accent)] hover:text-[var(--wb-accent-fg)] disabled:pointer-events-none disabled:opacity-40"
        >
          <Icon name="plus" size={16} />
        </button>
      </Tooltip>
    </div>
  );
}

export interface TrechosListProps {
  desvios: Desvio[];
  selectedDesvioIdx: number | null;
  onSeek: (seg: number) => void;
  onAdicionarDesvio: (d: Desvio) => void;
  onRemoverDesvio: (idx: number) => void;
  onGerarManual: () => void;
  onGerarTrechosIA: (provider: 'claude' | 'gemini') => void;
  pending: {
    adicionando?: boolean;
    removendo?: boolean;
    restaurando?: boolean;
    claude?: { isPending: boolean; provider?: string };
  };
  /** A transcrição do corte: é dela que sai a fala de cada trecho. */
  linhas?: TranscricaoLinha[];
  riscados?: Desvio[];
  trechosDaUltimaRodada?: number;
  onRestaurarDesvio?: (indice: number) => void;
  onDesfazerRodada?: () => void;
}

const SEM_LINHAS: TranscricaoLinha[] = [];

/**
 * D-740: o objeto de pendências nasce a cada render do pai; reconstruído a partir dos
 * campos, só muda quando algum deles muda, e o memo da lista segura a redesenhada.
 */
export function usePendenciasDosTrechos(
  pendentes: Omit<TrechosListProps['pending'], 'restaurando'>,
  restaurando?: boolean,
): TrechosListProps['pending'] {
  const { adicionando, removendo } = pendentes;
  const claudePendente = pendentes.claude?.isPending;
  const claudeProvider = pendentes.claude?.provider;
  return useMemo(
    () => ({
      adicionando,
      removendo,
      restaurando,
      claude:
        claudePendente === undefined
          ? undefined
          : { isPending: claudePendente, provider: claudeProvider },
    }),
    [adicionando, removendo, restaurando, claudePendente, claudeProvider],
  );
}

export const TrechosList = memo(function TrechosList({
  desvios,
  selectedDesvioIdx,
  onSeek,
  onAdicionarDesvio,
  onRemoverDesvio,
  onGerarManual,
  onGerarTrechosIA,
  pending,
  linhas = SEM_LINHAS,
  riscados = [],
  trechosDaUltimaRodada = 0,
  onRestaurarDesvio,
  onDesfazerRodada,
}: TrechosListProps) {
  const sortedWithOriginalIdx = useMemo(
    () =>
      desvios
        .map((d, i) => ({ d, i }))
        .sort((a, b) => hmsParaSeg(a.d.inicio_hms) - hmsParaSeg(b.d.inicio_hms)),
    [desvios],
  );
  const origIdxToSortedPos = useMemo(() => {
    const map = new Map<number, number>();
    sortedWithOriginalIdx.forEach(({ i }, sortPos) => map.set(i, sortPos));
    return map;
  }, [sortedWithOriginalIdx]);
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    if (selectedDesvioIdx == null || selectedDesvioIdx < 0) return;
    const sortedPos = origIdxToSortedPos.get(selectedDesvioIdx);
    if (sortedPos == null) return;
    itemRefs.current[sortedPos]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [selectedDesvioIdx, origIdxToSortedPos]);

  function adicionarAqui() {
    onAdicionarDesvio({ inicio_hms: '00:00:00', fim_hms: '00:00:05', motivo: 'Manual — recortado pelo editor' });
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {barraDosTrechos({
        emVoo: pending.claude?.isPending ? ((pending.claude.provider as ProviderIA | undefined) ?? 'claude') : null,
        adicionando: pending.adicionando,
        onGerarManual,
        onGerarTrechosIA,
        onAdicionar: adicionarAqui,
      })}
      {trechosDaUltimaRodada > 0 ? (
        <button
          type="button"
          onClick={onDesfazerRodada}
          disabled={pending.restaurando}
          className="mx-3 mb-1 flex flex-shrink-0 items-center justify-center gap-1.5 rounded-[8px] border border-[var(--wb-border)] px-2 py-1 text-[12px] text-[var(--wb-text-mute)] transition-colors hover:bg-[var(--wb-bg-inset)] hover:text-[var(--wb-text)] disabled:opacity-40"
        >
          <Icon name="undo-2" size={14} />
          Desfazer a última rodada da IA · {trechosDaUltimaRodada} {trechosDaUltimaRodada === 1 ? 'trecho' : 'trechos'}
        </button>
      ) : null}
      <div className="flex flex-1 flex-col gap-1.5 overflow-y-auto px-2.5 py-2">
        {sortedWithOriginalIdx.length === 0 && (
          <div className="m-auto flex flex-col items-center gap-1 py-8 text-center text-[12px] text-[var(--wb-text-dim)]">
            <Icon name="sparkles" size={20} className="opacity-60" />
            Nenhum trecho marcado.
            <span className="text-[11px]">Use IA / Manual / Silencios para gerar.</span>
          </div>
        )}
        {sortedWithOriginalIdx.map(({ d, i }, sortPos) => (
          <div
            key={`${d.inicio_hms}-${i}`}
            ref={(el) => {
              itemRefs.current[sortPos] = el;
            }}
            className="group/trecho relative"
          >
            <LinhaDoTrecho
              desvio={d}
              ativo={selectedDesvioIdx === i}
              linhas={linhas}
              pendente={pending.removendo}
              onSeek={onSeek}
              onRiscar={() => onRemoverDesvio(i)}
            />
          </div>
        ))}
        {riscados.length > 0 ? (
          <RiscadosDoCorte
            riscados={riscados}
            linhas={linhas}
            pendente={pending.restaurando}
            onRestaurar={onRestaurarDesvio}
          />
        ) : null}
      </div>
    </div>
  );
});
