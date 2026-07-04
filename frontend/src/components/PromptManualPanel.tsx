import { useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, ChevronDown, ChevronRight, ClipboardPaste, Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { copyTextToClipboard } from '@/lib/clipboard';
import { getManualPromptText } from '@/lib/manualPrompt';

export type PromptParte = { parte: number; total_partes: number; texto: string };

export type PromptManualData = {
  prompt?: string;
  prompts?: Array<{ texto: string; parte?: number; total_partes?: number }>;
};

export type PromptQueryLike = {
  data?: PromptManualData;
  isLoading: boolean;
  error?: unknown;
};

export function extrairPartesPrompt(data: PromptManualData | undefined): PromptParte[] {
  if (data?.prompts && data.prompts.length > 0) {
    return data.prompts.map((p, i) => ({
      parte: p.parte ?? i + 1,
      total_partes: p.total_partes ?? data.prompts!.length,
      texto: p.texto,
    }));
  }
  if (data?.prompt) {
    return [{ parte: 1, total_partes: 1, texto: data.prompt }];
  }
  return [{ parte: 1, total_partes: 1, texto: '' }];
}

export type PromptAutoCopyTarget = {
  index: number;
  key: string;
  text: string;
};

export function getPromptAutoCopyTarget(
  data: PromptManualData | undefined,
): PromptAutoCopyTarget | null {
  const partes = extrairPartesPrompt(data);
  const index = partes.findIndex((parte) => parte.texto.trim().length > 0);
  if (index < 0) return null;

  const text = getManualPromptText(data, index);
  if (!text) return null;

  const part = partes[index];
  return {
    index,
    key: `${part.parte}:${part.total_partes}:${text.length}:${text.slice(0, 80)}`,
    text,
  };
}

interface Props {
  prompt: PromptQueryLike;
  jsonPorParte: Record<number, string>;
  onChangeJsonPorParte: (next: Record<number, string>) => void;
  /** Erro a exibir abaixo (validação de submit). */
  jsonErro?: string | null;
  onErrorChange?: (msg: string | null) => void;
  /** Placeholder dentro do textarea de resposta. */
  jsonPlaceholder?: string;
  /** Texto auxiliar acima dos cards (instrução curta opcional). */
  hint?: React.ReactNode;
  /** Esconde a área de "Colar resposta" (prompts só-leitura, ex: agente livre). */
  hideRetorno?: boolean;
  /** Sobrescreve o rótulo "ver prompt"/"ver resposta" para idioma do contexto. */
  labels?: { prompt?: string; resposta?: string };
}

export function PromptManualPanel({
  prompt,
  jsonPorParte,
  onChangeJsonPorParte,
  jsonErro,
  onErrorChange,
  jsonPlaceholder,
  hint,
  hideRetorno = false,
  labels,
}: Props) {
  const partes = useMemo(() => extrairPartesPrompt(prompt.data), [prompt.data]);
  const total = partes.length;
  const colado = (i: number) => Boolean(jsonPorParte[i]?.trim());
  const partesColadas = useMemo(
    () => partes.filter((_, i) => colado(i)).length,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [partes, jsonPorParte],
  );
  const todasColadas = !hideRetorno && partesColadas === total;

  const [expandido, setExpandido] = useState<Record<number, { prompt: boolean; json: boolean }>>(
    {},
  );
  const [copiadoParte, setCopiadoParte] = useState<number | null>(null);
  const [coladoParte, setColadoParte] = useState<number | null>(null);
  const autoCopyKeyRef = useRef<string | null>(null);
  const autoCopyTarget = useMemo(() => getPromptAutoCopyTarget(prompt.data), [prompt.data]);

  useEffect(() => {
    if (!autoCopyTarget) {
      autoCopyKeyRef.current = null;
      return;
    }
    if (autoCopyKeyRef.current === autoCopyTarget.key) return;

    autoCopyKeyRef.current = autoCopyTarget.key;
    void copyTextToClipboard(autoCopyTarget.text).then((copied) => {
      if (!copied) {
        autoCopyKeyRef.current = null;
        return;
      }

      setCopiadoParte(autoCopyTarget.index);
      setTimeout(() => setCopiadoParte((cur) => (cur === autoCopyTarget.index ? null : cur)), 1500);
    });
  }, [autoCopyTarget]);

  const toggle = (i: number, key: 'prompt' | 'json') =>
    setExpandido((prev) => {
      const atual = prev[i] ?? { prompt: false, json: false };
      return { ...prev, [i]: { ...atual, [key]: !atual[key] } };
    });

  const setErro = (msg: string | null) => onErrorChange?.(msg);

  const onCopiarParte = async (i: number) => {
    const texto = getManualPromptText(prompt.data, i);
    if (!texto) return;
    if (await copyTextToClipboard(texto)) {
      setCopiadoParte(i);
      setTimeout(() => setCopiadoParte((cur) => (cur === i ? null : cur)), 1500);
    }
  };

  const onColarParte = async (i: number) => {
    try {
      const text = await navigator.clipboard.readText();
      if (!text.trim()) {
        setErro(`Parte ${i + 1}: área de transferência vazia.`);
        return;
      }
      onChangeJsonPorParte({ ...jsonPorParte, [i]: text });
      setErro(null);
      setColadoParte(i);
      setTimeout(() => setColadoParte((cur) => (cur === i ? null : cur)), 1500);
    } catch {
      setErro(
        `Parte ${i + 1}: o navegador bloqueou a leitura automática. Expanda "ver resposta" e cole manualmente (Ctrl+V).`,
      );
      setExpandido((prev) => ({
        ...prev,
        [i]: { ...(prev[i] ?? { prompt: false, json: false }), json: true },
      }));
    }
  };

  const labelPrompt = labels?.prompt ?? 'ver prompt';
  const labelResposta = labels?.resposta ?? 'ver resposta';

  return (
    <div className="flex flex-col gap-2">
      {(hint || total > 1 || !hideRetorno) && (
        <div className="flex items-center justify-between gap-2 text-xs text-text-300">
          <div className="flex-1">
            {hint ?? (
              <p>
                {total > 1
                  ? `Prompt dividido em ${total} partes. Para cada uma: copie, cole na IA, copie a resposta e cole de volta aqui.`
                  : 'Copie o prompt, cole na IA, copie a resposta e cole de volta aqui.'}
              </p>
            )}
          </div>
          {!hideRetorno && (
            <span
              className={cn(
                'shrink-0 rounded-full px-2 py-0.5 text-[10px]',
                todasColadas ? 'bg-success/15 text-success' : 'bg-bg-800 text-text-400',
              )}
            >
              {partesColadas}/{total} coladas
            </span>
          )}
        </div>
      )}

      {partes.map((part, index) => {
        const coladoTexto = jsonPorParte[index] ?? '';
        const ok = colado(index);
        const exp = expandido[index] ?? { prompt: false, json: false };
        const promptTextoParte = getManualPromptText(prompt.data, index);
        const semPrompt = !promptTextoParte && !prompt.isLoading;

        return (
          <div
            key={`${part.parte}-${part.total_partes}`}
            className={cn(
              'rounded-[var(--radius-sm)] border bg-bg-900/60 transition-colors',
              ok ? 'border-success/40' : 'border-[var(--border)]',
            )}
          >
            <div className="flex flex-wrap items-center gap-2 p-3">
              <span className="text-xs font-semibold text-text-100">
                Parte {part.parte}/{part.total_partes}
              </span>
              {!hideRetorno && (
                <span
                  className={cn(
                    'rounded-full px-2 py-0.5 text-[10px]',
                    ok ? 'bg-success/15 text-success' : 'bg-bg-800 text-text-400',
                  )}
                >
                  {ok ? '✓ resposta colada' : 'pendente'}
                </span>
              )}
              <div className="ml-auto flex items-center gap-1.5">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void onCopiarParte(index)}
                  disabled={semPrompt}
                >
                  {copiadoParte === index ? <CheckCircle2 size={14} /> : <Copy size={14} />}
                  {copiadoParte === index ? 'Copiado' : 'Copiar prompt'}
                </Button>
                {!hideRetorno && (
                  <Button type="button" size="sm" onClick={() => void onColarParte(index)}>
                    {coladoParte === index ? (
                      <CheckCircle2 size={14} />
                    ) : (
                      <ClipboardPaste size={14} />
                    )}
                    {coladoParte === index ? 'Colado' : 'Colar resposta'}
                  </Button>
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3 border-t border-[var(--border)] px-3 py-1.5 text-[11px] text-text-400">
              <button
                type="button"
                onClick={() => toggle(index, 'prompt')}
                className="flex items-center gap-1 hover:text-text-200"
              >
                {exp.prompt ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                {labelPrompt}
              </button>
              {!hideRetorno && (
                <button
                  type="button"
                  onClick={() => toggle(index, 'json')}
                  className="flex items-center gap-1 hover:text-text-200"
                >
                  {exp.json ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                  {labelResposta}
                  {ok && <span className="text-text-500">({coladoTexto.length} chars)</span>}
                </button>
              )}
            </div>

            {exp.prompt && (
              <textarea
                readOnly
                value={
                  prompt.isLoading
                    ? 'Carregando prompt...'
                    : prompt.error
                      ? `Erro: ${(prompt.error as Error).message}`
                      : promptTextoParte
                }
                className="h-32 w-full resize-none border-t border-[var(--border)] bg-bg-950 px-2 py-1.5 font-mono text-[11px] text-text-200 outline-none"
              />
            )}

            {!hideRetorno && exp.json && (
              <textarea
                value={coladoTexto}
                onChange={(e) => {
                  onChangeJsonPorParte({ ...jsonPorParte, [index]: e.target.value });
                  setErro(null);
                }}
                placeholder={jsonPlaceholder}
                className="h-40 w-full resize-y border-t border-[var(--border)] bg-bg-900 px-2 py-1.5 font-mono text-[11px] text-text-100 outline-none focus:border-accent-500"
              />
            )}
          </div>
        );
      })}

      {jsonErro && <p className="text-xs text-error">{jsonErro}</p>}
    </div>
  );
}

/**
 * Valida que todas as partes têm conteúdo colado. Retorna textos por índice
 * ou mensagem de erro com a parte que falhou. Não parseia JSON — deixa a
 * semântica de merge para o chamador.
 */
export type ColarValidacao = { ok: true; textos: string[] } | { ok: false; erro: string };

export function colarPartesCompleto(
  jsonPorParte: Record<number, string>,
  totalPartes: number,
): ColarValidacao {
  const textos: string[] = [];
  for (let i = 0; i < totalPartes; i++) {
    const raw = jsonPorParte[i]?.trim();
    if (!raw)
      return { ok: false, erro: `Parte ${i + 1}/${totalPartes}: resposta ainda não colada.` };
    textos.push(raw);
  }
  return { ok: true, textos };
}
