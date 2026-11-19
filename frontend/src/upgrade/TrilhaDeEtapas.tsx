import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { Icon } from './Icon';
import type { EtapaDaTrilha } from './trilhaDaLive';

// ─────────────────────────────────────────────────────────────────
// D-866 · A trilha da live, desenhada.
//
// Só nas telas de dentro de uma live (ou do Fire), sempre no mesmo lugar.
// Cada etapa leva o marcador (✓ ou o número), o nome e a contagem.
//
// D-1137 (E-069 H-13; DIRECAO §3.3 e §7.0): a trilha virou uma cápsula de vidro
// na linha do topo. Aceso × apagado: a etapa que falta tem só o contorno, a
// feita tem a bolinha `vidro-3` com o visto, e a atual é o "onde estou" — a
// bolinha no feixe, um dos lugares marcados do feixe (§3.1).
// ─────────────────────────────────────────────────────────────────

const ETAPA = {
  agora: 'border-fio-2 bg-vidro-3 text-fg shadow-topo',
  feita: 'border-transparent text-fg-2 hover:bg-vidro hover:text-fg',
  todo: 'border-transparent text-fg-3 hover:bg-vidro hover:text-fg',
};

const BOLA = {
  agora: 'bg-feixe text-sobre-feixe',
  feita: 'bg-vidro-3 text-fg',
  todo: 'border-[1.5px] border-current',
};

function Marcador({ etapa, ordem }: { etapa: EtapaDaTrilha; ordem: number }) {
  const tom = etapa.agora ? 'agora' : etapa.feita ? 'feita' : 'todo';
  return (
    <span aria-hidden className={cn('inline-grid size-[18px] flex-none place-items-center rounded-full text-micro font-bold', BOLA[tom])}>
      {etapa.feita ? <Icon name="check" /> : ordem}
    </span>
  );
}

export function TrilhaDeEtapas({ etapas }: { etapas: EtapaDaTrilha[] }) {
  if (etapas.length === 0) return null;

  return (
    <nav
      aria-label={etapas[0].id === 'curar' ? 'Etapas do Fire' : 'Etapas da live'}
      className="cc-vidro-casca flex min-w-0 items-center gap-0.5 overflow-x-auto rounded-pilula p-1"
    >
      {etapas.map((e, i) => (
        <Link
          key={e.id}
          to={e.to}
          aria-current={e.agora ? 'step' : undefined}
          // O ✓ é desenho (aria-hidden): o leitor de tela ouve a palavra.
          aria-label={`${e.texto}: ${e.contagem}${e.feita ? ', concluída' : ''}`}
          title={e.doCorte ? `${e.texto} · este corte: ${e.doCorte} · na live: ${e.contagem}` : `${e.texto} · ${e.contagem}`}
          aria-description={e.doCorte ? `Este corte: ${e.doCorte}` : undefined}
          className={cn(
            'flex h-9 flex-none items-center gap-2 whitespace-nowrap rounded-pilula border pl-2.5 pr-3.5 text-pequeno font-semibold',
            'transition-colors duration-150 motion-reduce:transition-none',
            'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foco',
            ETAPA[e.agora ? 'agora' : e.feita ? 'feita' : 'todo'],
          )}
        >
          <Marcador etapa={e} ordem={i + 1} />
          {e.texto}
          {/* Abaixo de 1600 px a contagem fica só na etapa atual; nas outras ela segue
              no rótulo acessível e no title, e a trilha cabe ao lado do seletor. */}
          <small className={cn('font-mono text-micro font-medium text-fg-3', !e.agora && 'max-[1599px]:sr-only')}>{e.doCorte ?? e.contagem}</small>
        </Link>
      ))}
    </nav>
  );
}
