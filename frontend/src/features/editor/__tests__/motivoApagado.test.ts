import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { MOTIVOS_APAGADO } from '../motivoApagado';

// D-993: o motivo de apagar uma proposta da IA, do lado da tela.

const DOMINIO_DO_BACKEND = resolve(__dirname, '../../../../../backend/app/domain/corte/motivo_apagado.py');

describe('acordo com o domínio do backend', () => {
  it('os motivos são os mesmos, na mesma ordem e com o mesmo rótulo', () => {
    const fonte = readFileSync(DOMINIO_DO_BACKEND, 'utf-8');
    const bloco = /^MOTIVOS_APAGADO[^=]*=\s*\(([\s\S]*?)\n\)/m.exec(fonte);
    expect(bloco, 'MOTIVOS_APAGADO sumiu do domínio do backend').not.toBeNull();
    const noBackend = [...(bloco?.[1] ?? '').matchAll(/"slug": "([^"]+)", "rotulo": "([^"]+)"/g)].map(
      ([, slug, rotulo]) => ({ slug, rotulo }),
    );
    expect(noBackend).toEqual(MOTIVOS_APAGADO);
  });
});
