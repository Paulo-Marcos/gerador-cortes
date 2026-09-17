import { API_BASE } from '@/lib/apiBase';
// E-021: cliente HTTP da gestão de skills editoriais por canal. Módulo próprio
// (não `lib/api.ts`, que está sob lock) no mesmo padrão de fetch/erro de
// `channelsApi`: checa `res.ok`, propaga status + corpo no erro, desserializa JSON.


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

/** Params da etapa. Cada botão de IA usa o modelo do seu provider. */
export interface SkillParams {
  /** Modelo do Claude CLI (opus | sonnet | haiku). */
  modelo: string;
  /** Modelo do Antigravity CLI (`agy`), usado pelo botão Gemini. */
  modelo_gemini: string;
  /** Só o Claude usa thinking tokens; o timeout vale para os dois. */
  thinking_tokens: number;
  timeout: number;
}

/** Um modelo que o `agy` da máquina oferece. */
export interface ModeloGemini {
  id: string;
  nome: string;
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

// ─── Histórico de versões (D-312) ──────────────────────────────────────────

/** Uma versão no histórico append-only de uma skill: data + o que mudou. */
export interface SkillVersao {
  versao: number;
  /** ISO-8601 UTC de quando a versão foi criada. */
  criado_em: string;
  /** True na versão atualmente em uso. */
  vigente: boolean;
  /** Resumo legível ("Versão inicial" ou os campos alterados). */
  resumo: string;
  /** Campos de conteúdo que mudaram vs. a versão anterior. */
  mudancas: string[];
}

export interface ListaVersoesResponse {
  versoes: SkillVersao[];
}

// ─── Endpoints ─────────────────────────────────────────────────────────────

export const editorialSkillsApi = {
  listar: () => request<ListaSkillsResponse>('/editorial-skills'),

  /** Vazio quando o `agy` não está instalado ou logado: o campo aceita texto livre. */
  listarModelosGemini: () =>
    request<{ modelos: ModeloGemini[] }>('/editorial-skills/modelos-gemini'),

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

  // D-312: histórico append-only — listar versões e reverter a uma delas.
  listarVersoes: (key: string) =>
    request<ListaVersoesResponse>(`/editorial-skills/${encodeURIComponent(key)}/versoes`),

  reverter: (key: string, versao: number) =>
    request<EditorialSkill>(`/editorial-skills/${encodeURIComponent(key)}/reverter`, {
      method: 'POST',
      body: JSON.stringify({ versao }),
    }),
};
