// D-297: cliente HTTP da gestão de prompts-scaffold (contrato de saída) por canal.
// Módulo próprio (não `lib/api.ts`, que está sob lock), no mesmo padrão de
// fetch/erro de `editorialSkillsApi`. Endpoints irmãos sob /editorial-skills.

const API_BASE =
  (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:8000/api';

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

// ─── Contratos (espelham routers/editorial_skills.py, bloco scaffolds) ─────

/** Um scaffold do canal: metadados + valor-do-canal + default (reset). */
export interface EditorialScaffold {
  key: string;
  /** Nome curto da etapa (ex.: "Propor cortes"). */
  etapa: string;
  /** Explicação funcional: para que serve o scaffold. */
  descricao: string;
  scaffold: string;
  scaffold_default: string;
  /** Placeholders `{...}` que o scaffold DEVE conter (guardrail do contrato). */
  placeholders: string[];
  /** Token que o contrato de saída exige (ex.: a chave JSON `desvios`). */
  marcador: string;
}

export interface ListaScaffoldsResponse {
  scaffolds: EditorialScaffold[];
}

// ─── Endpoints ─────────────────────────────────────────────────────────────

export const editorialScaffoldsApi = {
  listar: () => request<ListaScaffoldsResponse>('/editorial-skills/scaffolds'),

  editar: (key: string, scaffold: string) =>
    request<EditorialScaffold>(`/editorial-skills/scaffolds/${encodeURIComponent(key)}`, {
      method: 'PUT',
      body: JSON.stringify({ scaffold }),
    }),

  resetar: (key: string) =>
    request<EditorialScaffold>(`/editorial-skills/scaffolds/${encodeURIComponent(key)}/reset`, {
      method: 'POST',
    }),
};
