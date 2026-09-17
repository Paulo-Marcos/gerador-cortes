import { API_BASE } from '@/lib/apiBase';
// D-348: cliente HTTP da gestão de prompts utilitários (IA auxiliar) por canal.
// Módulo próprio (não `lib/api.ts`, que está sob lock), no mesmo padrão de
// fetch/erro de `editorialScaffoldsApi`. Endpoints irmãos sob /editorial-skills.


async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    ...init,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`${res.status} ${res.statusText}${text ? ` — ${text}` : ''}`);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

// ─── Contratos (espelham routers/editorial_skills.py, bloco prompts-utilitarios) ─

/** Um prompt utilitário do canal: metadados + valor-do-canal + default (reset). */
export interface PromptUtilitario {
  key: string;
  /** Nome curto da etapa (ex.: "Sentimento dos comentários"). */
  etapa: string;
  /** Explicação funcional: para que serve o prompt. */
  descricao: string;
  prompt: string;
  prompt_default: string;
  /** Placeholders `{...}` que o prompt DEVE conter (guardrail do contrato). */
  placeholders: string[];
  /** Token que o contrato de saída exige (ex.: `JSON`). */
  marcador: string;
}

export interface ListaPromptsUtilitariosResponse {
  prompts: PromptUtilitario[];
}

// ─── Endpoints ─────────────────────────────────────────────────────────────

export const promptsUtilitariosApi = {
  listar: () =>
    request<ListaPromptsUtilitariosResponse>('/editorial-skills/prompts-utilitarios'),

  editar: (key: string, prompt: string) =>
    request<PromptUtilitario>(`/editorial-skills/prompts-utilitarios/${encodeURIComponent(key)}`, {
      method: 'PUT',
      body: JSON.stringify({ prompt }),
    }),

  resetar: (key: string) =>
    request<PromptUtilitario>(
      `/editorial-skills/prompts-utilitarios/${encodeURIComponent(key)}/reset`,
      { method: 'POST' },
    ),
};
