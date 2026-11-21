// D-297: card "burro" de um scaffold na lista de gestão. Mostra a etapa, a
// explicação, o marcador do contrato e se o canal customizou (vs. o padrão), com
// o botão de editar. Sem I/O — o container decide o que fazer no clique.
import { Button } from '@/components/ui/button';
import type { EditorialScaffold } from '@/features/channels/api/scaffolds';
import { Icon, ICONE_DO_CONCEITO } from '@/upgrade/Icon';

interface Props {
  scaffold: EditorialScaffold;
  customizado: boolean;
  onEditar: () => void;
}

export function EditorialScaffoldCard({ scaffold, customizado, onEditar }: Props) {
  return (
    <li className="grid gap-2 rounded-campo border border-fio bg-painel-solido p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-medium text-fg">{scaffold.etapa}</h3>
            <span
              className={
                customizado
                  ? 'rounded-full bg-iris-suave px-2 py-0.5 text-micro font-medium text-iris'
                  : 'rounded-full border border-fio px-2 py-0.5 text-micro text-fg-2'
              }
            >
              {customizado ? 'Customizado' : 'Padrão'}
            </span>
          </div>
          <p className="mt-1 text-sm text-fg-2">{scaffold.descricao}</p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={onEditar} className="shrink-0">
          <Icon name={ICONE_DO_CONCEITO.editar} />
          Editar
        </Button>
      </div>
      <div className="flex flex-wrap gap-1.5 text-micro text-fg-3">
        <span className="rounded border border-fio px-1.5 py-0.5">
          placeholders: {scaffold.placeholders.length}
        </span>
        {scaffold.marcador && (
          <span className="rounded border border-fio px-1.5 py-0.5">
            contrato: {scaffold.marcador}
          </span>
        )}
      </div>
    </li>
  );
}
