import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { motivoDoErro } from '../shortsApi';

// D-529: o 422 ao subir a arte da capa do TikTok.
//
// O helper declarava `application/json` em toda requisicao. Num corpo
// `FormData` isso impede o browser de escrever o `boundary` do multipart, e o
// FastAPI recebe o campo do arquivo como ausente:
//
//   {"detail":[{"type":"missing","loc":["body","arquivo"],...}]}
//
// O erro aponta para o backend e a causa esta no cliente — por isso vale um
// teste, e nao so a correcao. D-722: o helper saiu (as chamadas vão pelo
// cliente gerado), e a regra passou a ser conferida nas chamadas de verdade.

let pedidos: Request[] = [];

beforeEach(() => {
  pedidos = [];
  vi.resetModules();
  vi.stubEnv('VITE_API_URL', 'http://api.test/api');
  vi.stubGlobal(
    'fetch',
    vi.fn(async (pedido: Request) => {
      pedidos.push(pedido);
      return new Response('{}', { status: 200 });
    }),
  );
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const shorts = async () => (await import('../shortsApi')).shortsApi;
const arquivo = () => new File(['png'], 'arte.png', { type: 'image/png' });

describe('o arquivo sobe como multipart, nunca como JSON', () => {
  it.each([
    ['a arte da capa do short', async () => (await shorts()).subirArteDaCapa('s1', arquivo())],
    ['a arte da capa do TikTok', async () => (await shorts()).subirArteCapaTiktok('c1', arquivo())],
    ['a capa pronta do TikTok', async () => (await shorts()).subirCapaTiktok('c1', arquivo())],
  ])('%s', async (_nome, subir) => {
    await subir();

    expect(pedidos[0].headers.get('content-type')).toMatch(/^multipart\/form-data; boundary=/);
    expect(((await pedidos[0].formData()).get('arquivo') as File).name).toBe('arte.png');
  });

  it('o corpo comum continua JSON', async () => {
    await (await shorts()).indicarParaShorts('c1', true);

    expect(pedidos[0].headers.get('content-type')).toBe('application/json');
    expect(await pedidos[0].json()).toEqual({ indicado: true });
  });
});

// O 422 do agendamento chegava na tela como
// `422 Unprocessable Content — {"detail":"..."}`: o motivo estava lá, afogado
// no JSON. O operador precisa ler a frase, não o envelope.
describe('motivoDoErro', () => {
  it('tira a frase do detail', () => {
    const erro = new Error('422 Unprocessable Content — {"detail":"escolha outro horário"}');

    expect(motivoDoErro(erro, 'falhou')).toBe('escolha outro horário');
  });

  it('junta as mensagens quando o detail é a lista do FastAPI', () => {
    const erro = new Error(
      '422 Unprocessable Content — {"detail":[{"msg":"campo obrigatório"},{"msg":"tipo errado"}]}',
    );

    expect(motivoDoErro(erro, 'falhou')).toBe('campo obrigatório; tipo errado');
  });

  it('sem JSON, devolve a mensagem como veio', () => {
    expect(motivoDoErro(new Error('502 Bad Gateway'), 'falhou')).toBe('502 Bad Gateway');
  });

  it('sem erro legível, usa o texto padrão', () => {
    expect(motivoDoErro(undefined, 'nao consegui criar o lote')).toBe('nao consegui criar o lote');
  });
});
