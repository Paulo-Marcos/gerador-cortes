// E-021: card "burro" de uma skill editorial na lista de gestão. Mostra a etapa,
// a explicação funcional, o modelo em uso e se o canal customizou (vs. o padrão),
// com o botão de editar. Sem I/O — o container decide o que fazer no clique.
import { Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { EditorialSkill } from '@/lib/editorialSkillsApi';

interface Props {
  skill: EditorialSkill;
  customizada: boolean;
  onEditar: () => void;
}

export function EditorialSkillCard({ skill, customizada, onEditar }: Props) {
  return (
    <li className="grid gap-2 rounded-[var(--radius)] border border-[var(--wb-border-soft)] bg-[var(--wb-bg-card)] p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-medium text-[var(--wb-text)]">{skill.etapa}</h3>
            <span
              className={
                customizada
                  ? 'rounded-full bg-[var(--wb-accent-soft)] px-2 py-0.5 text-[11px] font-medium text-[var(--wb-accent)]'
                  : 'rounded-full border border-[var(--wb-border-soft)] px-2 py-0.5 text-[11px] text-[var(--wb-text-mute)]'
              }
            >
              {customizada ? 'Customizado' : 'Padrão'}
            </span>
          </div>
          <p className="mt-1 text-sm text-[var(--wb-text-mute)]">{skill.descricao}</p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={onEditar} className="shrink-0">
          <Pencil size={14} aria-hidden />
          Editar
        </Button>
      </div>
      <div className="flex flex-wrap gap-1.5 text-[11px] text-[var(--wb-text-dim)]">
        <span className="rounded border border-[var(--wb-border-soft)] px-1.5 py-0.5">
          claude: {skill.params.modelo}
        </span>
        <span className="rounded border border-[var(--wb-border-soft)] px-1.5 py-0.5">
          gemini: {skill.params.modelo_gemini}
        </span>
        <span className="rounded border border-[var(--wb-border-soft)] px-1.5 py-0.5">
          thinking: {skill.params.thinking_tokens}
        </span>
        <span className="rounded border border-[var(--wb-border-soft)] px-1.5 py-0.5">
          timeout: {skill.params.timeout}s
        </span>
        <span className="rounded border border-[var(--wb-border-soft)] px-1.5 py-0.5">
          lentes: {skill.lentes.length}
        </span>
      </div>
    </li>
  );
}
