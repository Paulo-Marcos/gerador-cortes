import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { IconButton } from '@/components/ui/icon-button';
import { Icon } from '@/components/ui/icon';
import { MapaDaLive } from '@/components/ui/mapa-da-live';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import type { Corte } from '@/types/models';
import { consumirPedidoDeFoco, pedirFocoNoTitulo } from './focoNoCorte';
import { cortesDoMapa, sobretituloDoCorte } from './mapaDoEditor';
import { acharCorteVizinho, separarRiscados } from './riscarCorte';
import { RiscadosDaLista } from './RiscadosDaLista';

// D-1150 (E-069 H-17) · o cabeçalho do editor (DIRECAO §7.3).
//
// À esquerda, onde estou: "Corte 2 de 6 · Live" e o título do corte. À direita, o
// mapa da live compacto entre o anterior e o próximo: é por ele que se troca de
// corte, e a lista lateral "Cortes da live" saiu. As setas são as mesmas do J/K
// (pulam os riscados, D-1092). Os riscados não somem: aparecem tracejados no mapa e
// o "Trazer de volta" mora no "Riscados · N" ao lado das setas.
//
// No mapa compacto ficam só a pista e as pílulas: os tempos e o resumo do corte
// aberto repetiriam o título, que já está à esquerda.
// Sem `backdrop-filter` (§3.6): esta tela toca vídeo.

export type CabecalhoDoCorteProps = {
  projetoId: string;
  tituloLive: string;
  /** Duração da live; sem ela o mapa enfileira os cortes, sem inventar posição. */
  duracaoLiveSeg: number;
  cortes: Corte[];
  corte: Corte;
  caminhoDoCorte: (corte: Corte) => string;
  /** Riscar e trazer de volta são curadoria da etapa Cortes (D-1092). */
  comRiscados?: boolean;
};

const SO_A_PISTA = '[&_[data-parte=aberto]]:hidden [&_[data-parte=tempos]]:hidden';

/** D-1201 (§8.2, Foco): quem riscou ou trocou de corte segue no título do corte novo,
 *  não no <body>. É o título visível, para o anel aparecer: o `h1` da linha do topo é
 *  só do leitor de tela. E não é a pílula do mapa, onde ← e → andariam no mapa e no
 *  vídeo ao mesmo tempo. */
function TituloDoCorte({ corteId, titulo }: { corteId: string; titulo: string }) {
  const alvo = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (consumirPedidoDeFoco(corteId)) alvo.current?.focus();
  }, [corteId]);
  return (
    <h2 ref={alvo} className="mt-0.5 truncate text-titulo text-fg" tabIndex={-1} title={titulo}>
      {titulo}
    </h2>
  );
}

export function CabecalhoDoCorte({
  projetoId,
  tituloLive,
  duracaoLiveSeg,
  cortes,
  corte,
  caminhoDoCorte,
  comRiscados = false,
}: CabecalhoDoCorteProps) {
  const navigate = useNavigate();
  const anterior = acharCorteVizinho(cortes, corte.id, -1);
  const proximo = acharCorteVizinho(cortes, corte.id, 1);
  const { riscados } = separarRiscados(cortes);
  const irPara = (alvo: Corte) => {
    pedirFocoNoTitulo(alvo.id);
    navigate(caminhoDoCorte(alvo));
  };
  const abrir = (id: string) => {
    const alvo = cortes.find((c) => c.id === id);
    if (alvo && alvo.id !== corte.id) irPara(alvo);
  };

  return (
    <header data-parte="cabecalho-do-corte" className="flex flex-none items-center gap-6 pb-3 pt-1">
      <div className="min-w-0 flex-1">
        <p className="truncate text-pequeno text-iris">{sobretituloDoCorte(cortes, corte, tituloLive)}</p>
        <TituloDoCorte corteId={corte.id} titulo={corte.titulo_proposto} />
      </div>
      <div className="flex w-[min(46%,560px)] flex-none items-center gap-2">
        <IconButton
          variant="fantasma"
          size="pq"
          aria-label="Corte anterior"
          aria-keyshortcuts="J"
          title="Corte anterior · J"
          disabled={!anterior}
          onClick={() => anterior && irPara(anterior)}
        >
          <Icon name="chevron-left" />
        </IconButton>
        <MapaDaLive
          tamanho="mini"
          duracaoSeg={duracaoLiveSeg}
          cortes={cortesDoMapa(cortes, caminhoDoCorte)}
          abertoId={corte.id}
          onAbrir={abrir}
          className={`min-w-0 flex-1 ${SO_A_PISTA}`}
        />
        <IconButton
          variant="fantasma"
          size="pq"
          aria-label="Próximo corte"
          aria-keyshortcuts="K"
          title="Próximo corte · K"
          disabled={!proximo}
          onClick={() => proximo && irPara(proximo)}
        >
          <Icon name="chevron-right" />
        </IconButton>
        {comRiscados && riscados.length > 0 ? (
          <Popover>
            <PopoverTrigger
              data-sala=""
              className="inline-flex h-botao-pq flex-none items-center gap-1.5 rounded-pilula px-3 text-pequeno text-fg-2 hover:bg-vidro-2 hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foco"
            >
              <Icon name="ban" />
              Riscados · {riscados.length}
            </PopoverTrigger>
            <PopoverContent align="end" className="w-80">
              <RiscadosDaLista projetoId={projetoId} riscados={riscados} />
            </PopoverContent>
          </Popover>
        ) : null}
      </div>
    </header>
  );
}
