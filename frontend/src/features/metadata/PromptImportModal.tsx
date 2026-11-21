import { useEffect, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Modal } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toaster';
import { PromptManualPanel } from '@/components/PromptManualPanel';
import { metadadosApi } from './api/metadados';

export type PromptModalKind = 'metadata' | 'thumbnail' | 'thumbnail-agent' | 'thumbnail-agent-livre';

// O fluxo manual (copiar o prompt, gerar fora do app, colar o JSON de volta): o caminho de quem
// quer escolher a IA ou usar a assinatura de outro lugar. O contrato do modal não mudou.

/** O título e a descrição do modal, pelo tipo de prompt que ele mostra. */
export function textosDoModal(kind: PromptModalKind | null) {
  if (kind === 'thumbnail-agent-livre') {
    return {
      title: 'Prompt para Agente (livre)',
      description:
        'Versao mais permissiva: o agente tem liberdade de composicao e texto, mas mantem o mesmo Sapo.',
    };
  }
  if (kind === 'thumbnail-agent') {
    return {
      title: 'Prompt para Agente',
      description: 'Copie este bloco e envie ao GPT capista para gerar as imagens diretamente.',
    };
  }
  return {
    title: kind === 'thumbnail' ? 'Prompt de Thumbnail' : 'Gerar Metadados',
    description: 'Copie o prompt, gere fora da aplicacao e cole o JSON de volta aqui.',
  };
}

function usePromptManual(corteId: string, kind: PromptModalKind | null) {
  return useQuery({
    queryKey: ['manual-prompt', kind, corteId],
    queryFn: () => {
      if (kind === 'thumbnail-agent') return metadadosApi.obterPromptThumbnailAgente(corteId);
      if (kind === 'thumbnail-agent-livre') return metadadosApi.obterPromptThumbnailAgenteLivre(corteId);
      if (kind === 'thumbnail') return metadadosApi.obterPromptThumbnail(corteId);
      return metadadosApi.obterPromptMeta(corteId);
    },
    enabled: kind !== null,
  });
}

function useImportarResultado(corteId: string, kind: PromptModalKind | null, onImported: () => void) {
  const { notify } = useToast();
  return useMutation({
    mutationFn: (body: unknown) =>
      kind === 'thumbnail'
        ? metadadosApi.importarPromptThumbnail(corteId, body)
        : metadadosApi.importarMeta(corteId, body),
    onSuccess: () => {
      notify('Resultado importado com sucesso.', { tone: 'success' });
      onImported();
    },
    onError: (error) =>
      notify(error instanceof Error ? error.message : 'Erro ao importar resultado.', {
        tone: 'error',
      }),
  });
}

function RodapeDoImport(props: {
  agente: boolean;
  colado: boolean;
  importando: boolean;
  onClose: () => void;
  onImportar: () => void;
}) {
  const { agente, colado, importando, onClose, onImportar } = props;
  if (agente) {
    return (
      <Button type="button" variant="fantasma" onClick={onClose}>
        Fechar
      </Button>
    );
  }
  return (
    <>
      <Button type="button" variant="fantasma" onClick={onClose}>
        Cancelar
      </Button>
      <Button type="button" variant="secundario" onClick={onImportar} disabled={!colado} carregando={importando}>
        <Icon name="upload-cloud" />
        Importar
      </Button>
    </>
  );
}

export function PromptImportModal({
  corteId,
  kind,
  onClose,
  onImported,
}: {
  corteId: string;
  kind: PromptModalKind | null;
  onClose: () => void;
  onImported: () => void;
}) {
  const [jsonPorParte, setJsonPorParte] = useState<Record<number, string>>({});
  const [erro, setErro] = useState<string | null>(null);
  const open = kind !== null;
  const isAgentPrompt = kind === 'thumbnail-agent' || kind === 'thumbnail-agent-livre';
  const promptQuery = usePromptManual(corteId, kind);
  const importMutation = useImportarResultado(corteId, kind, onImported);

  useEffect(() => {
    if (open) {
      setJsonPorParte({});
      setErro(null);
    }
  }, [open, kind, corteId]);

  const importPayload = () => {
    if (isAgentPrompt) return;
    const payload = jsonPorParte[0]?.trim() ?? '';
    if (!payload) {
      setErro('Cole o resultado da IA antes de importar.');
      return;
    }
    try {
      importMutation.mutate(JSON.parse(payload));
    } catch {
      if (kind === 'thumbnail') {
        importMutation.mutate({ prompt_thumbnail: payload });
        return;
      }
      setErro('Para metadados, cole um JSON valido retornado pela IA.');
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      {...textosDoModal(kind)}
      size="lg"
      footer={
        <RodapeDoImport
          agente={isAgentPrompt}
          colado={Boolean(jsonPorParte[0]?.trim())}
          importando={importMutation.isPending}
          onClose={onClose}
          onImportar={importPayload}
        />
      }
    >
      <PromptManualPanel
        prompt={promptQuery}
        jsonPorParte={jsonPorParte}
        onChangeJsonPorParte={setJsonPorParte}
        jsonErro={erro}
        onErrorChange={setErro}
        hideRetorno={isAgentPrompt}
        jsonPlaceholder={
          kind === 'thumbnail'
            ? 'Cole o prompt_thumbnail ou JSON...'
            : 'Cole o JSON de metadados...'
        }
      />
    </Modal>
  );
}
