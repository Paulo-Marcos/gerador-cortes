import { useMemo, useState } from 'react';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { useImportarDesvios, usePromptDesvios } from '@/hooks/useEditor';
import { parseManualJson } from '@/lib/manualPrompt';
import {
  PromptManualPanel,
  colarPartesCompleto,
  extrairPartesPrompt,
} from '@/components/PromptManualPanel';

interface Props {
  open: boolean;
  onClose: () => void;
  corteId: string;
}

function extrairTrechos(parsed: unknown): unknown[] {
  if (Array.isArray(parsed)) return parsed;
  if (parsed && typeof parsed === 'object' && 'trechos' in parsed) {
    const t = (parsed as { trechos: unknown }).trechos;
    if (Array.isArray(t)) return t;
  }
  throw new Error('Espere um array de trechos ou um objeto { trechos: [...] }.');
}

export function TrechosManualModal({ open, onClose, corteId }: Props) {
  const prompt = usePromptDesvios(corteId, open);
  const importar = useImportarDesvios(corteId);
  const [jsonPorParte, setJsonPorParte] = useState<Record<number, string>>({});
  const [erro, setErro] = useState<string | null>(null);

  const partes = useMemo(() => extrairPartesPrompt(prompt.data), [prompt.data]);
  const totalPartes = partes.length;
  const partesColadas = useMemo(
    () => partes.filter((_, i) => Boolean(jsonPorParte[i]?.trim())).length,
    [partes, jsonPorParte],
  );
  const todasColadas = partesColadas === totalPartes;

  const onImportar = () => {
    setErro(null);
    const validacao = colarPartesCompleto(jsonPorParte, totalPartes);
    if (!validacao.ok) {
      setErro(validacao.erro);
      return;
    }
    try {
      const trechos: unknown[] = [];
      validacao.textos.forEach((s, i) => {
        let parsed: unknown;
        try {
          parsed = parseManualJson(s);
        } catch (err) {
          throw new Error(`Parte ${i + 1}: JSON inválido (${(err as Error).message}).`);
        }
        trechos.push(...extrairTrechos(parsed));
      });
      if (trechos.length === 0) {
        throw new Error('Nenhum trecho encontrado no JSON.');
      }
      importar.mutate(trechos, {
        onSuccess: () => {
          setJsonPorParte({});
          onClose();
        },
        onError: (e) => setErro((e as Error).message),
      });
    } catch (e) {
      setErro((e as Error).message);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title="✂️ Trechos a remover — manual (IA externa)"
      description="Copie o prompt, cole numa IA externa, e importe o JSON com os trechos a remover."
    >
      <PromptManualPanel
        prompt={prompt}
        jsonPorParte={jsonPorParte}
        onChangeJsonPorParte={setJsonPorParte}
        jsonErro={erro}
        onErrorChange={setErro}
        jsonPlaceholder={
          '{\n  "trechos": [\n    { "inicio_hms": "00:01:23", "fim_hms": "00:01:30", "tipo": "REPETICAO", "motivo": "..." }\n  ]\n}'
        }
      />

      <div className="mt-4 flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onClose} disabled={importar.isPending}>
          Cancelar
        </Button>
        <Button type="button" onClick={onImportar} disabled={!todasColadas || importar.isPending}>
          {importar.isPending ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <CheckCircle2 size={14} />
          )}
          Importar trechos{totalPartes > 1 ? ` (${partesColadas}/${totalPartes})` : ''}
        </Button>
      </div>
    </Modal>
  );
}
