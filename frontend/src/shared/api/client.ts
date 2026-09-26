import createClient from 'openapi-fetch';
import { ORIGEM_API } from '@/lib/apiBase';
import type { paths } from './contract';
import { rejeitarErros } from './problem';

// O cliente HTTP da API, gerado do contrato (D-721).
//
// As rotas e os tipos vêm do `backend/openapi.json` via `npm run gen:api`
// (contract.ts) — nada de tipo escrito à mão espelhando o backend. As rotas do
// contrato já começam em `/api`, então a base é a ORIGEM da API.

export function criarCliente(baseUrl: string) {
  const cliente = createClient<paths>({
    baseUrl,
    // Resolvido a cada chamada, e não guardado na criação: os testes trocam o
    // `fetch` global depois que este módulo já foi importado.
    fetch: (requisicao) => globalThis.fetch(requisicao),
  });
  cliente.use(rejeitarErros);
  return cliente;
}

export const api = criarCliente(ORIGEM_API);
