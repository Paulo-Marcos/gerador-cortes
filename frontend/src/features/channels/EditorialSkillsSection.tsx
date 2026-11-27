// E-021: seção "Skills do canal" na página de Canais. Container: orquestra o I/O
// (hooks em useEditorialSkills) e delega a renderização aos componentes burros
// (card na lista, form no modal). Lista as 5 skills editoriais do canal ativo,
// mostra se cada uma foi customizada e abre o editor com corpo/params/lentes.
import { EstadoDeErro } from '@/components/ui/estado-de-erro';
import { useState } from 'react';
import { Modal } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toaster';
import type { CampoReset, EditorialSkill, UpdateSkillPayload } from '@/features/channels/api/skillsEditoriais';
import { EditorialSkillCard } from './EditorialSkillCard';
import { EditorialSkillForm } from './EditorialSkillForm';
import { EditorialSkillHistory } from './EditorialSkillHistory';
import {
  useEditarSkill,
  useEditorialSkills,
  useResetarSkill,
  useReverterSkill,
  useVersoesSkill,
} from './useEditorialSkills';
import { mensagemErro } from '@/lib/mensagemErro';
import { Icon } from '@/upgrade/Icon';


/** Igualdade rasa de params (faixa, thinking e timeout). */
function paramsIguais(a: EditorialSkill['params'], b: EditorialSkill['params']): boolean {
  return (
    a.faixa === b.faixa &&
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
    <section className="grid gap-3 rounded-campo border border-fio bg-painel-solido p-5">
      <h2 className="text-lg font-semibold text-fg">Skills do canal</h2>
      <p className="text-sm text-fg-2">
        As cinco skills editoriais que a IA usa em cada etapa. Edite o prompt, os parâmetros e as
        lentes de variação por canal; o padrão genérico fica disponível para resetar.
      </p>

      {skillsQuery.isLoading && (
        <p className="flex items-center gap-2 text-linha text-fg-2">
          <Icon name="loader-2" size={16} className="animate-spin" />
          Carregando skills…
        </p>
      )}

      {skillsQuery.isError && (
        <EstadoDeErro
          className="p-5"
          titulo="Não consegui carregar as skills"
          motivo={mensagemErro(skillsQuery.error, 'O backend não respondeu. Tente de novo.')}
          aoTentar={() => void skillsQuery.refetch()}
        />
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
