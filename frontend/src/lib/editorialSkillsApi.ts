// E-021: cliente HTTP da gestão de skills editoriais por canal. Módulo próprio
// (não `lib/api.ts`, que está sob lock) no mesmo padrão de fetch/erro de
// `channelsApi`: checa `res.ok`, propaga status + corpo no erro, desserializa JSON.

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

// ─── Contratos (espelham backend/app/routers/editorial_skills.py) ──────────

/** Params da etapa (provider Claude): sem temperature (só existe no Gemini). */
export interface SkillParams {
  modelo: string;
  thinking_tokens: number;
  timeout: number;
}

/** Uma skill editorial do canal: metadados + valor-do-canal + default (reset). */
export interface EditorialSkill {
  key: string;
  /** Nome curto da etapa (ex.: "Propor cortes"). */
  etapa: string;
  /** Explicação funcional: para que serve a skill. */
  descricao: string;
  corpo: string;
  params: SkillParams;
  /** Lentes de variação da etapa (vazio p/ trechos/thumbnail, por design). */
  lentes: string[];
  corpo_default: string;
  params_default: SkillParams;
  lentes_default: string[];
}

export interface ListaSkillsResponse {
  skills: EditorialSkill[];
}

/** Campos editáveis (merge: só os informados mudam). */
export interface UpdateSkillPayload {
  corpo?: string;
  params?: SkillParams;
  lentes?: string[];
}

/** Campos a restaurar ao default: subconjunto de {corpo, params, lentes}. */
export type CampoReset = 'corpo' | 'params' | 'lentes';

// ─── Endpoints ─────────────────────────────────────────────────────────────

export const editorialSkillsApi = {
  listar: () => request<ListaSkillsResponse>('/editorial-skills'),

  editar: (key: string, body: UpdateSkillPayload) =>
    request<EditorialSkill>(`/editorial-skills/${encodeURIComponent(key)}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    }),

  resetar: (key: string, campos: CampoReset[]) =>
    request<EditorialSkill>(`/editorial-skills/${encodeURIComponent(key)}/reset`, {
      method: 'POST',
      body: JSON.stringify({ campos }),
    }),
};
