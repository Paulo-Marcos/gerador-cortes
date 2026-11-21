// D-1006: seção "Motivos de excluir um corte" na tela de Canais. Até a D-1005 a
// lista era fixa no código; agora é do canal (ADR-0012). Acrescentar põe um
// chip novo no diálogo dali para frente; esconder o tira dos chips sem apagar o
// histórico — os cortes que já saíram por ele continuam contados nas análises.
import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { mensagemErro } from '@/lib/mensagemErro';
import { cn } from '@/lib/utils';
import type { MotivoDeExclusao } from '@/features/channels/api/motivosDeExclusao';
import { useEditarMotivosDeExclusao, useMotivosDeExclusao } from './useMotivosDeExclusao';

export function MotivosDeExclusaoSection() {
  const query = useMotivosDeExclusao();
  const { acrescentar, mostrar } = useEditarMotivosDeExclusao();
  const [nome, setNome] = useState('');

  function aoAcrescentar(evento: FormEvent) {
    evento.preventDefault();
    if (!nome.trim()) return;
    acrescentar.mutate(nome, { onSuccess: () => setNome('') });
  }

  const falha = query.error ?? acrescentar.error ?? mostrar.error;

  return (
    <section className="grid gap-3 rounded-[var(--radius)] border border-fio bg-painel-solido p-5">
      <h2 className="text-lg font-semibold text-fg">Motivos de excluir um corte</h2>
      <p className="text-sm text-fg-2">
        Os chips que aparecem ao excluir um corte proposto pela IA. Esconder tira o chip do diálogo; os
        cortes que já saíram por ele continuam contados nas análises.
      </p>
      {query.data && (
        <ul className="flex flex-wrap gap-1.5" aria-label="Motivos do canal">
          {query.data.motivos.map((motivo) => (
            <ChipDoMotivo
              key={motivo.slug}
              motivo={motivo}
              pending={mostrar.isPending}
              onAlternar={() => mostrar.mutate({ slug: motivo.slug, ativo: !motivo.ativo })}
            />
          ))}
        </ul>
      )}
      <form onSubmit={aoAcrescentar} className="flex flex-wrap items-center gap-2">
        <Input
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          placeholder="Motivo novo (ex.: Opinião polêmica)"
          maxLength={40}
          aria-label="Nome do motivo novo"
          className="max-w-xs"
        />
        <Button type="submit" size="sm" disabled={!nome.trim() || acrescentar.isPending}>
          Acrescentar
        </Button>
      </form>
      {falha && (
        <p role="alert" className="text-xs text-erro">
          {mensagemErro(falha, 'Não foi possível mudar os motivos.')}
        </p>
      )}
    </section>
  );
}

function ChipDoMotivo({
  motivo,
  pending,
  onAlternar,
}: {
  motivo: MotivoDeExclusao;
  pending: boolean;
  onAlternar: () => void;
}) {
  return (
    <li
      className={cn(
        'inline-flex items-center gap-1.5 rounded-[7px] border px-2 py-[3px] text-pequeno',
        motivo.ativo
          ? 'border-fio-2 bg-poco text-fg'
          : 'border-dashed border-fio-2 text-fg-2',
      )}
    >
      <span className={motivo.ativo ? '' : 'line-through'}>{motivo.rotulo}</span>
      <button
        type="button"
        disabled={pending}
        onClick={onAlternar}
        className="text-micro font-bold text-fg-2 hover:text-fg"
        aria-label={`${motivo.ativo ? 'Esconder' : 'Mostrar'} o motivo ${motivo.rotulo}`}
      >
        {motivo.ativo ? 'Esconder' : 'Mostrar'}
      </button>
    </li>
  );
}
