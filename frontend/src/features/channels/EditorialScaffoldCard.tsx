// D-297: card "burro" de um scaffold na lista de gestão. Mostra a etapa, a
// explicação, o marcador do contrato e se o canal customizou (vs. o padrão), com
// o botão de editar. Sem I/O — o container decide o que fazer no clique.
import { Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { EditorialScaffold } from '@/features/channels/api/scaffolds';

interface Props {
  scaffold: EditorialScaffold;
  customizado: boolean;
  onEditar: () => void;
}

export function EditorialScaffoldCard({ scaffold, customizado, onEditar }: Props) {
  return (
    <li className="grid gap-2 rounded-[var(--radius)] border border-[var(--wb-border-soft)] bg-[var(--wb-bg-card)] p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-medium text-[var(--wb-text)]">{scaffold.etapa}</h3>
            <span
              className={
                customizado
                  ? 'rounded-full bg-[var(--wb-accent-soft)] px-2 py-0.5 text-[11px] font-medium text-[var(--wb-accent)]'
                  : 'rounded-full border border-[var(--wb-border-soft)] px-2 py-0.5 text-[11px] text-[var(--wb-text-mute)]'
              }
            >
              {customizado ? 'Customizado' : 'Padrão'}
            </span>
          </div>
          <p className="mt-1 text-sm text-[var(--wb-text-mute)]">{scaffold.descricao}</p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={onEditar} className="shrink-0">
          <Pencil size={14} aria-hidden />
          Editar
        </Button>
      </div>
      <div className="flex flex-wrap gap-1.5 text-[11px] text-[var(--wb-text-dim)]">
        <span className="rounded border border-[var(--wb-border-soft)] px-1.5 py-0.5">
          placeholders: {scaffold.placeholders.length}
        </span>
        {scaffold.marcador && (
          <span className="rounded border border-[var(--wb-border-soft)] px-1.5 py-0.5">
            contrato: {scaffold.marcador}
          </span>
        )}
      </div>
    </li>
  );
}
