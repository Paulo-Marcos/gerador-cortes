import { useEffect, useState } from 'react';
import { partesDoEditor } from '@/upgrade/modoFoco';
import { useModoFocoAtivo } from '@/upgrade/useModoFoco';
import { BotaoModoFoco } from '../BotaoModoFoco';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { segParaHms, segParaMmSs, validarHms } from '../timeUtils';
import { Icon, ICONE_DO_CONCEITO } from '@/upgrade/Icon';
import { FERRAMENTA_ICONE, FOCO } from '../salaDoEditor';

// ─────────────────────────────────────────────────────────────
// BrutoContextStrip — replica `design_reference/src/v2_bruto.jsx:17-203`.
// Faixa horizontal entre CommonTopBar e o grid do EditorFase1.
// Substitui o antigo `ControlsPanel`.
//
// Da esquerda p/ direita:
//   1. Card "FIM ANTERIOR #N" + timecode
//   2. Bloco No corte / No original / Dur (3 cells com divisores) + botao "Intervalo"
//   3. (condicional) Card accent-soft com 2 inputs + Aplicar
//   4. spacer
//   5. "Liquido (sem trechos)" + timecode --wb-ok
//   6. Card "INICIO PROX #N" + timecode
// ─────────────────────────────────────────────────────────────

interface PrevNextCut {
  numero: number;
  /** Timecode formatado HH:MM:SS.s */
  hms: string;
}

interface BrutoContextStripProps {
  previous?: PrevNextCut | null;
  next?: PrevNextCut | null;
  inicioHms: string;
  fimHms: string;
  /** Inicio do corte em segundos (origem do tempo relativo "No corte"). */
  inicioSeg: number;
  /** Tempo corrente do player em segundos (relativo ao video original). */
  currentTime: number;
  /** Duracao bruta em segundos (fim - inicio) */
  durSeg: number;
  /** Duracao liquida em segundos (apos remover desvios) */
  liquidoSeg: number;
  /** Mostra o editor de intervalo manual (2 inputs + Aplicar). */
  intervaloAberto: boolean;
  onToggleIntervalo: () => void;
  /** Aplicar manualmente novo intervalo. Chamado quando o usuario clica
   *  em "Aplicar" no editor expansivel. */
  onAplicarIntervalo?: (novoInicioHms: string, novoFimHms: string) => void;
}

export function BrutoContextStrip({
  previous,
  next,
  inicioHms,
  fimHms,
  inicioSeg,
  currentTime,
  durSeg,
  liquidoSeg,
  intervaloAberto,
  onToggleIntervalo,
  onAplicarIntervalo,
}: BrutoContextStripProps) {
  // D-1085: no foco a faixa some; fica só o botão de sair, solto no canto.
  if (!partesDoEditor(useModoFocoAtivo()).faixaDeTempos) return <BotaoModoFoco ativo flutuante />;
  return (
    <div data-sala="" className="flex flex-shrink-0 items-center gap-3 pb-3">
      {/* Card "FIM ANTERIOR #N" — v2_bruto.jsx:31-51 */}
      <PrevCard previous={previous} />

      {/* Bloco NO CORTE / NO ORIGINAL / DUR + botao Intervalo.
          IN/OUT removidos: redundantes com o editor Intervalo (mesmos valores).
          "No corte" = currentTime relativo ao inicio do corte.
          "No original" = currentTime absoluto no video completo. */}
      <div className="flex items-stretch overflow-hidden rounded-pilula border border-fio bg-painel-solido">
        <TimeCell
          label="No corte"
          value={segParaMmSs(Math.max(0, currentTime - inicioSeg), true)}
        />
        <TimeCell label="No original" value={segParaHms(Math.max(0, currentTime), true)} />
        <TimeCell label="Duração" value={segParaMmSs(Math.max(0, durSeg), true)} />
        <button
          type="button"
          onClick={onToggleIntervalo}
          title={intervaloAberto ? 'Ocultar intervalo editavel' : 'Editar intervalo manualmente'}
          aria-pressed={intervaloAberto}
          data-sala=""
          className={cn(
            'flex items-center gap-1 px-3 text-micro text-fg-2 transition-colors duration-150 hover:bg-vidro-2 hover:text-fg motion-reduce:transition-none',
            'aria-pressed:bg-iris-suave aria-pressed:text-iris-2',
            FOCO,
          )}
        >
          <Icon name={ICONE_DO_CONCEITO.editar} />
          Intervalo
        </button>
      </div>

      {/* Editor expansivel — v2_bruto.jsx:113-165 */}
      {intervaloAberto && onAplicarIntervalo && (
        <IntervaloEditor
          inicioHms={inicioHms}
          fimHms={fimHms}
          currentTime={currentTime}
          onAplicar={onAplicarIntervalo}
        />
      )}

      <div className="flex-1" />

      {/* Liquido — v2_bruto.jsx:169-177 */}
      <div className="flex flex-col items-end leading-tight">
        <span className="text-micro text-fg-3">Liquido (sem trechos)</span>
        <span className="font-mono text-pequeno tabular-nums text-fg">
          {segParaMmSs(Math.max(0, liquidoSeg), true)}
        </span>
      </div>

      {/* Card "INICIO PROX #N" — v2_bruto.jsx:179-200 */}
      <NextCard next={next} />
      <BotaoModoFoco ativo={false} />
    </div>
  );
}

function TimeCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-r border-fio px-3 py-1 last:border-r-0">
      <div className="text-micro text-fg-3">{label}</div>
      <div className="font-mono text-pequeno tabular-nums leading-tight text-fg">
        {value}
      </div>
    </div>
  );
}

function PrevCard({ previous }: { previous?: PrevNextCut | null }) {
  return (
    <div className="flex items-center gap-2 rounded-pilula border border-fio bg-painel-solido px-3 py-1">
      <Icon name="chevrons-left" className="text-fg-3" />
      <div className="leading-tight">
        <div className="text-micro text-fg-3">
          Fim anterior{' '}
          {previous ? <span className="text-fg-2">#{previous.numero}</span> : '—'}
        </div>
        <div className="font-mono text-pequeno tabular-nums text-fg">
          {previous?.hms ?? '—'}
        </div>
      </div>
    </div>
  );
}

function NextCard({ next }: { next?: PrevNextCut | null }) {
  return (
    <div className="flex items-center gap-2 rounded-pilula border border-fio bg-painel-solido px-3 py-1">
      <div className="text-right leading-tight">
        <div className="text-micro text-fg-3">
          Início do próximo {next ? <span className="text-fg-2">#{next.numero}</span> : '—'}
        </div>
        <div className="font-mono text-pequeno tabular-nums text-fg">
          {next?.hms ?? '—'}
        </div>
      </div>
      <Icon name="chevrons-right" className="text-fg-3" />
    </div>
  );
}

function IntervaloEditor({
  inicioHms,
  fimHms,
  currentTime,
  onAplicar,
}: {
  inicioHms: string;
  fimHms: string;
  currentTime: number;
  onAplicar: (novoInicio: string, novoFim: string) => void;
}) {
  const [inicio, setInicio] = useState(inicioHms);
  const [fim, setFim] = useState(fimHms);
  useEffect(() => {
    setInicio(inicioHms);
    setFim(fimHms);
  }, [inicioHms, fimHms]);

  const valido = validarHms(inicio) && validarHms(fim);
  const currentTimeHms = segParaHms(Math.max(0, currentTime), true);

  return (
    <div className="flex items-center gap-2 rounded-pilula border border-iris-fio bg-iris-suave px-3 py-1">
      <div className="flex items-center gap-1">
        <input
          value={inicio}
          onChange={(e) => setInicio(e.target.value)}
          data-sala=""
          spellCheck={false}
          autoComplete="off"
          className="h-7 w-[96px] rounded-campo border border-campo bg-poco px-2 font-mono text-pequeno tabular-nums text-fg focus-visible:border-iris focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-iris-suave"
          aria-label="Inicio do intervalo"
        />
        <CurrentTimeButton
          ariaLabel="Usar tempo atual no inicio"
          title="Usar tempo atual no inicio"
          onClick={() => setInicio(currentTimeHms)}
        />
      </div>
      <span className="font-mono text-pequeno text-iris">→</span>
      <div className="flex items-center gap-1">
        <input
          value={fim}
          onChange={(e) => setFim(e.target.value)}
          data-sala=""
          spellCheck={false}
          autoComplete="off"
          className="h-7 w-[96px] rounded-campo border border-campo bg-poco px-2 font-mono text-pequeno tabular-nums text-fg focus-visible:border-iris focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-iris-suave"
          aria-label="Fim do intervalo"
        />
        <CurrentTimeButton
          ariaLabel="Usar tempo atual no fim"
          title="Usar tempo atual no fim"
          onClick={() => setFim(currentTimeHms)}
        />
      </div>
      <Button
        type="button"
        size="pq"
        variant="secundario"
        onClick={() => valido && onAplicar(inicio, fim)}
        disabled={!valido}
      >
        Aplicar
      </Button>
    </div>
  );
}

function CurrentTimeButton({
  ariaLabel,
  title,
  onClick,
}: {
  ariaLabel: string;
  title: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      title={title}
      onClick={onClick}
      data-sala=""
      className={FERRAMENTA_ICONE}
    >
      <Icon name="clock-3" />
    </button>
  );
}
