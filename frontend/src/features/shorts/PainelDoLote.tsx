// D-564: as raias do lote — onde cada envio está, uma coluna por plataforma.
//
// D-897: saiu do modal para servir também à gaveta da fila. O lote corre no
// backend; quem acompanha não precisa estar na tela que o disparou, e `empilhado`
// existe porque a gaveta tem a largura de uma raia só: lado a lado, as três
// virariam colunas de vinte pixels.
import { cn } from '@/lib/utils';
import { Icon } from '@/upgrade/Icon';
import type { EstadoItemLote, ItemDoLote, RaiaDoLote } from './shortsApi';
import { marcacaoAMao, podeMarcarAMao } from './selecaoDoLote';
import { useConfirmarPublicacao } from './useLotePublicacao';

interface Props {
  raias: RaiaDoLote[];
  corteId?: string;
  /** Uma raia embaixo da outra, para caber na gaveta da fila. */
  empilhado?: boolean;
}

export function PainelDoLote({ raias, corteId, empilhado = false }: Props) {
  return (
    <div className={cn('grid gap-2', !empilhado && 'md:grid-cols-3')}>
      {raias.map((raia) => (
        <article
          key={raia.plataforma}
          className="rounded-[9px] border border-[var(--wb-border)] p-2.5"
        >
          <h4 className="flex items-center gap-1.5 text-[12.5px] font-bold">
            {raia.rotulo}
            {raia.exige_humano && (
              <Icon name="hand" rotulo="depende de você" className="text-[var(--wb-text-mute)]" />
            )}
          </h4>
          {raia.aviso && (
            <p className="mt-1 flex items-start gap-1 text-[11px] text-[var(--wb-warn-ink,var(--wb-text-dim))]">
              <Icon name="triangle-alert" className="mt-0.5 flex-none" />
              {raia.aviso}
            </p>
          )}
          <ul className="mt-1.5 space-y-1">
            {raia.itens.map((item) => (
              <ItemDaRaia key={`${item.alvo_id}-${item.plataforma}`} item={item} corteId={corteId} />
            ))}
          </ul>
        </article>
      ))}
    </div>
  );
}

function ItemDaRaia({ item, corteId }: { item: ItemDoLote; corteId?: string }) {
  const confirmar = useConfirmarPublicacao(corteId);

  return (
    <li className="rounded-[6px] bg-[var(--wb-bg-inset)] px-2 py-1.5">
      <div className="flex items-center gap-1.5">
        <Icone estado={item.estado} />
        <span className="min-w-0 flex-1 truncate text-[11.5px]" title={item.rotulo}>
          {item.rotulo}
        </span>
        {/* D-603: tambem no item que falhou. O caso comum e o robo quebrar no
            meio e ele terminar no app da rede — e sem este botao o short ficava
            para sempre como "nao publicado", pedindo para subir de novo. */}
        {podeMarcarAMao(item.estado) && (
          <button
            type="button"
            className="flex-none text-[11px] font-semibold text-[var(--wb-accent)]"
            disabled={confirmar.isPending}
            title={marcacaoAMao(item.estado).titulo}
            onClick={() => confirmar.mutate({ alvoId: item.alvo_id, plataforma: item.plataforma })}
          >
            {marcacaoAMao(item.estado).rotulo}
          </button>
        )}
        {item.url && (
          <a
            href={item.url}
            target="_blank"
            rel="noreferrer"
            className="flex-none text-[11px] text-[var(--wb-accent)]"
          >
            ver
          </a>
        )}
      </div>
      {item.detalhe && (
        <p className="mt-0.5 truncate text-[11px] text-[var(--wb-text-mute)]" title={item.detalhe}>
          {item.detalhe}
        </p>
      )}
    </li>
  );
}

function Icone({ estado }: { estado: EstadoItemLote }) {
  if (estado === 'preparando') {
    return <Icon name="loader-2" className="flex-none animate-spin text-[var(--wb-accent)]" />;
  }
  if (estado === 'publicado') {
    return <Icon name="check" className="flex-none text-[var(--wb-ok-ink,var(--wb-accent))]" />;
  }
  if (estado === 'sua_vez') {
    return <Icon name="hand" className="flex-none text-[var(--wb-accent)]" />;
  }
  if (estado === 'conferir') {
    return <Icon name="eye" className="flex-none text-[var(--wb-warn-ink,var(--wb-accent))]" />;
  }
  if (estado === 'erro') {
    return <Icon name="triangle-alert" className="flex-none text-[var(--wb-text-dim)]" />;
  }
  if (estado === 'aguardando') {
    return <Icon name="clock" className="flex-none text-[var(--wb-text-mute)]" />;
  }
  return <Icon name="circle-dashed" className="flex-none text-[var(--wb-text-mute)]" />;
}
