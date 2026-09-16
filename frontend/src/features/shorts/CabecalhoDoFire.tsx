import { Link } from 'react-router-dom';
import {
  ArrowLeft,
  Captions,
  CheckCheck,
  Clapperboard,
  Gauge,
  LayoutGrid,
  LayoutTemplate,
  Redo2,
  RotateCcw,
  Trash2,
  Undo2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { OverflowMenu } from '@/components/ui/overflow-menu';
import { cn, formatarDuracao } from '@/lib/utils';
import { BotaoDeCluster } from './BotaoDeCluster';
import { rotuloDescarteBruto } from './descarteBruto';
import { SeloDeGravacao } from './SeloDeGravacao';
import type { FireComBruto } from './shortsApi';
import type { EdicaoDoShort } from './useEdicaoDoShort';
import { isUpgradeShellEnabled } from '@/upgrade/upgradeFlag';

// D-479: o operador precisa saber a QUALIDADE do que está lendo. A auto-legenda
// erra grafia, e erro de grafia num short vira o produto — o texto é o conteúdo.
const ROTULO_FONTE: Record<string, string> = {
  auto_legenda: 'auto do YouTube',
  asr_local: 'transcrição fiel',
};

interface Props {
  workbench: boolean;
  corteId: string;
  fire: FireComBruto | undefined;
  /** O caminho único de escrita — aqui só para o selo e o par desfazer/refazer. */
  edicao: EdicaoDoShort;
  temPalco: boolean;
  verPalco: boolean;
  onAlternarPalco: () => void;
  /** A fonte da transcrição, ou `null` enquanto ela não chegou. */
  fonteDaTranscricao: string | null;
  temPalavras: boolean;
  legendaVisivel: boolean;
  onAlternarLegenda: () => void;
  velocidade: number;
  /** O player está em 1×? Quem sabe a tolerância é a página (D-581). */
  emVelocidadeNormal: boolean;
  onAlternarVelocidade: () => void;
  descartando: boolean;
  onDescartar: () => void;
  /** D-593: os shorts deste corte já estão em todas as redes? */
  finalizado: boolean;
  alternandoFinalizado: boolean;
  onAlternarFinalizado: () => void;
}

/** D-593: o mesmo selo do card da fila — quem abre um corte fechado precisa saber. */
export function SeloFinalizado() {
  return (
    <span
      className="flex-none rounded-[5px] bg-[var(--wb-bg-inset)] px-1.5 py-0.5 font-code text-[9.5px] uppercase tracking-wide text-[var(--wb-ok-ink)]"
      title="Os shorts deste corte já estão no YouTube, TikTok e Instagram"
    >
      finalizado
    </span>
  );
}

/**
 * D-581: os controles em GRUPOS, e nao numa fileira.
 *
 * Antes eram seis botoes de peso identico lado a lado — palco, legenda,
 * velocidade, lote, menu — e nada dizia que tres deles sao do MESMO assunto (o
 * que a previa mostra) e dois de outro (o que acabou de ser gravado). A fileira
 * era o "muito poluido e dificil de encontrar as coisas": a tela nao agrupava,
 * entao o olho tinha de agrupar a cada vez.
 *
 * Tres clusters, cada um com uma pergunta: o que eu VEJO, o que acabei de
 * FAZER, e para onde eu VOU.
 */
// D-599: na casca nova o titulo, o subtitulo e o "voltar para Shorts" sao da
// CASCA (cabecalho de tela e trilha). O que sobra aqui e a barra de ferramentas
// — os tres grupos de o-que-vejo / o-que-fiz / para-onde-vou — sem borda nem
// fundo proprios, porque ja mora dentro do conteudo.
const CASCA_NOVA = isUpgradeShellEnabled();

export function CabecalhoDoFire({
  workbench,
  corteId,
  fire,
  edicao,
  temPalco,
  verPalco,
  onAlternarPalco,
  fonteDaTranscricao,
  temPalavras,
  legendaVisivel,
  onAlternarLegenda,
  velocidade,
  emVelocidadeNormal,
  onAlternarVelocidade,
  descartando,
  onDescartar,
  finalizado,
  alternandoFinalizado,
  onAlternarFinalizado,
}: Props) {
  return (
    <header
      className={
        CASCA_NOVA
          ? 'flex-none pb-3'
          : cn(
              'flex-none border-b border-[var(--wb-border-soft)] bg-[var(--wb-bg-panel)]',
              workbench ? 'px-4 py-2.5' : 'px-7 py-4',
            )
      }
    >
      <div className="flex flex-wrap items-center gap-2.5">
        {CASCA_NOVA ? null : (
        <>
        <Link
          to="/shorts"
          className="inline-flex items-center gap-1 rounded-[7px] px-1.5 py-1 text-[12px] text-[var(--wb-text-mute)] transition-colors hover:bg-[var(--wb-bg-inset)] hover:text-[var(--wb-text)]"
        >
          <ArrowLeft size={14} aria-hidden />
          Shorts
        </Link>
        <Clapperboard size={16} className="text-[var(--wb-accent)]" aria-hidden />
        <div className="min-w-0">
          <h1 className="truncate text-[14.5px] font-extrabold leading-tight">
            {fire?.titulo || 'Candidatos do Fire'}
          </h1>
          {fire && (
            <p className="truncate text-[11.5px] text-[var(--wb-text-mute)]">
              {fire.projeto_titulo} · bruto de {formatarDuracao(fire.duracao_seg)}
            </p>
          )}
        </div>
        </>
        )}
        {finalizado && <SeloFinalizado />}

        <div className="flex-1" />

        {CASCA_NOVA ? null : <SeloDeGravacao estado={edicao.estado} />}

        {/* ── o que eu vejo ─────────────────────────────────────────── */}
        <div className="flex items-center gap-0.5 rounded-[8px] bg-[var(--wb-bg-inset)] p-0.5">
          {temPalco && (
            <BotaoDeCluster
              ativo={verPalco}
              onClick={onAlternarPalco}
              titulo="Ver o short montado no palco, ou o quadro cru com a janela 9:16"
              rotulo="Palco"
            >
              <LayoutTemplate size={13} aria-hidden />
            </BotaoDeCluster>
          )}
          {fonteDaTranscricao !== null && temPalavras && (
            <BotaoDeCluster
              ativo={legendaVisivel}
              onClick={onAlternarLegenda}
              titulo={`Legenda na prévia — fonte: ${ROTULO_FONTE[fonteDaTranscricao] ?? fonteDaTranscricao}`}
              rotulo="Legenda"
            >
              <Captions size={13} aria-hidden />
            </BotaoDeCluster>
          )}
          {fonteDaTranscricao !== null && !temPalavras && (
            <span
              className="px-1.5 font-code text-[10.5px] text-[var(--wb-text-mute)]"
              title="A transcrição deste corte não tem tempo por palavra (anterior a D-337)."
            >
              sem legenda
            </span>
          )}
          {/* A velocidade vira BOTAO: era so um mostrador, e o pedido foi
              exatamente poder ir e voltar do 1x sem caçar Ctrl+J/K. */}
          <button
            type="button"
            onClick={onAlternarVelocidade}
            title="Alternar entre 1x e a velocidade de trabalho (Ctrl+U). Ctrl+J / Ctrl+K ajustam."
            className={cn(
              'inline-flex h-7 items-center gap-1 rounded-[6px] px-2 font-code text-[11px] tabular-nums transition-colors',
              emVelocidadeNormal
                ? 'text-[var(--wb-text-mute)] hover:bg-[var(--wb-bg-panel)] hover:text-[var(--wb-text)]'
                : 'bg-[var(--wb-accent-soft)] text-[var(--wb-accent-strong,var(--wb-accent))]',
            )}
          >
            <Gauge size={11} aria-hidden />
            {velocidade.toFixed(2)}×
          </button>
        </div>

        {/* ── o que acabei de fazer ─────────────────────────────────── */}
        <div className="flex items-center gap-0.5 rounded-[8px] bg-[var(--wb-bg-inset)] p-0.5">
          <BotaoDeCluster
            ativo={false}
            onClick={edicao.desfazer}
            desabilitado={!edicao.podeDesfazer}
            titulo={
              edicao.podeDesfazer
                ? `Desfazer ${edicao.proximoDesfazer} (Ctrl+Z)`
                : 'Nada para desfazer nesta sessão'
            }
            rotulo="Desfazer"
            soIcone
          >
            <Undo2 size={13} aria-hidden />
          </BotaoDeCluster>
          <BotaoDeCluster
            ativo={false}
            onClick={edicao.refazer}
            desabilitado={!edicao.podeRefazer}
            titulo={edicao.podeRefazer ? 'Refazer (Ctrl+Y)' : 'Nada para refazer'}
            rotulo="Refazer"
            soIcone
          >
            <Redo2 size={13} aria-hidden />
          </BotaoDeCluster>
        </div>

        {/* ── para onde eu vou ──────────────────────────────────────── */}
        {/* Na casca nova a ida para a prateleira mora no cabecalho da tela;
            repeti-la aqui daria dois botoes para o mesmo lugar lado a lado. */}
        {CASCA_NOVA ? null : (
          <Button variant="secondary" size="sm" asChild>
            <Link
              to={`/shorts/${corteId}/workspace`}
              title="A prateleira dos aprovados: prévia lado a lado e publicação em massa"
            >
              <LayoutGrid />
              Workspace
            </Link>
          </Button>
        )}

        {fire && (
          <OverflowMenu
            label="Mais ações deste Fire"
            align="right"
            items={[
              {
                label: finalizado ? 'Reabrir (voltar para a fila)' : 'Marcar como finalizado',
                icon: finalizado ? RotateCcw : CheckCheck,
                disabled: alternandoFinalizado,
                onClick: onAlternarFinalizado,
              },
              {
                label: rotuloDescarteBruto(fire.shorts, fire.bruto_mb),
                icon: Trash2,
                danger: true,
                disabled: descartando,
                onClick: onDescartar,
              },
            ]}
          />
        )}
      </div>
    </header>
  );
}
