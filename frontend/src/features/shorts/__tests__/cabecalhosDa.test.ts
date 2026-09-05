import { describe, expect, it } from 'vitest';
import { cabecalhosDa } from '../shortsApi';

// D-529: o 422 ao subir a arte da capa do TikTok.
//
// O helper declarava `application/json` em toda requisicao. Num corpo
// `FormData` isso impede o browser de escrever o `boundary` do multipart, e o
// FastAPI recebe o campo do arquivo como ausente:
//
//   {"detail":[{"type":"missing","loc":["body","arquivo"],...}]}
//
// O erro aponta para o backend e a causa esta no cliente — por isso vale um
// teste, e nao so a correcao.

describe('cabecalhosDa', () => {
  it('NAO declara content-type quando o corpo e FormData', () => {
    const cabecalhos = cabecalhosDa({ body: new FormData() }) as Record<string, string>;

    expect(cabecalhos['Content-Type']).toBeUndefined();
  });

  it('declara json no corpo comum', () => {
    const cabecalhos = cabecalhosDa({ body: '{"a":1}' }) as Record<string, string>;

    expect(cabecalhos['Content-Type']).toBe('application/json');
  });

  it('requisicao sem corpo continua json', () => {
    const cabecalhos = cabecalhosDa({ method: 'POST' }) as Record<string, string>;

    expect(cabecalhos['Content-Type']).toBe('application/json');
  });

  it('sem init nenhum tambem', () => {
    expect((cabecalhosDa() as Record<string, string>)['Content-Type']).toBe('application/json');
  });

  it('cabecalho explicito do chamador vence', () => {
    const cabecalhos = cabecalhosDa({
      body: new FormData(),
      headers: { 'X-Teste': 'sim' },
    }) as Record<string, string>;

    expect(cabecalhos['X-Teste']).toBe('sim');
  });
});
