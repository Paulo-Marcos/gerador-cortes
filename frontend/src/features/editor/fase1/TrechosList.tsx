import { memo, useEffect, useMemo, useRef } from 'react';
import { AcaoDeIa } from '@/components/ui/acao-de-ia';
import { IconButton } from '@/components/ui/icon-button';
import { Tooltip } from '@/components/ui/tooltip';
import type { ProviderIA } from '@/lib/providerIa';
import type { Desvio, TranscricaoLinha } from '@/types/models';
import { Icon } from '@/upgrade/Icon';
import { hmsParaSeg } from '../timeUtils';
import { CabecalhoDoTrecho, FalaQueSai, LinhaDoTrecho, TempoDoTrecho } from './LinhaDoTrecho';
import { naoESilencioDoApp } from './silencioDoCorte';
import { provedorDaUltimaRodada } from './perguntaDosDesvios';

// ───── TrechosList — v2_bruto.jsx:484-548 ─────

// D-422: o badge do trecho mostra o MOTIVO da remoção (repetição, tangente…) em
// vez de um "IA" único para tudo. A resolução vive em `trechoBadge.ts`.
//
// D-1017: cada linha mostra a fala que sai e como a emenda fica, para decidir lendo,
// sem reouvir o corte. A lixeira risca (RN-36): o riscado fica logo abaixo, de onde
// volta. Saiu do RightTabsPanel, que está no teto da catraca de tamanho (D-771).
//
// D-1089 (P10): é a pergunta 2 da aba Decisões. Cada trecho é um bloco que diz de
// quem é a borda — da IA ou sua —, e o que você mexeu pode voltar à borda da IA.

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
  onAdicionarNoCursor?: () => void;
}

/**
 * D-871: "Gerar | Claude | Gemini", e o Manual (raro) como ícone: com o rótulo, não cabia
 * em 344 px. D-1089: no fim da pergunta, depois dos trechos — gerar de novo acrescenta ao
 * que já está, e é o passo seguinte a ler o que a IA propôs, não o primeiro.
 */
function barraDosTrechos({ emVoo, adicionando, onGerarManual, onGerarTrechosIA, onAdicionarNoCursor }: BarraDosTrechosProps) {
  return (
    <div className="flex flex-shrink-0 flex-wrap items-center gap-1.5 px-2.5 pb-2.5 pt-1">
      <AcaoDeIa
        rotulo="Gerar (acrescenta)"
        descricao="Gerar trechos a remover"
        emVoo={emVoo}
        onGerar={onGerarTrechosIA}
        comNome
        // A linha inteira: dividida com os ícones, "(acrescenta)" virava reticências.
        className="h-[30px] basis-full"
      />
      {onAdicionarNoCursor ? (
        <Tooltip label="Marca 5 s a partir do cursor do player" side="bottom">
          <button
            type="button"
            onClick={onAdicionarNoCursor}
            disabled={adicionando}
            className="flex h-[30px] flex-none items-center gap-1 rounded-[8px] bg-[var(--wb-accent-soft)] px-2.5 text-[12px] font-medium text-[var(--wb-accent)] transition-colors hover:bg-[var(--wb-accent)] hover:text-[var(--wb-accent-fg)] disabled:pointer-events-none disabled:opacity-40"
          >
            <Icon name="plus" size={14} />
            Trecho no cursor
          </button>
        </Tooltip>
      ) : null}
      <Tooltip label="Importar trechos manualmente (cola JSON da IA)" side="bottom">
        <button
          type="button"
          onClick={onGerarManual}
          aria-label="Importar trechos manualmente"
          className="ml-auto flex h-[30px] w-[30px] flex-none items-center justify-center rounded-[8px] border border-[var(--wb-border)] text-[var(--wb-text-mute)] transition-colors hover:bg-[var(--wb-bg-inset)] hover:text-[var(--wb-text)]"
        >
          <Icon name="wand-sparkles" size={16} />
        </button>
      </Tooltip>
    </div>
  );
}

interface CabecalhoDaRodadaProps {
  desvios: Desvio[];
  trechos: number;
  pendente?: boolean;
  onDesfazer?: () => void;
}

/** D-1089: a rodada da IA, com quem a fez e o que desfazê-la tira. Sem rodada, não aparece. */
function cabecalhoDaRodada({ desvios, trechos, pendente, onDesfazer }: CabecalhoDaRodadaProps) {
  if (trechos <= 0) return null;
  const provedor = provedorDaUltimaRodada(desvios);
  return (
    // Quebra em duas linhas na coluna estreita: com reticências, "Claude" era o que sumia.
    <div className="flex flex-shrink-0 flex-wrap items-center justify-between gap-x-2 gap-y-1 px-3 pb-1 pt-1">
      <span className="text-[11px] font-semibold uppercase tracking-[0.04em] text-[var(--wb-text-dim)]">
        rodada da IA{provedor ? ` · ${provedor}` : ''}
      </span>
      <button
        type="button"
        onClick={onDesfazer}
        disabled={pendente}
        className="flex flex-none items-center gap-1.5 rounded-[8px] border border-[var(--wb-border)] px-2 py-1 text-[12px] text-[var(--wb-text-mute)] transition-colors hover:bg-[var(--wb-bg-inset)] hover:text-[var(--wb-text)] disabled:opacity-40"
      >
        <Icon name="undo-2" size={14} />
        Desfazer rodada · {trechos} {trechos === 1 ? 'trecho' : 'trechos'}
      </button>
    </div>
  );
}

export interface TrechosListProps {
  desvios: Desvio[];
  selectedDesvioIdx: number | null;
  onSeek: (seg: number) => void;
  /** D-1089: o mesmo "trecho aqui" da timeline e do atalho: 5 s a partir do cursor. */
  onAdicionarTrechoNoCursor?: () => void;
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
  /** D-1089 (P10): o trecho ajustado à mão volta à borda da IA, pelo índice gravado. */
  onVoltarABordaDaIa?: (indice: number) => void;
  /** D-1093: na aba Decisões o silêncio do app é da pergunta 1; a lista mostra o resto. */
  semOSilencioDoApp?: boolean;
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
  onAdicionarTrechoNoCursor,
  onRemoverDesvio,
  onGerarManual,
  onGerarTrechosIA,
  pending,
  linhas = SEM_LINHAS,
  riscados = [],
  trechosDaUltimaRodada = 0,
  onRestaurarDesvio,
  onDesfazerRodada,
  onVoltarABordaDaIa,
  semOSilencioDoApp,
}: TrechosListProps) {
  // O índice `i` é o da lista inteira do corte: é por ele que se risca, mesmo filtrada.
  const sortedWithOriginalIdx = useMemo(
    () =>
      desvios
        .map((d, i) => ({ d, i }))
        .filter(({ d }) => !semOSilencioDoApp || naoESilencioDoApp(d))
        .sort((a, b) => hmsParaSeg(a.d.inicio_hms) - hmsParaSeg(b.d.inicio_hms)),
    [desvios, semOSilencioDoApp],
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

  const ocupado = pending.removendo || pending.restaurando;

  return (
    // Sem rolagem própria: quem rola é a coluna das Decisões, com as três perguntas.
    <div className="flex flex-col">
      {cabecalhoDaRodada({
        desvios,
        trechos: trechosDaUltimaRodada,
        pendente: pending.restaurando,
        onDesfazer: onDesfazerRodada,
      })}
      <div className="flex flex-col gap-1.5 px-2.5 py-1.5">
        {sortedWithOriginalIdx.length === 0 && (
          <div className="flex flex-col items-center gap-1 py-6 text-center text-[12px] text-[var(--wb-text-dim)]">
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
          >
            <LinhaDoTrecho
              desvio={d}
              ativo={selectedDesvioIdx === i}
              linhas={linhas}
              pendente={ocupado}
              onSeek={onSeek}
              onRiscar={() => onRemoverDesvio(i)}
              onVoltarABordaDaIa={onVoltarABordaDaIa ? () => onVoltarABordaDaIa(i) : undefined}
            />
          </div>
        ))}
      </div>
      {barraDosTrechos({
        emVoo: pending.claude?.isPending ? ((pending.claude.provider as ProviderIA | undefined) ?? 'claude') : null,
        adicionando: pending.adicionando,
        onGerarManual,
        onGerarTrechosIA,
        onAdicionarNoCursor: onAdicionarTrechoNoCursor,
      })}
      {riscados.length > 0 ? (
        <div className="px-2.5 pb-2">
          <RiscadosDoCorte
            riscados={riscados}
            linhas={linhas}
            pendente={pending.restaurando}
            onRestaurar={onRestaurarDesvio}
          />
        </div>
      ) : null}
    </div>
  );
});
