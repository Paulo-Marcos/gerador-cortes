import type { ReactNode, RefObject } from 'react';
import { Link } from 'react-router-dom';
import { juntarNoMais, pecasNoAperto, useApertoDaBarra } from './apertoDaBarra';
import { Icon } from './Icon';
import { BUSCA_LARGA_MIN_PX, useJanelaMin } from './medidas';
import { PontaDaBarra } from './PontaDaBarra';
import { AcoesDaTela, type ScreenAction } from './ScreenHeader';
import { SeletorDoCorte } from './SeletorDoCorte';
import type { ChromeAtual, ChromeEstado, ChromeLista } from './UpgradeChrome';
import type { Migalha } from './upgradeRoutes';

// ─────────────────────────────────────────────────────────────────
// D-1137 (E-069 H-13) · A linha do topo, dentro de uma live (DIRECAO §7.0).
//
// No lugar da barra superior: "voltar" (fantasma), a trilha da live em cápsula,
// o seletor do corte e a busca em ícone. A linha em si não é vidro: as peças é
// que são. Vidro dentro de vidro não desfoca (o Chrome não compõe um
// `backdrop-filter` aninhado em outro), e a cápsula da trilha já é a superfície.
//
// Onde há linha do topo não há cabeçalho de tela: o subtítulo e as ações sobem
// para cá, e o título vira o `h1` da tela (só para o leitor de tela: a trilha e o
// seletor já dizem onde se está). Quando a linha aperta, cede em degraus (`apertoDaBarra`, D-877): o
// subtítulo, depois o texto do estado, depois as ações vão para um "Mais". A
// busca nunca sai. A linha corta só de lado (`overflow-x: clip`), para o painel
// do seletor e o "Mais" descerem inteiros (D-876).
// ─────────────────────────────────────────────────────────────────

/** Para onde o "voltar" leva: a migalha de cima, a que tem destino. */
export function destinoDoVoltar(trilha: Migalha[]): Migalha | undefined {
  return trilha
    .slice(0, -1)
    .reverse()
    .find((m) => m.to);
}

export type LinhaDoTopoProps = {
  trilha: Migalha[];
  /** O título da tela: vira o `h1` (a linha do topo substitui o cabeçalho). */
  titulo?: string;
  /** A trilha da live (`TrilhaDeEtapas`), já montada pela casca. */
  etapas?: ReactNode;
  atual?: ChromeAtual;
  /** `true` quando a coluna de contexto está na tela: o seletor vira só navegação. */
  seletorCompacto?: boolean;
  /** A lista quando ela NÃO está na coluna: vai para o painel do seletor. */
  listaNoPainel?: ChromeLista;
  estado?: ChromeEstado;
  /** O cabeçalho de tela fundido: subtítulo e ações. */
  cabecalho?: { sub?: string; acoes?: ScreenAction[] };
  onAbrirBusca?: () => void;
};

export function LinhaDoTopo({ trilha, titulo, etapas, atual, seletorCompacto = false, listaNoPainel, estado, cabecalho, onAbrirBusca }: LinhaDoTopoProps) {
  const folga = useJanelaMin(BUSCA_LARGA_MIN_PX);
  const acoes = cabecalho?.acoes ?? [];
  const chave = [...trilha.map((m) => m.texto), ...acoes.map((a) => a.texto), cabecalho?.sub, atual?.titulo, estado?.texto].join('|');
  const aperto = useApertoDaBarra(chave);
  const pecas = pecasNoAperto(aperto.nivel);
  const voltar = destinoDoVoltar(trilha);

  return (
    <header
      ref={aperto.barra}
      className="relative z-30 flex min-h-[54px] flex-none items-center gap-2 overflow-x-clip overflow-y-visible"
    >
      {voltar?.to ? (
        <Link
          to={voltar.to}
          title={`Voltar para ${voltar.texto}`}
          aria-label={`Voltar para ${voltar.texto}`}
          className="inline-grid size-[38px] flex-none place-items-center rounded-pilula text-fg-2 hover:bg-vidro-2 hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foco"
        >
          <Icon name="arrow-left" size={16} />
        </Link>
      ) : null}
      {titulo ? <h1 className="sr-only">{titulo}</h1> : null}

      <div ref={aperto.trilha as RefObject<HTMLDivElement>} className="flex min-w-0 items-center gap-2">
        {etapas}
        {cabecalho?.sub && folga && pecas.subtitulo ? (
          // O subtítulo encolhe muito antes da trilha: ele cede primeiro, ela rola por último.
          // D-1196: sobre a aurora com a capa, só `fg-2` sobre `painel` passa 4,5:1 (§8.1).
          <span data-subtitulo className="min-w-0 shrink-[50] truncate rounded-pilula bg-painel px-2.5 py-1 text-pequeno text-fg-2">{cabecalho.sub}</span>
        ) : null}
      </div>

      {/* min-w-2 = ESPACADOR_MIN_PX (8 px): a folga que a medida do aperto desconta. */}
      <div ref={aperto.espacador} className="min-w-2 flex-1" />

      {atual ? <SeletorDoCorte atual={atual} compacto={seletorCompacto} lista={listaNoPainel} /> : null}
      {acoes.length ? <AcoesDaTela acoes={pecas.acoesNoMais ? juntarNoMais(acoes) : acoes} /> : null}
      <PontaDaBarra estado={estado} comTexto={folga && pecas.canalComTexto} onAbrirBusca={onAbrirBusca} />
    </header>
  );
}
