import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { isValidElement } from 'react';
import { describe, expect, it } from 'vitest';
import { cenaEmJsonSchema } from '@video-renderer/contrato-cena';
import { renderCenaV2, type CenaRemotion } from '@video-renderer/public-api';

// D-725: a cena tem uma definição só — o schema zod do renderer. O backend não
// fala zod, então lê o mesmo contrato em JSON Schema, gerado a partir dele e
// guardado no protocolo (backend/tests/test_contrato_cena_d725.py o usa). Este
// teste recusa o arquivo quando ele fica para trás do schema.

const CONTRATO = resolve(__dirname, '../../../../video-renderer/protocol/cena.schema.json');

describe('o contrato da cena no protocolo', () => {
  it('acompanha o schema zod do renderer', () => {
    const gravado: unknown = JSON.parse(readFileSync(CONTRATO, 'utf-8'));
    expect(
      gravado,
      'regrave com `node --no-warnings protocol/gerar-contratos.mjs` em video-renderer/',
    ).toEqual(cenaEmJsonSchema());
  });
});

// O único tipo do contrato sem composição: vem da v1 e a v2 não o desenha.
const TIPOS_SEM_COMPOSICAO = new Set(['mostrar_imagem']);

describe('a porta pública do renderer desenha cada tipo do contrato', () => {
  const tipos = (cenaEmJsonSchema().properties?.tipo as { enum: CenaRemotion['tipo'][] }).enum;

  it.each(tipos)('%s', (tipo) => {
    const desenho = renderCenaV2({ tipo, inicio: 0, fim: 1 });

    expect(isValidElement(desenho)).toBe(!TIPOS_SEM_COMPOSICAO.has(tipo));
  });
});
