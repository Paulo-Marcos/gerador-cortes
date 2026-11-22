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
          className="rounded-[9px] border border-fio-2 p-2.5"
        >
          <h4 className="flex items-center gap-1.5 text-pequeno font-bold">
            {raia.rotulo}
            {raia.exige_humano && (
              <Icon name="hand" rotulo="depende de você" className="text-fg-2" />
            )}
          </h4>
          {raia.aviso && (
            <p className="mt-1 flex items-start gap-1 text-micro text-aviso">
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
    <li className="rounded-[6px] bg-poco px-2 py-1.5">
      <div className="flex items-center gap-1.5">
        <Icone estado={item.estado} />
        <span className="min-w-0 flex-1 truncate text-micro" title={item.rotulo}>
          {item.rotulo}
        </span>
        {/* D-603: tambem no item que falhou. O caso comum e o robo quebrar no
            meio e ele terminar no app da rede — e sem este botao o short ficava
            para sempre como "nao publicado", pedindo para subir de novo. */}
        {podeMarcarAMao(item.estado) && (
          <button
            type="button"
            className="flex-none text-micro font-semibold text-iris"
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
            className="flex-none text-micro text-iris"
          >
            ver
          </a>
        )}
      </div>
      {item.agendado_para && (
        <p className="mt-0.5 flex items-center gap-1 text-micro text-fg-3">
          <Icon name="clock" />
          {item.agendado_para}
        </p>
      )}
      {/* D-1098: quebra a linha, sem cortar. O porquê de o robô não ter publicado
          vem depois do recado, e as reticências do `truncate` comiam justamente ele. */}
      {item.detalhe && (
        <p className="mt-0.5 break-words text-micro text-fg-2">{item.detalhe}</p>
      )}
    </li>
  );
}

function Icone({ estado }: { estado: EstadoItemLote }) {
  if (estado === 'preparando') {
    return <Icon name="loader-2" className="flex-none animate-spin text-iris" />;
  }
  if (estado === 'publicado') {
    return <Icon name="check" className="flex-none text-ok" />;
  }
  if (estado === 'sua_vez') {
    return <Icon name="hand" className="flex-none text-iris" />;
  }
  if (estado === 'conferir') {
    return <Icon name="eye" className="flex-none text-aviso" />;
  }
  if (estado === 'erro') {
    return <Icon name="triangle-alert" className="flex-none text-fg-3" />;
  }
  if (estado === 'aguardando') {
    return <Icon name="clock" className="flex-none text-fg-2" />;
  }
  return <Icon name="circle-dashed" className="flex-none text-fg-2" />;
}
