// E-021: seção "Skills do canal" na página de Canais. Container: orquestra o I/O
// (hooks em useEditorialSkills) e delega a renderização aos componentes burros
// (card na lista, form no modal). Lista as 5 skills editoriais do canal ativo,
// mostra se cada uma foi customizada e abre o editor com corpo/params/lentes.
import { useState } from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toaster';
import type { CampoReset, EditorialSkill, UpdateSkillPayload } from '@/features/channels/api/skillsEditoriais';
import { EditorialSkillCard } from './EditorialSkillCard';
import { EditorialSkillForm } from './EditorialSkillForm';
import { EditorialSkillHistory } from './EditorialSkillHistory';
import {
  useEditarSkill,
  useEditorialSkills,
  useModelosGemini,
  useResetarSkill,
  useReverterSkill,
  useVersoesSkill,
} from './useEditorialSkills';

function mensagemErro(erro: unknown, fallback: string): string {
  return erro instanceof Error ? erro.message : fallback;
}

/** Igualdade rasa de params (modelos dos dois providers, thinking e timeout). */
function paramsIguais(a: EditorialSkill['params'], b: EditorialSkill['params']): boolean {
  return (
    a.modelo === b.modelo &&
    a.modelo_gemini === b.modelo_gemini &&
    a.thinking_tokens === b.thinking_tokens &&
    a.timeout === b.timeout
  );
}

/** True quando o canal difere do default em corpo, params ou lentes. */
export function skillCustomizada(skill: EditorialSkill): boolean {
  return (
    skill.corpo.trim() !== skill.corpo_default.trim() ||
    !paramsIguais(skill.params, skill.params_default) ||
    skill.lentes.join('\n') !== skill.lentes_default.join('\n')
  );
}

export function EditorialSkillsSection() {
  const { notify } = useToast();
  const skillsQuery = useEditorialSkills();
  const editar = useEditarSkill();
  const resetar = useResetarSkill();
  const reverter = useReverterSkill();

  const [editandoKey, setEditandoKey] = useState<string | null>(null);
  const versoesQuery = useVersoesSkill(editandoKey);
  const modelosGeminiQuery = useModelosGemini(editandoKey !== null);
  const pending = editar.isPending || resetar.isPending || reverter.isPending;

  const skills = skillsQuery.data?.skills ?? [];
  const skillEditando = skills.find((s) => s.key === editandoKey) ?? null;

  const aoSalvar = (payload: UpdateSkillPayload) => {
    if (!editandoKey) return;
    editar.mutate(
      { key: editandoKey, payload },
      {
        onSuccess: () => {
          notify('Skill atualizada.', { tone: 'success' });
          setEditandoKey(null);
        },
        onError: (erro) => notify(mensagemErro(erro, 'Erro ao salvar a skill.'), { tone: 'error' }),
      },
    );
  };

  const aoResetar = (campos: CampoReset[]) => {
    if (!editandoKey) return;
    resetar.mutate(
      { key: editandoKey, campos },
      {
        onSuccess: () => notify('Campo restaurado ao padrão.', { tone: 'info' }),
        onError: (erro) => notify(mensagemErro(erro, 'Erro ao resetar.'), { tone: 'error' }),
      },
    );
  };

  const aoReverter = (versao: number) => {
    if (!editandoKey) return;
    reverter.mutate(
      { key: editandoKey, versao },
      {
        onSuccess: () => notify(`Skill revertida à versão ${versao}.`, { tone: 'success' }),
        onError: (erro) => notify(mensagemErro(erro, 'Erro ao reverter.'), { tone: 'error' }),
      },
    );
  };

  return (
    <section className="grid gap-3 rounded-[var(--radius)] border border-[var(--wb-border-soft)] bg-[var(--wb-bg-card)] p-5">
      <h2 className="text-lg font-semibold text-[var(--wb-text)]">Skills do canal</h2>
      <p className="text-sm text-[var(--wb-text-mute)]">
        As cinco skills editoriais que a IA usa em cada etapa. Edite o prompt, os parâmetros e as
        lentes de variação por canal; o padrão genérico fica disponível para resetar.
      </p>

      {skillsQuery.isLoading && (
        <p className="flex items-center gap-2 text-[15px] text-[var(--wb-text-mute)]">
          <Loader2 className="animate-spin" size={16} aria-hidden />
          Carregando skills…
        </p>
      )}

      {skillsQuery.isError && (
        <div className="grid gap-3 rounded-[var(--radius)] border border-error/30 bg-[color-mix(in_oklch,var(--error)_10%,var(--wb-bg-card))] p-4">
          <p className="flex items-center gap-2 text-[15px] text-[var(--wb-text)]">
            <AlertTriangle size={16} aria-hidden className="text-error" />
            {mensagemErro(skillsQuery.error, 'Não foi possível carregar as skills.')}
          </p>
          <div>
            <Button type="button" variant="outline" size="sm" onClick={() => skillsQuery.refetch()}>
              Tentar de novo
            </Button>
          </div>
        </div>
      )}

      {skills.length > 0 && (
        <ul className="grid gap-2">
          {skills.map((skill) => (
            <EditorialSkillCard
              key={skill.key}
              skill={skill}
              customizada={skillCustomizada(skill)}
              onEditar={() => setEditandoKey(skill.key)}
            />
          ))}
        </ul>
      )}

      <Modal
        open={skillEditando !== null}
        onClose={() => setEditandoKey(null)}
        size="xl"
        title={skillEditando ? skillEditando.etapa : ''}
        description={skillEditando?.descricao}
      >
        {skillEditando && (
          <div className="grid gap-5">
            <EditorialSkillForm
              skill={skillEditando}
              modelosGemini={modelosGeminiQuery.data?.modelos ?? []}
              pending={pending}
              onSave={aoSalvar}
              onReset={aoResetar}
              onCancel={() => setEditandoKey(null)}
            />
            <EditorialSkillHistory
              versoes={versoesQuery.data?.versoes ?? []}
              carregando={versoesQuery.isLoading}
              erro={
                versoesQuery.isError
                  ? mensagemErro(versoesQuery.error, 'Não foi possível carregar o histórico.')
                  : null
              }
              pending={pending}
              onReverter={aoReverter}
            />
          </div>
        )}
      </Modal>
    </section>
  );
}
