// D-348: seção "Prompts utilitários" na página de Canais. Container: orquestra o
// I/O (hooks em usePromptsUtilitarios) e delega a renderização aos componentes
// burros. Lista os prompts de IA auxiliares (fora do pipeline de corte) do canal
// ativo, mostra se cada um foi customizado e abre o editor com o guardrail do contrato.
import { useState } from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toaster';
import type { PromptUtilitario } from '@/lib/promptsUtilitariosApi';
import { PromptUtilitarioCard } from './PromptUtilitarioCard';
import { PromptUtilitarioForm } from './PromptUtilitarioForm';
import {
  useEditarPromptUtilitario,
  usePromptsUtilitarios,
  useResetarPromptUtilitario,
} from './usePromptsUtilitarios';

function mensagemErro(erro: unknown, fallback: string): string {
  return erro instanceof Error ? erro.message : fallback;
}

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
    <section className="grid gap-3 rounded-[var(--radius)] border border-[var(--wb-border-soft)] bg-[var(--wb-bg-card)] p-5">
      <h2 className="text-lg font-semibold text-[var(--wb-text)]">Prompts utilitários</h2>
      <p className="text-sm text-[var(--wb-text-mute)]">
        Prompts de IA auxiliares, fora do pipeline de corte (sentimento dos comentários no ranking
        de lives, análise dos melhores thumbnails). Edite por canal; o padrão fica disponível para
        resetar. Editar mantendo o contrato (placeholders + marcador) é obrigatório — o salvamento
        valida.
      </p>

      {promptsQuery.isLoading && (
        <p className="flex items-center gap-2 text-[15px] text-[var(--wb-text-mute)]">
          <Loader2 className="animate-spin" size={16} aria-hidden />
          Carregando prompts…
        </p>
      )}

      {promptsQuery.isError && (
        <div className="grid gap-3 rounded-[var(--radius)] border border-error/30 bg-[color-mix(in_oklch,var(--error)_10%,var(--wb-bg-card))] p-4">
          <p className="flex items-center gap-2 text-[15px] text-[var(--wb-text)]">
            <AlertTriangle size={16} aria-hidden className="text-error" />
            {mensagemErro(promptsQuery.error, 'Não foi possível carregar os prompts.')}
          </p>
          <div>
            <Button type="button" variant="outline" size="sm" onClick={() => promptsQuery.refetch()}>
              Tentar de novo
            </Button>
          </div>
        </div>
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
