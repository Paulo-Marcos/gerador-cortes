// A camada de acesso à API (D-721): o cliente gerado, os tipos do contrato e o erro.
export { api, criarCliente } from './client';
export type { components, paths } from './contract';
export { dados, ErroDaApi } from './problem';

import type { components } from './contract';

/** Um schema do contrato pelo nome — `Schema<'CanalResponse'>`. */
export type Schema<Nome extends keyof components['schemas']> = components['schemas'][Nome];
