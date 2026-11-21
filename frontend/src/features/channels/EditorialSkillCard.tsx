// E-021: card "burro" de uma skill editorial na lista de gestão. Mostra a etapa,
// a explicação funcional, a faixa de modelo e se o canal customizou (vs. o padrão),
// com o botão de editar. Sem I/O — o container decide o que fazer no clique.
import { Button } from '@/components/ui/button';
import { FAIXAS, type EditorialSkill } from '@/features/channels/api/skillsEditoriais';
import { Icon, ICONE_DO_CONCEITO } from '@/upgrade/Icon';

interface Props {
  skill: EditorialSkill;
  customizada: boolean;
  onEditar: () => void;
}

export function EditorialSkillCard({ skill, customizada, onEditar }: Props) {
  return (
    <li className="grid gap-2 rounded-campo border border-fio bg-painel-solido p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-medium text-fg">{skill.etapa}</h3>
            <span
              className={
                customizada
                  ? 'rounded-full bg-iris-suave px-2 py-0.5 text-micro font-medium text-iris'
                  : 'rounded-full border border-fio px-2 py-0.5 text-micro text-fg-2'
              }
            >
              {customizada ? 'Customizado' : 'Padrão'}
            </span>
          </div>
          <p className="mt-1 text-sm text-fg-2">{skill.descricao}</p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={onEditar} className="shrink-0">
          <Icon name={ICONE_DO_CONCEITO.editar} />
          Editar
        </Button>
      </div>
      <div className="flex flex-wrap gap-1.5 text-micro text-fg-3">
        <span className="rounded border border-fio px-1.5 py-0.5">
          modelo: {FAIXAS.find((f) => f.faixa === skill.params.faixa)?.rotulo}
        </span>
        <span className="rounded border border-fio px-1.5 py-0.5">
          thinking: {skill.params.thinking_tokens}
        </span>
        <span className="rounded border border-fio px-1.5 py-0.5">
          timeout: {skill.params.timeout}s
        </span>
        <span className="rounded border border-fio px-1.5 py-0.5">
          lentes: {skill.lentes.length}
        </span>
      </div>
    </li>
  );
}
