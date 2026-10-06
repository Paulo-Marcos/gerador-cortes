import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { useFuncaoEstavel } from '@/hooks/useFuncaoEstavel';
import { Button } from '@/components/ui/button';
import { AcaoDeIa } from '@/components/ui/acao-de-ia';
import type { ProviderIA } from '@/lib/providerIa';
import { IconButton } from '@/components/ui/icon-button';
import { Tooltip } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { AvaliacaoBrutoPanel } from '../avaliacao/AvaliacaoBrutoPanel';
import { BlocosTab } from './BlocosTab';
import { resolverBadgeTrecho } from './trechoBadge';
import { hmsParaSeg } from '../timeUtils';
import { useCorte } from '@/features/editor/useCortes';
import { useDiarizarCorte, useFalantes } from '@/features/diarizacao/useDiarizacao';
import type { FalantesMap } from '@/features/diarizacao/api';
import type { Desvio, TranscricaoLinha } from '@/types/models';
import { Icon } from '@/upgrade/Icon';

// ─────────────────────────────────────────────────────────────
// RightTabsPanel — replica `design_reference/src/v2_bruto.jsx:405-624`.
// Funde TrechosPanel + TranscriptPanel num painel com abas.
// Header: grip + 2 abas (Trechos default + Transcricao) + refresh sempre
// visivel a direita.
// Preserva 100% da logica funcional (filtros IA/Manual/Silencios, busca,
// scroll-to, modal manual via `usePromptDesvios`).
//
// Decisões de layout (ver deviations do commit):
//   - "🔍 Buscar na transcrição" fica onde está (topo da aba Transcrição,
//     sempre visível): é usada com frequência ao revisar um corte —
//     escondê-la atrás de um rodapé fechado por padrão pioraria o fluxo
//     comum, então a etapa pediu "só mover se fizer sentido" e aqui não
//     fez.
//   - "Influenciar a capa" saiu do editor (D-871): a capa se decide em
//     Metadados, que já tem o mesmo editor, e aqui ele empurrava as abas
//     para baixo em toda troca de corte.
//   - "⤓ Exportar transcrição (SRT)" não existe (sem hook/endpoint) —
//     decisão já tomada fora desta etapa: não construir agora.
// ─────────────────────────────────────────────────────────────

interface RightTabsPanelProps {
  corteId: string;
  // Trechos
  desvios: Desvio[];
  selectedDesvioIdx: number | null;
  onSeek: (seg: number) => void;
  onAdicionarDesvio: (d: Desvio) => void;
  onRemoverDesvio: (idx: number) => void;
  onGerarManual: () => void;
  onGerarTrechosIA: (provider: 'claude' | 'gemini') => void;
  pendingTrechos: {
    adicionando?: boolean;
    removendo?: boolean;
    claude?: { isPending: boolean; provider?: string };
  };
  // Transcricao
  transcricao?: TranscricaoLinha[];
  currentTime: number;
  onAtualizarTranscricao: () => void;
  transcricaoAtualizando: boolean;
  /** D-610 (casca nova): recolhe a coluna inteira — nem sempre se precisa dela. */
  onRecolher?: () => void;
}

// D-447: a aba "Avaliação" mora aqui, e não numa tela nova, porque a
// pergunta que ela responde — "o que sobrou se sustenta?" — só faz sentido
// ao lado do material que a responde: os trechos removidos e a transcrição.
// D-576: a aba "Ordem" fica ao lado de "Trechos a remover" porque as duas
// respondem perguntas vizinhas sobre o MESMO material — o que sai e em que
// ordem entra o que ficou. Separadas para o editor não confundir remover com
// mover; vizinhas para ele não ter de trocar de tela entre as duas.
type TabId = 'trechos' | 'ordem' | 'transcricao' | 'avaliacao';

/**
 * "00:22:09.000" → "22:09.0". O protótipo v3 mostra décimos: os
 * milissegundos cheios alargavam a coluna de tempo e empurravam o texto
 * do trecho, sem acrescentar precisão útil na leitura.
 */
function mmssDecimo(hms: string): string {
  const semHora = hms.slice(3);
  const ponto = semHora.indexOf('.');
  return ponto === -1 ? semHora : semHora.slice(0, ponto + 2);
}

// D-599: na casca nova o painel e o `.card` de vidro do handoff e as abas seguem
// a gramatica dele — 30 px, 12.5/600, a ativa em ACENTO com sublinhado. A cor na
// aba ativa nao e enfeite: numa coluna com quatro abas e um editor de capa em
// cima, e ela que responde "em qual lista estou" sem ler o rotulo.

export function RightTabsPanel({
  corteId,
  desvios,
  selectedDesvioIdx,
  onSeek,
  onAdicionarDesvio,
  onRemoverDesvio,
  onGerarManual,
  onGerarTrechosIA,
  pendingTrechos,
  transcricao,
  currentTime,
  onAtualizarTranscricao,
  transcricaoAtualizando,
  onRecolher,
}: RightTabsPanelProps) {
  const [tab, setTab] = useState<TabId>('trechos');

  // D-360: diarização por corte. projetoId sai do corte já em cache; o mapa de
  // falantes resolve SPEAKER_xx → nome/canal na etiqueta inline da transcrição.
  // D-740: a lista de trechos é o maior custo do tique de 4 Hz do player e não
  // depende do tempo. Com props estáveis o memo dela segura a redesenhada.
  const aoIrPara = useFuncaoEstavel(onSeek);
  const aoAdicionarDesvio = useFuncaoEstavel(onAdicionarDesvio);
  const aoRemoverDesvio = useFuncaoEstavel(onRemoverDesvio);
  const aoGerarManual = useFuncaoEstavel(onGerarManual);
  const aoGerarTrechosIA = useFuncaoEstavel(onGerarTrechosIA);
  // O objeto de pendências nasce a cada render do pai; reconstruído a partir
  // dos campos, só muda quando algum deles muda.
  const { adicionando, removendo } = pendingTrechos;
  const claudePendente = pendingTrechos.claude?.isPending;
  const claudeProvider = pendingTrechos.claude?.provider;
  const pendenteDosTrechos = useMemo(
    () => ({
      adicionando,
      removendo,
      claude:
        claudePendente === undefined
          ? undefined
          : { isPending: claudePendente, provider: claudeProvider },
    }),
    [adicionando, removendo, claudePendente, claudeProvider],
  );
  const projetoId = useCorte(corteId).data?.projeto_id;
  const falantes = useFalantes(projetoId, tab === 'transcricao').data?.falantes;
  const diarizar = useDiarizarCorte(corteId, projetoId);

  // Decisao Paulo: refresh do header SEMPRE atualiza a transcricao,
  // independente da aba ativa. "Reanalisar trechos" continua via o botao
  // "IA" na sub-barra dentro da aba Trechos.
  const refreshTitle = 'Atualizar transcricao';
  const refreshPending = transcricaoAtualizando;
  const onRefresh = onAtualizarTranscricao;

  return (
    <section
      className="card flex h-full flex-col overflow-hidden"
    >
      {/* D-871: as quatro abas num seletor só — numa coluna de 360 px, a
          faixa rolável deixava Transcrição e Avaliação fora da tela. Os
          respiros são os mínimos para caberem numa fileira, com até 99
          trechos, a partir de 344 px (a coluna numa tela de 1440); mais
          estreita, quebram em duas fileiras, legíveis — reticências viravam
          quatro "Tr…". Os dois ícones ficam: 26 px é o piso da casca. */}
      <header
        className="flex flex-shrink-0 items-center gap-0.5 border-b border-[var(--line2)] px-2 py-2"
      >
        {/* Primeiro da faixa: com quatro abas numa coluna estreita, no fim ele
            ficava fora de vista. */}
        {onRecolher ? (
          <Tooltip label="Recolher a coluna" side="bottom">
            <IconButton
              type="button"
              variant="ghost"
              size="sm"
              onClick={onRecolher}
              aria-label="Recolher a coluna de trechos"
            >
              <Icon name="panel-right-close" size={16} />
            </IconButton>
          </Tooltip>
        ) : null}
        <div
          role="tablist"
          aria-label="Painel do corte"
          style={{
            flex: '1 1 0',
            minWidth: 0,
            display: 'flex',
            flexWrap: 'wrap',
            padding: 2,
            borderRadius: 6,
            background: 'var(--wb-bg-inset)',
          }}
        >
          <TabButton
            active={tab === 'trechos'}
            onClick={() => setTab('trechos')}
            label="Trechos"
            count={desvios.length}
          />
          <TabButton active={tab === 'ordem'} onClick={() => setTab('ordem')} label="Ordem" />
          <TabButton
            active={tab === 'transcricao'}
            onClick={() => setTab('transcricao')}
            label="Transcrição"
          />
          <TabButton active={tab === 'avaliacao'} onClick={() => setTab('avaliacao')} label="Avaliação" />
        </div>
        <Tooltip label={refreshTitle} side="bottom">
          <IconButton
            type="button"
            variant="outline"
            size="sm"
            onClick={onRefresh}
            disabled={refreshPending}
            aria-label={refreshTitle}
          >
            <Icon name={refreshPending ? 'loader-2' : 'rotate-cw'} size={16} className={cn(refreshPending && 'animate-spin')} />
          </IconButton>
        </Tooltip>
      </header>

      {tab === 'avaliacao' ? (
        <AvaliacaoBrutoPanel corteId={corteId} />
      ) : tab === 'ordem' ? (
        <BlocosTab
          corteId={corteId}
          projetoId={projetoId}
          pontoSeg={currentTime}
          onSeek={onSeek}
        />
      ) : tab === 'trechos' ? (
        <TrechosList
          desvios={desvios}
          selectedDesvioIdx={selectedDesvioIdx}
          onSeek={aoIrPara}
          onAdicionarDesvio={aoAdicionarDesvio}
          onRemoverDesvio={aoRemoverDesvio}
          onGerarManual={aoGerarManual}
          onGerarTrechosIA={aoGerarTrechosIA}
          pending={pendenteDosTrechos}
        />
      ) : (
        <TranscriptList
          linhas={transcricao ?? []}
          currentTime={currentTime}
          onSeek={onSeek}
          falantes={falantes}
          onDiarizar={() => diarizar.mutate()}
          diarizando={diarizar.isPending}
        />
      )}

    </section>
  );
}

/**
 * Uma aba do seletor (D-871, canvas "Painel que cabe"): a ativa é a peça
 * clara sobre o fundo `inset`. O contador dos trechos vai no rótulo
 * ("Trechos · 7"), sem pílula vermelha — cor fica para estado, e ter trechos
 * a remover não é um problema.
 */
function TabButton({
  active,
  onClick,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  /** Ausente = aba sem contador. */
  count?: number;
}) {
  const texto = count === undefined ? label : `${label} · ${count}`;
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      title={texto}
      style={{
        maxWidth: '100%',
        height: 28,
        padding: '0 5px',
        border: 0,
        borderRadius: 4,
        background: active ? 'var(--wb-bg-card)' : 'transparent',
        boxShadow: active ? 'var(--shadow-sm)' : 'none',
        color: active ? 'var(--wb-text)' : 'var(--mute)',
        fontSize: 12,
        fontWeight: active ? 600 : 500,
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        cursor: 'pointer',
      }}
    >
      {texto}
    </button>
  );
}

// ───── TrechosList — v2_bruto.jsx:484-548 ─────

// D-422: o badge do trecho passou a mostrar o MOTIVO da remoção (repetição,
// tangente, imprecisão…) em vez de um "IA" único para tudo que a IA propôs. A
// resolução vive em `trechoBadge.ts` (testável, cobre legados sem `categoria`).

const TrechosList = memo(function TrechosList({
  desvios,
  selectedDesvioIdx,
  onSeek,
  onAdicionarDesvio,
  onRemoverDesvio,
  onGerarManual,
  onGerarTrechosIA,
  pending,
}: {
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
    claude?: { isPending: boolean; provider?: string };
  };
}) {
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
    onAdicionarDesvio({
      inicio_hms: '00:00:00',
      fim_hms: '00:00:05',
      motivo: 'Manual — recortado pelo editor',
    });
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* D-871: "Gerar | Claude | Gemini", os provedores pelo nome e dividindo
          a largura. O Manual (colar o JSON de uma IA externa) é raro e virou
          ícone: com o rótulo, os nomes não cabiam numa coluna de 344 px. */}
      <div className="flex flex-shrink-0 items-center gap-1.5 px-3 pb-2 pt-2">
        <AcaoDeIa
          rotulo="Gerar"
          descricao="Gerar trechos a remover"
          emVoo={
            pending.claude?.isPending
              ? ((pending.claude.provider as ProviderIA | undefined) ?? 'claude')
              : null
          }
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
            onClick={adicionarAqui}
            disabled={pending.adicionando}
            aria-label="Adicionar trecho"
            className="flex h-[30px] w-[30px] items-center justify-center rounded-[8px] bg-[var(--wb-accent-soft)] text-[var(--wb-accent)] transition-colors hover:bg-[var(--wb-accent)] hover:text-[var(--wb-accent-fg)] disabled:pointer-events-none disabled:opacity-40"
          >
            <Icon name="plus" size={16} />
          </button>
        </Tooltip>
      </div>

      {/* Lista — v2_bruto.jsx:507-547 */}
      <div className="flex flex-1 flex-col gap-1.5 overflow-y-auto px-2.5 py-2">
        {sortedWithOriginalIdx.length === 0 && (
          <div className="m-auto flex flex-col items-center gap-1 py-8 text-center text-[12px] text-[var(--wb-text-dim)]">
            <Icon name="sparkles" size={20} className="opacity-60" />
            Nenhum trecho marcado.
            <span className="text-[11px]">Use IA / Manual / Silencios para gerar.</span>
          </div>
        )}
        {sortedWithOriginalIdx.map(({ d, i }, sortPos) => {
          const badge = resolverBadgeTrecho(d);
          const ds = hmsParaSeg(d.inicio_hms);
          const de = hmsParaSeg(d.fim_hms);
          const delta = Math.max(0, de - ds);
          const ativo = selectedDesvioIdx === i;
          return (
            <div
              key={`${d.inicio_hms}-${i}`}
              ref={(el) => {
                itemRefs.current[sortPos] = el;
              }}
              className="group/trecho relative"
            >
              <button
                type="button"
                onClick={() => onSeek(ds)}
                className={cn(
                  'group flex w-full cursor-pointer items-start gap-2.5 rounded-[var(--radius-sm)] border bg-[var(--wb-bg-card-elev)] px-2.5 py-2 pr-10 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--wb-focus)]',
                  ativo
                    ? 'border-[var(--sel-line)] bg-[var(--sel-bg)]'
                    : 'border-[var(--wb-border-soft)] hover:border-[var(--wb-border)]',
                )}
                aria-label={`Pular para ${d.inicio_hms}`}
              >
                <div className="flex min-w-[52px] flex-col items-center gap-0.5 rounded text-left transition-opacity group-hover:opacity-80">
                  <span
                    className="font-code text-[10.5px] font-bold text-[var(--wb-text)]"
                    style={{ fontVariantNumeric: 'tabular-nums' }}
                  >
                    {mmssDecimo(d.inicio_hms)}
                  </span>
                  <Icon name="chevron-down" className="text-[var(--wb-text-dim)]" />
                  <span
                    className="font-code text-[10.5px] text-[var(--wb-text-mute)]"
                    style={{ fontVariantNumeric: 'tabular-nums' }}
                  >
                    {mmssDecimo(d.fim_hms)}
                  </span>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="mb-1 flex items-center gap-1.5">
                    <span
                      className="inline-flex items-center rounded-full px-2 py-0.5 font-code text-[10px] font-semibold uppercase tracking-[0.04em]"
                      style={{ background: badge.bg, color: badge.fg }}
                      title={badge.titulo}
                    >
                      {badge.label}
                    </span>
                    {/* D-871: o tempo que sai é informação, não alarme — em
                        cinza, como no canvas ("cor fica para estado"). */}
                    <span
                      className="font-code text-[11px] font-semibold text-[var(--wb-text-mute)]"
                      style={{ fontVariantNumeric: 'tabular-nums' }}
                    >
                      −{delta.toFixed(1)}s
                    </span>
                  </div>
                  {/* DE-PARA-v3 §3: o motivo é apoio, não o conteúdo principal
                      da linha — daí o tom mudo.

                      D-511: mas ele deixou de ser CORTADO. Com `line-clamp-2` o
                      motivo terminava no meio de uma frase, e conferir o corte
                      exigia sair da tela. Um motivo longo ocupa mais três
                      linhas; um motivo pela metade custa uma ida e volta. */}
                  <div className="whitespace-pre-wrap break-words text-[11px] leading-[1.4] text-[var(--wb-text-mute)]">
                    {d.motivo || '—'}
                  </div>
                </div>
              </button>
              <Tooltip label="Remover" side="left">
                {/* D-746: a lixeira é a ação MENOS frequente da linha e era o
                    elemento mais pesado dela. Pequena e apagada; acende quando
                    a linha é apontada ou o teclado chega nela, e só fica
                    vermelha no hover do próprio botão. */}
                <IconButton
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-1.5 top-1.5 h-6 w-6 text-[var(--wb-text-dim)] opacity-40 transition-opacity hover:text-[var(--wb-err-ink)] focus-visible:opacity-100 group-hover/trecho:opacity-100"
                  onClick={() => onRemoverDesvio(i)}
                  disabled={pending.removendo}
                  aria-label="Remover trecho"
                >
                  <Icon name="trash-2" />
                </IconButton>
              </Tooltip>
            </div>
          );
        })}
      </div>
    </div>
  );
});

// ───── TranscriptList — v2_bruto.jsx:550-624 ─────

function TranscriptList({
  linhas,
  currentTime,
  onSeek,
  falantes,
  onDiarizar,
  diarizando,
}: {
  linhas: TranscricaoLinha[];
  currentTime: number;
  onSeek: (seg: number) => void;
  falantes?: FalantesMap;
  onDiarizar: () => void;
  diarizando: boolean;
}) {
  const [busca, setBusca] = useState('');

  // D-360: só mostra a etiqueta quando ao menos uma linha tem falante.
  const temFalante = useMemo(() => linhas.some((l) => l.speaker), [linhas]);

  const linhasFiltradas = useMemo(() => {
    if (!linhas) return [];
    if (!busca.trim()) return linhas;
    const q = busca.toLowerCase();
    return linhas.filter((l) => l.texto.toLowerCase().includes(q));
  }, [linhas, busca]);

  const linhaAtivaIdx = useMemo(() => {
    if (!linhas || linhas.length === 0) return -1;
    let exato = -1;
    let ultimaAtras = -1;
    for (let i = 0; i < linhas.length; i++) {
      const l = linhas[i];
      if (currentTime >= l.start && currentTime < l.end) {
        exato = i;
        break;
      }
      if (currentTime >= l.start) ultimaAtras = i;
    }
    return exato !== -1 ? exato : ultimaAtras;
  }, [linhas, currentTime]);

  const activeRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    activeRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [linhaAtivaIdx]);

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Busca — v2_bruto.jsx:553-582 */}
      <div className="flex-shrink-0 space-y-2 border-b border-[var(--wb-border-soft)] px-3 py-2.5">
        <div className="flex h-[30px] items-center gap-2 rounded-[var(--radius-sm)] border border-[var(--wb-border-soft)] bg-[var(--wb-bg-inset)] px-2.5">
          <Icon name="search" className="text-[var(--wb-text-dim)]" />
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar palavra..."
            className="flex-1 bg-transparent text-[12.5px] text-[var(--wb-text)] outline-none placeholder:text-[var(--wb-text-dim)]"
          />
          <span className="font-code text-[10px] text-[var(--wb-text-dim)]">⌘F</span>
        </div>
        {/* D-360: diariza só este corte (evita rodar o vídeo inteiro). */}
        <Tooltip
          label="Identifica os falantes só neste corte (não roda o vídeo todo)"
          side="bottom"
        >
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-full"
            onClick={onDiarizar}
            disabled={diarizando}
          >
            {diarizando ? <Icon name="loader-2" className="animate-spin" /> : <Icon name="users" />}
            {diarizando ? 'Diarizando...' : 'Diarizar este corte'}
          </Button>
        </Tooltip>
      </div>

      {/* Linhas — v2_bruto.jsx:584-621 */}
      <div className="flex-1 overflow-y-auto py-1">
        {linhasFiltradas.length === 0 && (
          <div className="m-auto py-8 text-center text-[12px] text-[var(--wb-text-dim)]">
            {linhas.length === 0 ? 'Sem transcricao.' : 'Nenhum resultado.'}
          </div>
        )}
        {linhasFiltradas.map((l, i) => {
          const ativa = i === linhaAtivaIdx;
          return (
            <button
              key={`${l.start}-${i}`}
              ref={ativa ? activeRef : undefined}
              type="button"
              onClick={() => onSeek(l.start)}
              className={cn(
                'flex w-full items-baseline gap-2.5 border-l-2 px-3 py-1.5 text-left transition-colors',
                ativa
                  ? 'border-[var(--sel-line)] bg-[var(--sel-bg)]'
                  : 'border-transparent hover:bg-[var(--wb-bg-inset)]',
              )}
            >
              <span
                className={cn(
                  'min-w-[56px] font-code text-[10px]',
                  ativa
                    ? 'font-bold text-[var(--sel-ink)]'
                    : 'font-medium text-[var(--wb-text-dim)]',
                )}
                style={{ fontVariantNumeric: 'tabular-nums' }}
              >
                {hmsString(l.start)}
              </span>
              <span
                className={cn(
                  'text-[13px] leading-snug',
                  ativa ? 'font-medium text-[var(--wb-ink)]' : 'text-[var(--wb-text)]',
                )}
              >
                {temFalante && <FalanteBadge speaker={l.speaker} falantes={falantes} />}
                {l.texto}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// D-360: chip inline do falante. Resolve SPEAKER_xx → nome/canal via mapa; sem
// nome batizado cai para "Falante N". Linhas sem `speaker` (fora da janela
// diarizada) não renderizam badge.
function FalanteBadge({ speaker, falantes }: { speaker?: string; falantes?: FalantesMap }) {
  if (!speaker) return null;
  const info = falantes?.[speaker];
  const isCanal = !!info?.is_canal;
  const nome = info?.nome?.trim();
  const label =
    nome || `Falante ${speaker.replace(/^SPEAKER_?/i, '').replace(/^0+/, '') || speaker}`;
  return (
    <span
      className="mr-1.5 inline-flex items-center rounded-full px-1.5 py-0.5 align-baseline font-code text-[9.5px] font-semibold uppercase tracking-[0.03em]"
      style={
        isCanal
          ? { background: 'var(--wb-accent-soft)', color: 'var(--wb-accent)' }
          : { background: 'var(--wb-violet-soft)', color: 'var(--wb-violet)' }
      }
    >
      {isCanal ? `Canal${nome ? `: ${nome}` : ''}` : label}
    </span>
  );
}

function hmsString(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  const ms = Math.floor((sec % 1) * 10);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${ms}`;
}
