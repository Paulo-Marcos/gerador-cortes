// D-285: API dedicada da identidade do mascote (nome citado nos prompts de
// thumbnail/metadados), editável na página/modal de Configurações.
//
// Vive FORA de `lib/api.ts` e `types/models.ts` porque ambos estão sob lock e
// fora do escopo desta demanda — o mesmo precedente do bloco "D-070" em
// `lib/api.ts` (tipos definidos localmente quando `models.ts` está travado).
// Consome o MESMO endpoint `/settings` (GET/PUT) que a D-191 criou; aqui só
// isolamos o campo `mascote_nome` do payload.

const API_BASE =
  (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:8000/api';

interface SettingsComMascote {
  mascote_nome?: string;
}

async function requestSettings(init?: RequestInit): Promise<string> {
  const res = await fetch(`${API_BASE}/settings`, {
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    ...init,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`${res.status} ${res.statusText}${text ? ` — ${text}` : ''}`);
  }
  const data = (await res.json()) as SettingsComMascote;
  return data.mascote_nome ?? '';
}

/** Nome atual do mascote do canal ativo ("" quando ainda não definido). */
export const obterMascoteNome = (): Promise<string> => requestSettings();

/** Grava o nome do mascote (banco + espelho no yaml) e devolve o valor resultante. */
export const salvarMascoteNome = (nome: string): Promise<string> =>
  requestSettings({ method: 'PUT', body: JSON.stringify({ mascote_nome: nome }) });
