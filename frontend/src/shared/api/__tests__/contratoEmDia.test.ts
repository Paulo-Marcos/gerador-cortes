import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import openapiTS, { astToString, COMMENT_HEADER } from 'openapi-typescript';
import { describe, expect, it } from 'vitest';

// D-721: o `contract.ts` é gerado do `backend/openapi.json`, que por sua vez o
// backend confere contra as rotas (tests/test_contrato_openapi_d664.py). Este
// teste fecha a corrente: rota mudou → spec mudou → o contrato precisa ser
// regerado, senão o frontend compila contra um backend que não existe mais.
// Mudança intencional: `npm run gen:api`.

const ESPEC = resolve(__dirname, '../../../../../backend/openapi.json');
const CONTRATO = resolve(__dirname, '../contract.ts');

const semCr = (texto: string) => texto.replace(/\r\n/g, '\n');

describe('o contrato gerado', () => {
  it('está em dia com o openapi.json do backend', async () => {
    // Mesma composição do CLI (`openapi-typescript <spec> -o <arquivo>`).
    const esperado = COMMENT_HEADER + astToString(await openapiTS(pathToFileURL(ESPEC)));

    expect(semCr(readFileSync(CONTRATO, 'utf-8')) === semCr(esperado), 'rode `npm run gen:api`').toBe(
      true,
    );
  }, 60_000);
});
