// D-627: cartão "Pré-requisitos" na aba Aplicação. Quem instala o app numa
// máquina nova vê aqui, antes da primeira live, o que falta e como resolver.
import { AlertTriangle, CheckCircle2, Loader2, RefreshCw, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useAmbiente, type Ambiente, type EstadoItem, type ItemAmbiente } from './useAmbiente';

const ICONE: Record<EstadoItem, typeof CheckCircle2> = {
  ok: CheckCircle2,
  aviso: AlertTriangle,
  erro: XCircle,
};

const COR: Record<EstadoItem, string> = {
  ok: 'text-[var(--wb-ok-ink)]',
  aviso: 'text-[var(--wb-warn-ink)]',
  erro: 'text-[var(--wb-err-ink)]',
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
  const Icone = ICONE[item.estado];
  return (
    <li className="flex gap-2.5 py-2">
      <Icone size={16} aria-hidden className={cn('mt-0.5 shrink-0', COR[item.estado])} />
      <div className="grid min-w-0 gap-0.5">
        <p className="text-sm font-medium text-[var(--wb-text)]">
          {item.nome}
          {!item.obrigatorio && (
            <span className="ml-1.5 text-[11px] font-normal text-[var(--wb-text-mute)]">
              opcional
            </span>
          )}
        </p>
        <p className="truncate text-xs text-[var(--wb-text-mute)]" title={item.detalhe}>
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
      <ul className="divide-y divide-[var(--wb-border-soft)]">
        {ambiente.itens.map((item) => (
          <Item key={item.id} item={item} />
        ))}
      </ul>
    </>
  );
}

export function PreRequisitosSection() {
  const { data, isLoading, isFetching, isError, refetch } = useAmbiente();
  return (
    <section className="grid gap-3 rounded-[var(--radius)] border border-[var(--wb-border-soft)] bg-[var(--wb-bg-card)] p-5">
      <header className="flex items-center gap-3">
        <div className="grid flex-1 gap-1">
          <h2 className="text-lg font-semibold text-[var(--wb-text)]">Pré-requisitos</h2>
          <p className="text-sm text-[var(--wb-text-mute)]">
            O que o app precisa nesta máquina. Instalou algo? Reabra o app e cheque de novo.
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => refetch()}
          disabled={isFetching}
        >
          {isFetching ? <Loader2 className="animate-spin" aria-hidden /> : <RefreshCw aria-hidden />}
          Checar de novo
        </Button>
      </header>
      {isLoading && <p className="text-sm text-[var(--wb-text-mute)]">Checando a máquina…</p>}
      {isError && (
        <p className="text-sm text-[var(--wb-err-ink)]">
          Não foi possível checar: o backend respondeu com erro.
        </p>
      )}
      {data && <PreRequisitosLista ambiente={data} />}
    </section>
  );
}
