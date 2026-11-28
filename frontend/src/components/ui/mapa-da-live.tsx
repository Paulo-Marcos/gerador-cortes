import * as React from 'react';
import { Selo, type TomDoSelo } from '@/components/ui/selo';
import {
  marcasDoMapa,
  posicaoNoMapa,
  tempoDaLive,
  type MarcaDoMapa,
  type PosicaoNoMapa,
} from '@/lib/posicaoNoMapa';
import { cn } from '@/lib/utils';

// D-1121 (E-069 H-11a) · Mapa da live: a barra de 0:00 ao fim, com os cortes no ponto onde
// nasceram. É a peça mais própria do CutCut (DIRECAO §3.3, §6, §7.2).
//
// `<nav>` com um `<a>` por corte. A posição vem de `posicaoNoMapa` e entra no CSS por
// `--inicio` e `--largura` (geometria de execução; a catraca `estiloInline` só aceita `--x`).
// ACESO × APAGADO (§3.3): proposto e aprovado são vidro; pronto é pílula clara com halo; riscado
// é contorno tracejado. Aprovado (D-1152) ainda está em produção: não acende, só muda a palavra.
// O corte ABERTO (`aria-current`) é o único no feixe: "onde estou" (§3.1). O mapa
// fala em LUZ, o selo fala em COR: por isso o estado do corte aberto aparece num `Selo`
// ao lado e os cortes não ganham verde nem âmbar.
// Sem `backdrop-filter` (§3.6): a pista é `poco` chapado.

export type EstadoDoCorteNoMapa = 'proposto' | 'aprovado' | 'pronto' | 'riscado';

export type CorteDoMapa = {
  id: string;
  numero: number;
  /** O título do corte: vai no `aria-label`, é como o leitor de tela o reconhece. */
  nome: string;
  inicioSeg: number;
  fimSeg: number;
  estado: EstadoDoCorteNoMapa;
  /** Para onde o `<a>` aponta. Sem isso, `#corte-<id>` (a linha correspondente da lista). */
  href?: string;
};

const ROTULO_DO_ESTADO: Record<EstadoDoCorteNoMapa, string> = {
  proposto: 'Proposto',
  aprovado: 'Aprovado',
  pronto: 'Pronto',
  riscado: 'Riscado',
};

// DIRECAO §5: proposto e aprovado → neutro · pronto → convite · riscado → inerte.
const TOM_DO_ESTADO: Record<EstadoDoCorteNoMapa, TomDoSelo> = {
  proposto: 'neutro',
  aprovado: 'neutro',
  pronto: 'convite',
  riscado: 'inerte',
};

/** "Corte 2, Como começar, de 0:53:26 a 1:11:38, pronto, aberto". Nome, intervalo e estado. */
export function rotuloDoCorte(c: CorteDoMapa, aberto: boolean): string {
  const partes = [
    `Corte ${c.numero}`,
    c.nome,
    `de ${tempoDaLive(c.inicioSeg)} a ${tempoDaLive(c.fimSeg)}`,
    ROTULO_DO_ESTADO[c.estado].toLowerCase(),
  ];
  if (aberto) partes.push('aberto');
  return partes.filter(Boolean).join(', ');
}

/** Para onde a tecla leva o foco entre os cortes: setas andam, Home/End vão às pontas, e nas pontas o foco para. */
export function destinoDaTecla(tecla: string, atual: number, total: number): number | null {
  if (total <= 0) return null;
  const alvo =
    tecla === 'ArrowRight'
      ? atual + 1
      : tecla === 'ArrowLeft'
        ? atual - 1
        : tecla === 'Home'
          ? 0
          : tecla === 'End'
            ? total - 1
            : null;
  return alvo === null ? null : Math.min(Math.max(alvo, 0), total - 1);
}

/** Com `onAbrir` o clique é da tela (realça a linha da lista); sem ele, o `<a>` navega ao `href`. */
export function aoClicarNoCorte(id: string, onAbrir?: (id: string) => void) {
  if (!onAbrir) return undefined;
  return (e: { preventDefault: () => void }) => {
    e.preventDefault();
    onAbrir(id);
  };
}

// Proposto e aprovado: a mesma luz apagada, que responde ao ponteiro.
const PILULA_APAGADA = 'border-fio-2 bg-vidro-3 hover:bg-fg/[.26]';

const ESTADO_DA_PILULA: Record<EstadoDoCorteNoMapa, string> = {
  proposto: PILULA_APAGADA,
  aprovado: PILULA_APAGADA,
  pronto:
    'border-transparent bg-fg/[.88] shadow-[0_0_18px_-4px_color-mix(in_srgb,var(--cc-fg)_55%,transparent)] hover:bg-fg',
  riscado: 'border-dashed border-fio-2 bg-transparent shadow-none',
};

// A cor do NÚMERO mora no número, não no `<a>`: a casca legada (`.ap a { color }`) vence uma
// classe no link, e um número claro sobre a pílula clara some. O número lê o estado do `<a>` por `group`.
const NUMERO_DO_ESTADO: Record<EstadoDoCorteNoMapa, string> = {
  proposto: 'text-fg',
  aprovado: 'text-fg',
  pronto: 'text-app',
  riscado: 'text-fg-3',
};
const NUMERO_ABERTO =
  'group-aria-[current=true]:font-medium group-aria-[current=true]:text-sobre-feixe';

// O corte aberto: feixe com brilho (o único lugar do mapa que o usa).
const PILULA_ABERTA =
  'aria-[current=true]:border-transparent aria-[current=true]:bg-feixe aria-[current=true]:shadow-[inset_0_1px_0_rgb(255_255_255/.5),0_0_24px_-2px_var(--cc-feixe-brilho)]';

const TAMANHO = {
  normal: {
    pista: 'h-[50px]',
    corte: 'inset-y-[5px] min-w-[22px] [--piso:22px]',
    marca: 'inset-y-2',
  },
  mini: { pista: 'h-[30px]', corte: 'inset-y-[3px] min-w-4 [--piso:16px]', marca: 'inset-y-[5px]' },
} as const;

// No compacto (D-1153) o número só aparece se couber na FAIXA que o corte ocupa de verdade. A
// pílula não serve de medida: o piso de 16 px a alarga por cima do vizinho e os números
// encostavam. Como cortes não dividem o mesmo tempo, número dentro da própria faixa não bate
// em outro. A conta é do CSS: a pista é a referência (`cqw`) e a faixa, a consultada.
const FAIXA_DO_NUMERO =
  'flex w-[var(--faixa)] flex-none justify-center [container-type:inline-size]';
const NUMERO_SE_COUBER = {
  umDigito: 'hidden [@container_(min-width:14px)]:inline',
  doisDigitos: 'hidden [@container_(min-width:20px)]:inline',
};

/** Marca com rótulo só até aqui: depois dela o texto bateria no tempo final ("2:30" + "2:41:00"). */
const LIMITE_DO_ROTULO_PCT = 90;

/** "0:30", "1:00": as marcas da pista são de meia em meia hora, então h:mm basta. */
function horaMinuto(seg: number): string {
  const h = Math.floor(seg / 3600);
  const m = Math.floor((seg % 3600) / 60);
  return `${h}:${String(m).padStart(2, '0')}`;
}

export interface MapaDaLiveProps extends Omit<
  React.HTMLAttributes<HTMLElement>,
  'children' | 'onSelect'
> {
  /** Duração da live em segundos. Sem ela (0, NaN) o mapa não inventa posição: os cortes se enfileiram. */
  duracaoSeg: number;
  cortes: CorteDoMapa[];
  /** O corte aberto: o ÚNICO no feixe. */
  abertoId?: string;
  /** Abrir um corte. Com isto, o clique não navega: quem decide é a tela (realça a linha da lista). */
  onAbrir?: (id: string) => void;
  tamanho?: 'normal' | 'mini';
}

type Tamanho = (typeof TAMANHO)[keyof typeof TAMANHO];

/** O número da pílula. Tamanho num span e cor no de dentro: o `cn` leria `text-micro` como cor. */
function NumeroDoCorte({ corte, medir }: { corte: CorteDoMapa; medir: boolean }) {
  const seCouber = corte.numero < 10 ? NUMERO_SE_COUBER.umDigito : NUMERO_SE_COUBER.doisDigitos;
  const numero = (
    <span aria-hidden className={medir ? `text-micro ${seCouber}` : 'text-micro'}>
      <span className={cn(NUMERO_DO_ESTADO[corte.estado], NUMERO_ABERTO)}>{corte.numero}</span>
    </span>
  );
  return medir ? <span className={FAIXA_DO_NUMERO}>{numero}</span> : numero;
}

/** Um corte: o `<a>` com a posição por variável CSS e o número lido pelo estado. */
function PilulaDoCorte({
  corte: c,
  pos,
  aberto,
  t,
  medirNumero,
  onAbrir,
}: {
  corte: CorteDoMapa;
  pos: PosicaoNoMapa | null;
  aberto: boolean;
  t: Tamanho;
  /** Só o mapa compacto com duração conhecida: o número depende de caber. */
  medirNumero: boolean;
  onAbrir?: (id: string) => void;
}) {
  const geometria = pos
    ? ({
        '--inicio': `${pos.inicioPct}%`,
        '--largura': `${pos.larguraPct}%`,
        ...(medirNumero && { '--faixa': `${pos.larguraPct}cqw` }),
      } as React.CSSProperties)
    : undefined;
  return (
    <a
      data-corte={c.id}
      data-sala=""
      data-estado={c.estado}
      href={c.href ?? `#corte-${c.id}`}
      aria-label={rotuloDoCorte(c, aberto)}
      aria-current={aberto ? 'true' : undefined}
      onClick={aoClicarNoCorte(c.id, onAbrir)}
      style={geometria}
      className={cn(
        'group flex items-center justify-center overflow-hidden rounded-pilula border font-mono leading-none no-underline',
        'shadow-topo transition-[background-color,transform] duration-150 motion-reduce:transition-none',
        'hover:scale-y-[1.08] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foco',
        pos
          ? cn(
              'absolute left-[min(var(--inicio),calc(100%-var(--piso)))] w-[var(--largura)]',
              t.corte,
            )
          : cn('relative', t.corte),
        ESTADO_DA_PILULA[c.estado],
        PILULA_ABERTA,
      )}
    >
      <NumeroDoCorte corte={c} medir={medirNumero && pos !== null} />
    </a>
  );
}

/** Os tempos de baixo: 0:00, uma marca a cada 30 min e o fim. Sem duração, o aviso. */
function TemposDaPista({ duracaoSeg, marcas }: { duracaoSeg: number; marcas: MarcaDoMapa[] }) {
  if (marcas.length === 0 && !(duracaoSeg > 0)) {
    return (
      <p data-parte="sem-duracao" className="mt-1.5 text-pequeno">
        <span className="text-fg-3">
          A duração da live não é conhecida: os cortes aparecem em fila, sem posição.
        </span>
      </p>
    );
  }
  return (
    <div aria-hidden data-parte="tempos" className="relative mt-1.5 h-[18px] text-fg-3">
      <span className="num absolute left-0 top-0">0:00</span>
      {/* O tempo do fim ocupa a ponta direita: o rótulo da marca que cai colada nele sai (a linha fica). */}
      {marcas
        .filter((m) => m.pct <= LIMITE_DO_ROTULO_PCT)
        .map((m) => (
          <span
            key={m.seg}
            style={{ '--x': `${m.pct}%` } as React.CSSProperties}
            className="num absolute left-[var(--x)] top-0 -translate-x-1/2"
          >
            {horaMinuto(m.seg)}
          </span>
        ))}
      <span className="num absolute right-0 top-0">{tempoDaLive(duracaoSeg)}</span>
    </div>
  );
}

/** O corte aberto em palavras: o estado vai num `Selo` (o mapa fala em luz, o selo em cor). */
function ResumoDoAberto({ corte }: { corte: CorteDoMapa }) {
  return (
    <p data-parte="aberto" className="mt-3 flex min-w-0 items-center gap-2 text-corpo">
      <Selo tom={TOM_DO_ESTADO[corte.estado]}>{ROTULO_DO_ESTADO[corte.estado]}</Selo>
      <span className="truncate">
        <span className="text-fg">
          Corte {corte.numero} · {corte.nome}
        </span>
      </span>
      <span className="num flex-none text-fg-3">
        {tempoDaLive(corte.inicioSeg)}–{tempoDaLive(corte.fimSeg)}
      </span>
    </p>
  );
}

export const MapaDaLive = React.forwardRef<HTMLElement, MapaDaLiveProps>(function MapaDaLive(
  { duracaoSeg, cortes, abertoId, onAbrir, tamanho = 'normal', className, ...props },
  ref,
) {
  const t = TAMANHO[tamanho];
  const sabeDuracao = Number.isFinite(duracaoSeg) && duracaoSeg > 0;
  const marcas = marcasDoMapa(duracaoSeg);
  const medirNumero = tamanho === 'mini' && sabeDuracao;
  const aberto = cortes.find((c) => c.id === abertoId);
  const pistaRef = React.useRef<HTMLDivElement>(null);

  // Setas andam entre os cortes (README: "operável pelo teclado"). Home/End vão às pontas.
  const teclar = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const links = Array.from(
      pistaRef.current?.querySelectorAll<HTMLAnchorElement>('a[data-corte]') ?? [],
    );
    const i = links.findIndex((el) => el === document.activeElement);
    if (i < 0) return;
    const destino = destinoDaTecla(e.key, i, links.length);
    if (destino === null) return;
    e.preventDefault();
    links[destino]?.focus();
  };

  return (
    <nav
      ref={ref}
      aria-label="Mapa da live"
      data-tamanho={tamanho}
      className={cn('relative', className)}
      {...props}
    >
      <div
        ref={pistaRef}
        onKeyDown={teclar}
        className={cn(
          'relative rounded-pilula border border-fio bg-poco shadow-[inset_0_2px_8px_rgb(0_0_0/.25)]',
          t.pista,
          !sabeDuracao && 'flex items-stretch gap-1 p-[3px]',
          medirNumero && '[container-type:inline-size]',
        )}
      >
        {sabeDuracao &&
          marcas.map((m) => (
            <span
              key={m.seg}
              aria-hidden
              data-marca={m.seg}
              style={{ '--x': `${m.pct}%` } as React.CSSProperties}
              className={cn('absolute left-[var(--x)] w-px bg-fio-2', t.marca)}
            />
          ))}
        {cortes.map((c) => (
          <PilulaDoCorte
            key={c.id}
            corte={c}
            pos={sabeDuracao ? posicaoNoMapa(c.inicioSeg, c.fimSeg, duracaoSeg) : null}
            aberto={c.id === abertoId}
            t={t}
            medirNumero={medirNumero}
            onAbrir={onAbrir}
          />
        ))}
      </div>
      <TemposDaPista duracaoSeg={sabeDuracao ? duracaoSeg : 0} marcas={marcas} />
      {aberto && <ResumoDoAberto corte={aberto} />}
    </nav>
  );
});
