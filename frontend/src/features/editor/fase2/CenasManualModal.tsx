import { useMemo, useState } from 'react';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { useImportarCenasRemotion, usePromptCenasRemotion } from '@/hooks/useEditor';
import { parseManualJson } from '@/lib/manualPrompt';
import {
  PromptManualPanel,
  colarPartesCompleto,
  extrairPartesPrompt,
} from '@/components/PromptManualPanel';
import type { CenaRemotion, CenasRemotionPayload } from '@/types/models';

interface Props {
  open: boolean;
  onClose: () => void;
  corteId: string;
}

const MERGE_KEYS = ['cortes', 'trechos', 'cenas'] as const;

function mergeJsonPartes(parsed: unknown[]): unknown {
  if (parsed.length === 0) throw new Error('Preencha ao menos uma parte.');

  if (Array.isArray(parsed[0])) {
    return parsed.reduce<unknown[]>((acc, p) => (Array.isArray(p) ? acc.concat(p) : acc), []);
  }

  const base: Record<string, unknown> = { ...(parsed[0] as Record<string, unknown>) };
  for (const k of MERGE_KEYS) {
    if (Array.isArray(base[k])) {
      base[k] = parsed.reduce<unknown[]>((acc, p) => {
        const obj = p as Record<string, unknown>;
        return Array.isArray(obj?.[k]) ? acc.concat(obj[k] as unknown[]) : acc;
      }, []);
    }
  }
  return base;
}

function toPayload(parsed: unknown): CenasRemotionPayload {
  if (Array.isArray(parsed)) {
    return { cenas: parsed as CenaRemotion[] };
  }
  if (parsed && typeof parsed === 'object' && 'cenas' in parsed) {
    return parsed as CenasRemotionPayload;
  }
  throw new Error('Espere um array de cenas ou um objeto { cenas: [...] }.');
}

export function CenasManualModal({ open, onClose, corteId }: Props) {
  const prompt = usePromptCenasRemotion(corteId, open);
  const importar = useImportarCenasRemotion(corteId);
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
      const parsedPartes = validacao.textos.map((s, i) => {
        try {
          return parseManualJson(s);
        } catch (err) {
          throw new Error(`Parte ${i + 1}: JSON inválido (${(err as Error).message}).`);
        }
      });
      const merged = parsedPartes.length === 1 ? parsedPartes[0] : mergeJsonPartes(parsedPartes);
      const payload = toPayload(merged);
      importar.mutate(payload, {
        onSuccess: () => {
          setJsonPorParte({});
          onClose();
        },
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
      title="✍️ Cenas Remotion — manual (IA externa)"
      description="Copie o prompt, cole numa IA externa, e importe o JSON gerado."
    >
      <PromptManualPanel
        prompt={prompt}
        jsonPorParte={jsonPorParte}
        onChangeJsonPorParte={setJsonPorParte}
        jsonErro={erro}
        onErrorChange={setErro}
        jsonPlaceholder={
          '{\n  "cenas": [ { "tipo": "tela_cheia", "inicio": 0, "fim": 3, "texto": "..." } ]\n}'
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
          Importar cenas{totalPartes > 1 ? ` (${partesColadas}/${totalPartes})` : ''}
        </Button>
      </div>
    </Modal>
  );
}
