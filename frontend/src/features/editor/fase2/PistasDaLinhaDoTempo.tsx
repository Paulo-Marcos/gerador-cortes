import type { CSSProperties, KeyboardEvent, MouseEvent, PointerEvent, ReactNode, RefObject } from 'react';
import { Tooltip } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import type { CenaRemotion, SegmentoDetectado } from '@/types/models';
import type { YoutubeLayoutRegion } from '@/shared/palco/youtubeLayout';
import { Icon } from '@/upgrade/Icon';
import { FOCO } from '../salaDoEditor';
import { segParaMmSs } from '../timeUtils';
import { TRACO_DA_CENA_ATUAL } from './agulhaDaPos';
import { ComOrigensDoPlano, IconeDaOrigem } from './CenaComOrigem';
import { ORIGENS } from './planoDasCenas';
import { metaCena } from './sceneTypes';
import { SceneTypeIcon, sceneTypeStyle } from './SceneTypeIcon';

// D-1164 (E-069 H-18) · as três pistas da linha do tempo da Pós (DIRECAO §7.4): Cenas, Layout
// e Áudio, todas na MESMA régua. A coluna do rótulo e as bordas da pista são as mesmas nas três
// (76 px de rótulo), e é por isso que a agulha e os blocos caem no mesmo ponto.

// A coluna do rótulo tem 76 px (`w-[76px]`) e a agulha a conta em `POSICAO_DA_AGULHA`.

/** Space e Enter num bloco não disparam o clique: o atalho global de tocar/pausar é o do Space. */
export function bloqueiaTeclaDeAtivar(event: KeyboardEvent<HTMLElement>): void {
  if (event.key === ' ' || event.key === 'Enter') event.preventDefault();
}

const PISTA =
  'relative flex-1 overflow-hidden rounded-etiqueta border border-fio bg-poco';

const BLOCO =
  'absolute z-10 flex items-center gap-1.5 overflow-hidden border px-2 transition-colors duration-150 motion-reduce:transition-none ' +
  'left-[var(--l)] w-[var(--w)] ' +
  FOCO;

/** Variáveis de posição do bloco: a geometria vem do dado e roda por `--l` e `--w`. */
function posicao(inicio: number, fim: number, duracao: number, larguraMinima: number): CSSProperties {
  const esquerda = Math.max(0, Math.min(100, (inicio / duracao) * 100));
  const largura = Math.max(larguraMinima, ((fim - inicio) / duracao) * 100);
  return { '--l': `${esquerda}%`, '--w': `${largura}%` } as CSSProperties;
}

export interface GestosDaPista {
  podeNavegar: boolean;
  readOnly: boolean;
  duracao: number;
  onSeek: (seg: number) => void;
  aoClicarNoFundo: (event: MouseEvent<HTMLDivElement>) => void;
  aoApertarNoFundo: (event: PointerEvent<HTMLDivElement>) => void;
  /** Segundos sob o ponteiro, medidos na pista que o recebeu. */
  segundosSob: (event: { clientX: number }, pista: HTMLElement) => number;
}

function RotuloDaPista({ children }: { children: ReactNode }) {
  return (
    <div className="flex w-[76px] flex-none items-center gap-1 text-micro text-fg-3">
      {children}
    </div>
  );
}

// ── Cenas ──────────────────────────────────────────────────────────────────

interface PistaDeCenasProps extends GestosDaPista {
  pistaRef: RefObject<HTMLDivElement | null>;
  cenas: CenaRemotion[];
  corteId?: string;
  ativaIdx?: number;
  selecionadaIdx?: number | null;
  onSelectCena?: (idx: number | null, opts?: { tempo: number; abrirAba: boolean }) => void;
}

export function PistaDeCenas(p: PistaDeCenasProps) {
  return (
    <div className="mb-1.5 flex items-center gap-2">
      <RotuloDaPista>Cenas</RotuloDaPista>
      <div
        ref={p.pistaRef}
        data-testid="pista-cenas"
        className={cn(PISTA, 'h-[68px]', p.podeNavegar ? 'cursor-pointer' : 'cursor-default')}
        onPointerDown={p.aoApertarNoFundo}
        onClick={p.aoClicarNoFundo}
      >
        <ComOrigensDoPlano corteId={p.corteId} cenas={p.cenas}>
          {(origens) => p.cenas.map((cena, idx) => <BlocoDeCena key={`${cena.tipo}-${idx}-${cena.inicio}`} p={p} cena={cena} idx={idx} origens={origens} />)}
        </ComOrigensDoPlano>
      </div>
    </div>
  );
}

function BlocoDeCena({
  p,
  cena,
  idx,
  origens,
}: {
  p: PistaDeCenasProps;
  cena: CenaRemotion;
  idx: number;
  origens: Parameters<Parameters<typeof ComOrigensDoPlano>[0]['children']>[0];
}) {
  const origem = origens?.[idx];
  const cor = origem ? ORIGENS[origem] : sceneTypeStyle(cena.tipo);
  const meta = metaCena(cena.tipo);
  const rotuloDaOrigem = origem ? `, ${ORIGENS[origem].rotulo}` : '';
  const variaveis = {
    ...posicao(cena.inicio, cena.fim, p.duracao, 1),
    '--fundo': cor.soft,
    '--borda': cor.border,
    '--cor': cor.color,
  } as CSSProperties;

  const aoClicar = (event: MouseEvent<HTMLButtonElement>) => {
    if (!p.podeNavegar) return;
    event.stopPropagation();
    const pista = p.pistaRef.current;
    const tempo = pista ? p.segundosSob(event, pista) : cena.inicio;
    // Ctrl+clique seleciona a cena e abre a aba Cenas; só na edição.
    if ((event.ctrlKey || event.metaKey) && !p.readOnly) p.onSelectCena?.(idx, { tempo, abrirAba: true });
    p.onSeek(tempo);
  };

  return (
    <button
      type="button"
      data-sala=""
      data-atual={p.ativaIdx === idx ? '' : undefined}
      data-tracejada={'tracejada' in cor && cor.tracejada ? '' : undefined}
      title={`${meta.label}${origem ? ` · ${ORIGENS[origem].rotulo}` : ''} · ${cena.texto || ''} · ${segParaMmSs(cena.inicio, true)}`}
      onKeyDown={bloqueiaTeclaDeAtivar}
      onClick={aoClicar}
      disabled={!p.podeNavegar}
      aria-label={`Cena ${meta.label}${rotuloDaOrigem}`}
      aria-pressed={p.selecionadaIdx === idx}
      style={variaveis}
      className={cn(
        BLOCO,
        'bottom-1 top-1 rounded-ladrilho border-[var(--borda)] bg-[var(--fundo)] text-[var(--cor)]',
        'data-[tracejada]:border-dashed data-[atual]:border-2 aria-pressed:border-2 aria-pressed:border-iris',
        TRACO_DA_CENA_ATUAL,
        p.podeNavegar ? 'cursor-pointer' : 'cursor-default',
      )}
    >
      <SceneTypeIcon tipo={cena.tipo} />
      <span className="truncate text-micro text-fg">
        {origem && <IconeDaOrigem origem={origem} />}
        {cena.texto || meta.label}
      </span>
    </button>
  );
}

// ── Layout ─────────────────────────────────────────────────────────────────

interface PistaDeLayoutProps extends GestosDaPista {
  pistaRef: RefObject<HTMLDivElement | null>;
  regioes: YoutubeLayoutRegion[];
  selecionadaIdx?: number | null;
  arrastandoIdx?: number;
  podeRedimensionar: boolean;
  segmentosDetectados?: SegmentoDetectado[];
  detectando: boolean;
  onReprocessar?: () => void;
  onSelectRegion?: (idx: number | null, opts?: { tempo: number; abrirAba: boolean }) => void;
  onSelectSegmentoDetectado?: (indice: number, anchorClientX: number) => void;
  onComecarRedimensionar: (
    event: PointerEvent<HTMLSpanElement>,
    idx: number,
    borda: 'inicio' | 'fim',
    regiao: YoutubeLayoutRegion,
  ) => void;
}

export function PistaDeLayout(p: PistaDeLayoutProps) {
  return (
    <div className="mb-1.5 flex items-center gap-2">
      <RotuloDaPista>
        Layout
        {!p.readOnly && p.onReprocessar && (
          <Tooltip label={p.detectando ? 'Detectando segmentos…' : 'Reprocessar segmentos detectados no bruto'} side="top">
            <button
              type="button"
              data-sala=""
              onClick={p.onReprocessar}
              disabled={p.detectando}
              aria-label="Reprocessar segmentos detectados"
              className={cn(
                'grid size-5 place-items-center rounded-pilula text-fg-3 transition-colors duration-150 hover:bg-vidro-2 hover:text-fg disabled:cursor-wait disabled:text-fg-off motion-reduce:transition-none',
                FOCO,
              )}
            >
              <Icon name={p.detectando ? 'loader-2' : 'rotate-cw'} className={p.detectando ? 'animate-spin' : undefined} />
            </button>
          </Tooltip>
        )}
      </RotuloDaPista>
      <div
        ref={p.pistaRef}
        data-testid="pista-layout"
        className={cn(PISTA, 'h-11', p.podeNavegar ? 'cursor-pointer' : 'cursor-default')}
        onPointerDown={p.aoApertarNoFundo}
        onClick={p.aoClicarNoFundo}
      >
        {!p.readOnly && p.segmentosDetectados?.map((seg, idx) => <SegmentoSugerido key={`detectado-${idx}-${seg.inicio}`} p={p} seg={seg} idx={idx} />)}
        {p.regioes.map((regiao, idx) => (
          <BlocoDeRegiao key={`${regiao.modo}-${idx}-${regiao.inicio}`} p={p} regiao={regiao} idx={idx} />
        ))}
      </div>
    </div>
  );
}

function SegmentoSugerido({ p, seg, idx }: { p: PistaDeLayoutProps; seg: SegmentoDetectado; idx: number }) {
  if (seg.status !== 'sugerido') return null;
  const aoClicar = (event: MouseEvent<HTMLButtonElement>) => {
    if (p.readOnly) return;
    event.stopPropagation();
    if (event.ctrlKey || event.metaKey) {
      p.onSelectSegmentoDetectado?.(idx, event.clientX);
      return;
    }
    const pista = p.pistaRef.current;
    p.onSeek(pista ? p.segundosSob(event, pista) : seg.inicio);
  };
  return (
    <button
      type="button"
      data-sala=""
      title={`Sugestão · ${segParaMmSs(seg.inicio, true)} → ${segParaMmSs(seg.fim, true)} (Ctrl+Click para decidir)`}
      onKeyDown={bloqueiaTeclaDeAtivar}
      onClick={aoClicar}
      aria-label="Segmento detectado (sugestão)"
      style={posicao(seg.inicio, seg.fim, p.duracao, 0.5)}
      className={cn(
        'absolute bottom-px top-px z-[5] left-[var(--l)] w-[var(--w)] cursor-pointer rounded-etiqueta border border-dashed border-aviso/70 bg-aviso/10 opacity-75 transition-opacity hover:opacity-100 motion-reduce:transition-none',
        FOCO,
      )}
    />
  );
}

function BlocoDeRegiao({ p, regiao, idx }: { p: PistaDeLayoutProps; regiao: YoutubeLayoutRegion; idx: number }) {
  const cheia = regiao.modo === 'full';
  const aoClicar = (event: MouseEvent<HTMLButtonElement>) => {
    if (!p.podeNavegar) return;
    event.stopPropagation();
    const pista = p.pistaRef.current;
    const tempo = pista ? p.segundosSob(event, pista) : regiao.inicio;
    if ((event.ctrlKey || event.metaKey) && !p.readOnly) p.onSelectRegion?.(idx, { tempo, abrirAba: true });
    p.onSeek(tempo);
  };
  return (
    <button
      type="button"
      data-sala=""
      data-redimensionando={p.arrastandoIdx === idx ? '' : undefined}
      title={`${regiao.modo} · ${segParaMmSs(regiao.inicio, true)} → ${segParaMmSs(regiao.fim, true)}`}
      onKeyDown={bloqueiaTeclaDeAtivar}
      onClick={aoClicar}
      disabled={!p.podeNavegar}
      aria-label={`Região ${regiao.modo}`}
      aria-pressed={p.selecionadaIdx === idx}
      style={posicao(regiao.inicio, regiao.fim, p.duracao, 0.5)}
      className={cn(
        BLOCO,
        'group bottom-[3px] top-[3px] rounded-etiqueta',
        cheia ? 'border-iris-fio bg-iris-suave text-iris-2' : 'border-[color-mix(in_srgb,var(--cc-info)_60%,transparent)] bg-[color-mix(in_srgb,var(--cc-info)_20%,transparent)] text-[color:var(--cc-info)]',
        'aria-pressed:border-2 aria-pressed:border-fg data-[redimensionando]:ring-2 data-[redimensionando]:ring-iris',
        p.podeNavegar ? 'cursor-pointer' : 'cursor-default',
      )}
    >
      {p.podeRedimensionar && (
        <>
          <AlcaDeRedimensionar lado="inicio" aoApertar={(e) => p.onComecarRedimensionar(e, idx, 'inicio', regiao)} />
          <AlcaDeRedimensionar lado="fim" aoApertar={(e) => p.onComecarRedimensionar(e, idx, 'fim', regiao)} />
        </>
      )}
      {/* A identidade do bloco é a cor; o quadradinho reforça a borda para quem não distingue tons. */}
      <span className={cn('size-2 rounded-etiqueta', cheia ? 'bg-iris' : 'bg-[color:var(--cc-info)]')} aria-hidden />
    </button>
  );
}

function AlcaDeRedimensionar({
  lado,
  aoApertar,
}: {
  lado: 'inicio' | 'fim';
  aoApertar: (event: PointerEvent<HTMLSpanElement>) => void;
}) {
  return (
    <span
      aria-hidden
      onPointerDown={aoApertar}
      onClick={(event) => event.stopPropagation()}
      className={cn(
        'absolute bottom-0 top-0 z-10 w-2 cursor-ew-resize bg-fg/10 opacity-70 transition-opacity hover:bg-fg/25 group-hover:opacity-100 motion-reduce:transition-none',
        lado === 'inicio' ? 'left-0 rounded-l-etiqueta border-l border-fg-2' : 'right-0 rounded-r-etiqueta border-r border-fg-2',
      )}
    />
  );
}

// ── Áudio ──────────────────────────────────────────────────────────────────

interface PistaDeAudioProps extends GestosDaPista {
  pistaRef: RefObject<HTMLDivElement | null>;
  barras: number[];
}

/** A onda do corte líquido, na mesma régua das outras duas pistas. */
export function PistaDeAudio({ pistaRef, barras, podeNavegar, aoApertarNoFundo, aoClicarNoFundo }: PistaDeAudioProps) {
  return (
    <div className="flex items-center gap-2">
      <RotuloDaPista>Áudio</RotuloDaPista>
      <div
        ref={pistaRef}
        data-testid="pista-audio"
        className={cn(PISTA, 'h-9', podeNavegar ? 'cursor-pointer' : 'cursor-default')}
        onPointerDown={aoApertarNoFundo}
        onClick={aoClicarNoFundo}
      >
        <div aria-hidden className="pointer-events-none absolute inset-[2px] flex items-center gap-px overflow-hidden">
          {barras.map((valor, idx) => (
            <span
              key={`onda-${idx}`}
              style={{ '--h': `${Math.max(14, Math.min(100, valor * 96))}%` } as CSSProperties}
              className="h-[var(--h)] min-w-px flex-1 rounded-pilula bg-[color-mix(in_srgb,var(--cc-info)_40%,transparent)]"
            />
          ))}
        </div>
      </div>
    </div>
  );
}
