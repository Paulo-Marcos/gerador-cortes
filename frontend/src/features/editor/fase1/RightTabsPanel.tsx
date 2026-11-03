import { useEffect, useMemo, useRef, useState } from 'react';
import { useFuncaoEstavel } from '@/hooks/useFuncaoEstavel';
import { Button } from '@/components/ui/button';
import { IconButton } from '@/components/ui/icon-button';
import { Tooltip } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { AvaliacaoBrutoPanel } from '../avaliacao/AvaliacaoBrutoPanel';
import { BlocosTab } from './BlocosTab';
import { TrechosList, usePendenciasDosTrechos } from './TrechosList';
import type { TrechosRiscados } from '../useTrechosRiscados';
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
  /** D-1017 (RN-36): riscar, restaurar e desfazer a rodada. */
  riscados?: TrechosRiscados;
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
  riscados,
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
  const aoRemoverDesvio = useFuncaoEstavel((indice: number) => riscados?.riscar(indice));
  const aoGerarManual = useFuncaoEstavel(onGerarManual);
  const aoGerarTrechosIA = useFuncaoEstavel(onGerarTrechosIA);
  const aoRestaurarDesvio = useFuncaoEstavel((indice: number) => riscados?.restaurar(indice));
  const aoDesfazerRodada = useFuncaoEstavel(() => riscados?.desfazerRodada());
  const pendenteDosTrechos = usePendenciasDosTrechos(pendingTrechos, riscados?.ocupado);
  const corteAtual = useCorte(corteId).data;
  const projetoId = corteAtual?.projeto_id;
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
          linhas={transcricao}
          riscados={corteAtual?.desvios_riscados}
          trechosDaUltimaRodada={corteAtual?.trechos_da_ultima_rodada}
          onRestaurarDesvio={aoRestaurarDesvio}
          onDesfazerRodada={aoDesfazerRodada}
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
