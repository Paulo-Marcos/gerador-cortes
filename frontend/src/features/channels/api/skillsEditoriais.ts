import { api, dados, type Schema } from '@/shared/api';
// E-021: cliente HTTP da gestão de skills editoriais por canal.
// D-722: pelo cliente gerado do contrato; os tipos vêm do openapi.json (antes eram
// cópias à mão de routers/editorial_skills.py).

// ─── Contratos (gerados de backend/app/routers/editorial_skills.py) ────────

/** Uma skill editorial do canal: metadados + valor-do-canal + default (reset). */
export type EditorialSkill = Schema<'SkillDescritaResponse'>;
/** Params da etapa. Cada botão de IA usa o modelo do seu provider. */
export type SkillParams = EditorialSkill['params'];
export type ListaSkillsResponse = Schema<'ListaSkillsResponse'>;
/** Um modelo que o `agy` da máquina oferece. */
export type ModeloGemini = Schema<'ListaModelosGeminiResponse'>['modelos'][number];
/** Campos editáveis (merge: só os informados mudam). */
export type UpdateSkillPayload = Schema<'UpdateSkillRequest'>;
/** Campos a restaurar ao default: subconjunto de {corpo, params, lentes}. */
export type CampoReset = 'corpo' | 'params' | 'lentes';

// ─── Histórico de versões (D-312) ──────────────────────────────────────────

export type ListaVersoesResponse = Schema<'ListaVersoesResponse'>;
/** Uma versão no histórico append-only de uma skill: data + o que mudou. */
export type SkillVersao = ListaVersoesResponse['versoes'][number];

// ─── Endpoints ─────────────────────────────────────────────────────────────

const daSkill = (key: string) => ({ params: { path: { skill_key: key } } });

export const editorialSkillsApi = {
  listar: () => dados(api.GET('/api/editorial-skills')),

  /** Vazio quando o `agy` não está instalado ou logado: o campo aceita texto livre. */
  listarModelosGemini: () => dados(api.GET('/api/editorial-skills/modelos-gemini')),

  editar: (key: string, body: UpdateSkillPayload) =>
    dados(api.PUT('/api/editorial-skills/{skill_key}', { ...daSkill(key), body })),

  resetar: (key: string, campos: CampoReset[]) =>
    dados(api.POST('/api/editorial-skills/{skill_key}/reset', { ...daSkill(key), body: { campos } })),

  // D-312: histórico append-only — listar versões e reverter a uma delas.
  listarVersoes: (key: string) => dados(api.GET('/api/editorial-skills/{skill_key}/versoes', daSkill(key))),

  reverter: (key: string, versao: number) =>
    dados(api.POST('/api/editorial-skills/{skill_key}/reverter', { ...daSkill(key), body: { versao } })),
};
