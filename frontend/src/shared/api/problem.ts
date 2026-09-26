import type { Middleware } from 'openapi-fetch';

// Erro de uma chamada à API (D-721).
//
// A mensagem é a MESMA que o `request()` de `lib/api.ts` sempre montou —
// "<status> <statusText> — <corpo>" —, porque as telas a exibem e algumas a
// examinam. Trocar de cliente não pode mudar o que o operador lê.

export class ErroDaApi extends Error {
  constructor(
    readonly status: number,
    readonly corpo: string,
    statusText: string,
  ) {
    super(`${status} ${statusText}${corpo ? ` — ${corpo}` : ''}`);
    this.name = 'ErroDaApi';
  }

  /** O `detail` do corpo `{"detail": ...}` do backend, quando houver. */
  get detalhe(): string {
    try {
      const dados: unknown = JSON.parse(this.corpo);
      if (dados && typeof dados === 'object' && 'detail' in dados) {
        return String((dados as { detail: unknown }).detail);
      }
    } catch {
      // corpo que não é JSON: o texto cru já é o detalhe
    }
    return this.corpo;
  }
}

/** Resposta fora de 2xx vira exceção, como no `request()` que este cliente substitui. */
export const rejeitarErros: Middleware = {
  async onResponse({ response }) {
    if (response.ok) return undefined;
    const corpo = await response
      .clone()
      .text()
      .catch(() => '');
    throw new ErroDaApi(response.status, corpo, response.statusText);
  },
};

/**
 * Os dados de uma resposta que já passou pelo `rejeitarErros`.
 *
 * O `openapi-fetch` tipa `data` como opcional porque não sabe que o erro virou
 * exceção; aqui ele só falta numa resposta sem corpo (204).
 */
export async function dados<T>(chamada: Promise<{ data?: T }>): Promise<T> {
  const { data } = await chamada;
  return data as T;
}
