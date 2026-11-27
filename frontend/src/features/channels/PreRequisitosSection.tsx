// D-627: cartão "Pré-requisitos" na aba Aplicação. Quem instala o app numa
// máquina nova vê aqui, antes da primeira live, o que falta e como resolver.
import { EstadoDeErro } from '@/components/ui/estado-de-erro';
import { mensagemErro } from '@/lib/mensagemErro';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useAmbiente, type Ambiente, type EstadoItem, type ItemAmbiente } from './useAmbiente';
import { Icon, type IconName } from '@/upgrade/Icon';

const ICONE: Record<EstadoItem, IconName> = {
  ok: 'circle-check',
  aviso: 'triangle-alert',
  erro: 'x-circle',
};

const COR: Record<EstadoItem, string> = {
  ok: 'text-ok',
  aviso: 'text-aviso',
  erro: 'text-erro',
};

/** Resumo de uma linha: o que o operador precisa saber sem ler a lista. */
export function resumoDoAmbiente({ pronto, itens }: Ambiente): string {
  const faltando = itens.filter((i) => i.estado !== 'ok');
  if (faltando.length === 0) return 'Tudo instalado.';
  if (!pronto) {
    const erros = faltando.filter((i) => i.estado === 'erro').length;
    return `${erros} obrigatório(s) faltando: o app não funciona sem ele(s).`;
  }
  return `${faltando.length} opcional(is) faltando: o app funciona, com menos recursos.`;
}

function Item({ item }: { item: ItemAmbiente }) {
  return (
    <li className="flex gap-2.5 py-2">
      <Icon name={ICONE[item.estado]} size={16} className={cn('mt-0.5 shrink-0', COR[item.estado])} />
      <div className="grid min-w-0 gap-0.5">
        <p className="text-sm font-medium text-fg">
          {item.nome}
          {!item.obrigatorio && (
            <span className="ml-1.5 text-micro font-normal text-fg-2">
              opcional
            </span>
          )}
        </p>
        <p className="truncate text-xs text-fg-2" title={item.detalhe}>
          {item.detalhe}
        </p>
        {item.como_resolver && (
          <p className={cn('text-xs', COR[item.estado])}>{item.como_resolver}</p>
        )}
      </div>
    </li>
  );
}

export function PreRequisitosLista({ ambiente }: { ambiente: Ambiente }) {
  const faltaAlgo = ambiente.itens.some((i) => i.estado !== 'ok');
  const tom: EstadoItem = !ambiente.pronto ? 'erro' : faltaAlgo ? 'aviso' : 'ok';
  return (
    <>
      <p className={cn('text-sm font-medium', COR[tom])}>{resumoDoAmbiente(ambiente)}</p>
      <ul className="divide-y divide-[var(--cc-fio)]">
        {ambiente.itens.map((item) => (
          <Item key={item.id} item={item} />
        ))}
      </ul>
    </>
  );
}

export function PreRequisitosSection() {
  const { data, isLoading, isFetching, isError, error, refetch } = useAmbiente();
  return (
    <section className="grid gap-3 rounded-campo border border-fio bg-painel-solido p-5">
      <header className="flex items-center gap-3">
        <div className="grid flex-1 gap-1">
          <h2 className="text-lg font-semibold text-fg">Pré-requisitos</h2>
          <p className="text-sm text-fg-2">
            O que o app precisa nesta máquina. Instalou algo? Reabra o app e cheque de novo.
          </p>
        </div>
        <Button
          type="button"
          size="pq"
          variant="secundario"
          onClick={() => refetch()}
          disabled={isFetching}
        >
          {isFetching ? <Icon name="loader-2" className="animate-spin" /> : <Icon name="refresh-cw" />}
          Checar de novo
        </Button>
      </header>
      {isLoading && <p className="text-sm text-fg-2">Checando a máquina…</p>}
      {isError && (
        <EstadoDeErro
          className="p-5"
          titulo="Não consegui checar os pré-requisitos"
          motivo={mensagemErro(error, 'O backend respondeu com erro. Tente de novo.')}
          aoTentar={() => void refetch()}
        />
      )}
      {data && <PreRequisitosLista ambiente={data} />}
    </section>
  );
}
