// D-348: seção "Prompts utilitários" na página de Canais. Container: orquestra o
// I/O (hooks em usePromptsUtilitarios) e delega a renderização aos componentes
// burros. Lista os prompts de IA auxiliares (fora do pipeline de corte) do canal
// ativo, mostra se cada um foi customizado e abre o editor com o guardrail do contrato.
import { EstadoDeErro } from '@/components/ui/estado-de-erro';
import { useState } from 'react';
import { Modal } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toaster';
import type { PromptUtilitario } from '@/features/channels/api/promptsUtilitarios';
import { PromptUtilitarioCard } from './PromptUtilitarioCard';
import { PromptUtilitarioForm } from './PromptUtilitarioForm';
import {
  useEditarPromptUtilitario,
  usePromptsUtilitarios,
  useResetarPromptUtilitario,
} from './usePromptsUtilitarios';
import { mensagemErro } from '@/lib/mensagemErro';
import { Icon } from '@/upgrade/Icon';


/** True quando o canal difere do default (comparação sem espaços nas bordas). */
export function promptCustomizado(prompt: PromptUtilitario): boolean {
  return prompt.prompt.trim() !== prompt.prompt_default.trim();
}

export function PromptsUtilitariosSection() {
  const { notify } = useToast();
  const promptsQuery = usePromptsUtilitarios();
  const editar = useEditarPromptUtilitario();
  const resetar = useResetarPromptUtilitario();

  const [editandoKey, setEditandoKey] = useState<string | null>(null);
  const pending = editar.isPending || resetar.isPending;

  const prompts = promptsQuery.data?.prompts ?? [];
  const promptEditando = prompts.find((p) => p.key === editandoKey) ?? null;

  const aoSalvar = (texto: string) => {
    if (!editandoKey) return;
    editar.mutate(
      { key: editandoKey, prompt: texto },
      {
        onSuccess: () => {
          notify('Prompt atualizado.', { tone: 'success' });
          setEditandoKey(null);
        },
        onError: (erro) =>
          notify(mensagemErro(erro, 'Erro ao salvar o prompt.'), { tone: 'error' }),
      },
    );
  };

  const aoResetar = () => {
    if (!editandoKey) return;
    resetar.mutate(
      { key: editandoKey },
      {
        onSuccess: () => notify('Prompt restaurado ao padrão.', { tone: 'info' }),
        onError: (erro) => notify(mensagemErro(erro, 'Erro ao resetar.'), { tone: 'error' }),
      },
    );
  };

  return (
    <section className="grid gap-3 rounded-campo border border-fio bg-painel-solido p-5">
      <h2 className="text-lg font-semibold text-fg">Prompts utilitários</h2>
      <p className="text-sm text-fg-2">
        Prompts de IA auxiliares, fora do pipeline de corte (sentimento dos comentários no ranking
        de lives, análise dos melhores thumbnails). Edite por canal; o padrão fica disponível para
        resetar. Editar mantendo o contrato (placeholders + marcador) é obrigatório — o salvamento
        valida.
      </p>

      {promptsQuery.isLoading && (
        <p className="flex items-center gap-2 text-linha text-fg-2">
          <Icon name="loader-2" size={16} className="animate-spin" />
          Carregando prompts…
        </p>
      )}

      {promptsQuery.isError && (
        <EstadoDeErro
          className="p-5"
          titulo="Não consegui carregar os prompts"
          motivo={mensagemErro(promptsQuery.error, 'O backend não respondeu. Tente de novo.')}
          aoTentar={() => void promptsQuery.refetch()}
        />
      )}

      {prompts.length > 0 && (
        <ul className="grid gap-2">
          {prompts.map((prompt) => (
            <PromptUtilitarioCard
              key={prompt.key}
              prompt={prompt}
              customizado={promptCustomizado(prompt)}
              onEditar={() => setEditandoKey(prompt.key)}
            />
          ))}
        </ul>
      )}

      <Modal
        open={promptEditando !== null}
        onClose={() => setEditandoKey(null)}
        size="xl"
        title={promptEditando ? promptEditando.etapa : ''}
        description={promptEditando?.descricao}
      >
        {promptEditando && (
          <PromptUtilitarioForm
            prompt={promptEditando}
            pending={pending}
            onSave={aoSalvar}
            onReset={aoResetar}
            onCancel={() => setEditandoKey(null)}
          />
        )}
      </Modal>
    </section>
  );
}
