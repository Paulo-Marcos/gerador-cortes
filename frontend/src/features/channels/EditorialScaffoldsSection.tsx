// D-297: seção "Prompts (scaffold) do canal" na página de Canais. Container:
// orquestra o I/O (hooks em useEditorialScaffolds) e delega a renderização aos
// componentes burros. Lista os 5 scaffolds (contrato de saída) do canal ativo,
// mostra se cada um foi customizado e abre o editor com o guardrail do contrato.
import { useState } from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toaster';
import type { EditorialScaffold } from '@/features/channels/api/scaffolds';
import { EditorialScaffoldCard } from './EditorialScaffoldCard';
import { EditorialScaffoldForm } from './EditorialScaffoldForm';
import {
  useEditarScaffold,
  useEditorialScaffolds,
  useResetarScaffold,
} from './useEditorialScaffolds';

function mensagemErro(erro: unknown, fallback: string): string {
  return erro instanceof Error ? erro.message : fallback;
}

/** True quando o canal difere do default (comparação sem espaços nas bordas). */
export function scaffoldCustomizado(scaffold: EditorialScaffold): boolean {
  return scaffold.scaffold.trim() !== scaffold.scaffold_default.trim();
}

export function EditorialScaffoldsSection() {
  const { notify } = useToast();
  const scaffoldsQuery = useEditorialScaffolds();
  const editar = useEditarScaffold();
  const resetar = useResetarScaffold();

  const [editandoKey, setEditandoKey] = useState<string | null>(null);
  const pending = editar.isPending || resetar.isPending;

  const scaffolds = scaffoldsQuery.data?.scaffolds ?? [];
  const scaffoldEditando = scaffolds.find((s) => s.key === editandoKey) ?? null;

  const aoSalvar = (texto: string) => {
    if (!editandoKey) return;
    editar.mutate(
      { key: editandoKey, scaffold: texto },
      {
        onSuccess: () => {
          notify('Scaffold atualizado.', { tone: 'success' });
          setEditandoKey(null);
        },
        onError: (erro) =>
          notify(mensagemErro(erro, 'Erro ao salvar o scaffold.'), { tone: 'error' }),
      },
    );
  };

  const aoResetar = () => {
    if (!editandoKey) return;
    resetar.mutate(
      { key: editandoKey },
      {
        onSuccess: () => notify('Scaffold restaurado ao padrão.', { tone: 'info' }),
        onError: (erro) => notify(mensagemErro(erro, 'Erro ao resetar.'), { tone: 'error' }),
      },
    );
  };

  return (
    <section className="grid gap-3 rounded-[var(--radius)] border border-[var(--wb-border-soft)] bg-[var(--wb-bg-card)] p-5">
      <h2 className="text-lg font-semibold text-[var(--wb-text)]">Prompts (scaffold) do canal</h2>
      <p className="text-sm text-[var(--wb-text-mute)]">
        O invólucro de cada etapa: embrulha a transcrição/contexto e fixa o formato de retorno que
        o pipeline consome. Edite por canal; o padrão fica disponível para resetar. Editar mantendo
        o contrato (placeholders + marcador) é obrigatório — o salvamento valida.
      </p>

      {scaffoldsQuery.isLoading && (
        <p className="flex items-center gap-2 text-[15px] text-[var(--wb-text-mute)]">
          <Loader2 className="animate-spin" size={16} aria-hidden />
          Carregando scaffolds…
        </p>
      )}

      {scaffoldsQuery.isError && (
        <div className="grid gap-3 rounded-[var(--radius)] border border-error/30 bg-[color-mix(in_oklch,var(--error)_10%,var(--wb-bg-card))] p-4">
          <p className="flex items-center gap-2 text-[15px] text-[var(--wb-text)]">
            <AlertTriangle size={16} aria-hidden className="text-error" />
            {mensagemErro(scaffoldsQuery.error, 'Não foi possível carregar os scaffolds.')}
          </p>
          <div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => scaffoldsQuery.refetch()}
            >
              Tentar de novo
            </Button>
          </div>
        </div>
      )}

      {scaffolds.length > 0 && (
        <ul className="grid gap-2">
          {scaffolds.map((scaffold) => (
            <EditorialScaffoldCard
              key={scaffold.key}
              scaffold={scaffold}
              customizado={scaffoldCustomizado(scaffold)}
              onEditar={() => setEditandoKey(scaffold.key)}
            />
          ))}
        </ul>
      )}

      <Modal
        open={scaffoldEditando !== null}
        onClose={() => setEditandoKey(null)}
        size="xl"
        title={scaffoldEditando ? scaffoldEditando.etapa : ''}
        description={scaffoldEditando?.descricao}
      >
        {scaffoldEditando && (
          <EditorialScaffoldForm
            scaffold={scaffoldEditando}
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
