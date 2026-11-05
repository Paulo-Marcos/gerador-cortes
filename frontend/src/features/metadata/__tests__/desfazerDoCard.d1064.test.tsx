import { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { assentar, montar } from '../../editor/__tests__/domMinimo';
import type { Corte } from '@/types/models';

// D-1064: as duas regressões do Desfazer que a auditoria do #327 mediu. Na S1, o blur e o
// clique saem juntos, e o texto do blur ficava na tela por cima do que o Desfazer gravou.
// Na S2, ir e voltar de corte durante o Regerar apagava a versão guardada, e o texto
// anterior ficava sem volta. Roda o hook de verdade, com o servidor em memória.

const h = vi.hoisted(() => ({
  servidor: {} as Record<string, Record<string, unknown>>,
  salvos: [] as { corteId: string; patch: object }[],
  terminarIa: null as (() => void) | null,
  prenderProximaLeitura: false,
  soltarLeitura: null as (() => void) | null,
  falharProximoSalvo: false,
  gerar: vi.fn(),
  regerar: vi.fn(),
}));

vi.mock('@/components/ui/toaster', () => ({ useToast: () => ({ notify: vi.fn() }) }));
vi.mock('@/features/ia', () => ({
  geracaoIaApi: { gerarMetadadosClaude: h.gerar, regerarMetadadosClaude: h.regerar },
  useUltimaGeracao: () => ({ data: null }),
}));
vi.mock('../api/metadados', () => ({
  metadadosApi: {
    obterMetadado: async (corteId: string) => {
      const lido = { ...h.servidor[corteId] };
      if (!h.prenderProximaLeitura) return lido;
      h.prenderProximaLeitura = false;
      return new Promise((resolve) => {
        h.soltarLeitura = () => resolve(lido);
      });
    },
    atualizarMetadado: async (corteId: string, patch: object) => {
      if (h.falharProximoSalvo) {
        h.falharProximoSalvo = false;
        throw new Error('o servidor recusou');
      }
      h.salvos.push({ corteId, patch });
      h.servidor[corteId] = { ...h.servidor[corteId], ...patch };
      return {};
    },
  },
}));

const { useMetadataCard } = await import('../useMetadataCard');
type Card = ReturnType<typeof useMetadataCard>;

const GRAVADO = {
  titulo_youtube: 'Título gravado',
  texto_capa: 'CAPA GRAVADA',
  descricao_youtube: 'Descrição gravada',
  tags_youtube: ['gravada'],
};
const DA_IA = {
  titulo_youtube: 'Título da IA',
  texto_capa: 'CAPA DA IA',
  descricao_youtube: 'Descrição da IA',
  tags_youtube: ['ia'],
};
const DO_OUTRO_CORTE = {
  titulo_youtube: 'Título de c2',
  texto_capa: 'CAPA DE C2',
  descricao_youtube: 'Descrição de c2',
  tags_youtube: ['c2'],
};
const TELA_GRAVADA = {
  title: 'Título gravado',
  coverText: 'CAPA GRAVADA',
  description: 'Descrição gravada',
  tagsText: 'gravada',
};
const TELA_DA_IA = {
  title: 'Título da IA',
  coverText: 'CAPA DA IA',
  description: 'Descrição da IA',
  tagsText: 'ia',
};

let card: Card;
let irParaCorte: (id: string) => void;
let limpar: () => Promise<void>;

function Sonda() {
  const [corteId, setCorteId] = useState('c1');
  irParaCorte = setCorteId;
  card = useMetadataCard({ projetoId: 'p1', cut: { id: corteId } as Corte, variant: 'modal' });
  return null;
}

async function abrirCard(staleTime = 0) {
  const cliente = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime } } });
  ({ limpar } = montar(
    <QueryClientProvider client={cliente}>
      <Sonda />
    </QueryClientProvider>,
  ));
  await assentar();
}

/** A IA fica trabalhando até o teste mandar terminar, e aí grava o que gerou. */
function iaEmEspera(corteId: string, gerado: object) {
  return () =>
    new Promise((resolve) => {
      h.terminarIa = () => {
        h.servidor[corteId] = { ...h.servidor[corteId], ...gerado };
        resolve({});
      };
    });
}

async function clicarNaIa() {
  card.generateMetadataClaude.mutate('claude');
  await assentar();
}

async function iaTermina() {
  h.terminarIa?.();
  await assentar();
}

async function digitarTitulo(texto: string) {
  card.setTitle(texto);
  await assentar();
}

/** O blur do título, como o card faz: manda o que está no campo. */
async function sairDoTitulo() {
  card.save({ titulo_youtube: card.title });
  await assentar();
}

/** O que o botão Desfazer do card faz; o fio do botão está em `botoesDoDesfazer`. */
async function clicarEmDesfazer() {
  card.desfazerGeracao();
  card.setDesfazerIa(null);
  await assentar();
}

async function trocarDeCorte(id: string) {
  irParaCorte(id);
  await assentar();
}

const salvosEm = (corteId: string) =>
  h.salvos.filter((salvo) => salvo.corteId === corteId).map((salvo) => salvo.patch);

beforeEach(() => {
  h.servidor = { c1: { ...GRAVADO }, c2: { ...DO_OUTRO_CORTE } };
  h.salvos = [];
  h.terminarIa = null;
  h.prenderProximaLeitura = false;
  h.soltarLeitura = null;
  h.falharProximoSalvo = false;
  h.gerar.mockReset();
  h.regerar.mockReset();
  h.regerar.mockImplementation(iaEmEspera('c1', DA_IA));
});

afterEach(async () => {
  await limpar();
});

describe('S1: digitar depois do Regerar e clicar direto em Desfazer', () => {
  async function regerarEDigitar() {
    await abrirCard();
    await clicarNaIa();
    await iaTermina();
    expect(card).toMatchObject(TELA_DA_IA);
    await digitarTitulo('Y');
  }

  it('a releitura do blur cancelada pelo Desfazer: a tela fica com a versão, e o próximo blur não grava', async () => {
    await regerarEDigitar();
    h.prenderProximaLeitura = true;
    await sairDoTitulo();
    expect(h.soltarLeitura).not.toBeNull();

    await clicarEmDesfazer();

    expect(card).toMatchObject(TELA_GRAVADA);
    expect(h.servidor.c1).toMatchObject(GRAVADO);
    await sairDoTitulo();
    expect(salvosEm('c1')).toEqual([{ titulo_youtube: 'Y' }, GRAVADO]);
  });

  it('a leitura cancelada que responde tarde não traz o rascunho de volta', async () => {
    await regerarEDigitar();
    h.prenderProximaLeitura = true;
    await sairDoTitulo();
    await clicarEmDesfazer();

    h.soltarLeitura?.();
    await assentar();

    expect(card).toMatchObject(TELA_GRAVADA);
  });

  it('o salvar do blur falhou: o Desfazer leva a tela do mesmo jeito', async () => {
    await regerarEDigitar();
    h.falharProximoSalvo = true;
    await sairDoTitulo();
    expect(card.title).toBe('Y');

    await clicarEmDesfazer();

    expect(card).toMatchObject(TELA_GRAVADA);
    expect(h.servidor.c1).toMatchObject(GRAVADO);
    await sairDoTitulo();
    expect(salvosEm('c1')).toEqual([GRAVADO]);
  });

  it('com a releitura no meio, também termina na versão', async () => {
    await regerarEDigitar();
    await sairDoTitulo();
    expect(card.meta?.titulo_youtube).toBe('Y');

    await clicarEmDesfazer();

    expect(card).toMatchObject(TELA_GRAVADA);
    expect(h.servidor.c1).toMatchObject(GRAVADO);
  });

  it('o Desfazer não apaga a oferta de outro corte nem grava sem versão', async () => {
    await abrirCard();
    await trocarDeCorte('c2');
    await digitarTitulo('rascunho de c2');

    card.desfazerGeracao();
    await assentar();

    expect(card.title).toBe('rascunho de c2');
    expect(h.salvos).toEqual([]);
  });
});

describe('S2: ir e voltar de corte durante o Regerar', () => {
  it('termina de volta no corte: a IA entra e a versão anterior fica no Desfazer', async () => {
    await abrirCard();
    await clicarNaIa();
    await trocarDeCorte('c2');
    await trocarDeCorte('c1');

    await iaTermina();

    expect(card).toMatchObject(TELA_DA_IA);
    expect(card.desfazerIa).toEqual(GRAVADO);
  });

  it('o rascunho digitado na volta é substituído, e volta no Desfazer', async () => {
    await abrirCard();
    await clicarNaIa();
    await trocarDeCorte('c2');
    await trocarDeCorte('c1');
    await digitarTitulo('digitado na volta');

    await iaTermina();

    expect(card).toMatchObject(TELA_DA_IA);
    expect(card.desfazerIa).toEqual({ ...GRAVADO, titulo_youtube: 'digitado na volta' });

    await clicarEmDesfazer();

    expect(card.title).toBe('digitado na volta');
    expect(h.servidor.c1).toMatchObject({ titulo_youtube: 'digitado na volta' });
  });

  it('o salvo antes de sair do corte continua na versão', async () => {
    await abrirCard();
    await clicarNaIa();
    await digitarTitulo('salvo em c1');
    await sairDoTitulo();
    await trocarDeCorte('c2');
    await trocarDeCorte('c1');

    await iaTermina();

    expect(card.desfazerIa).toEqual({ ...GRAVADO, titulo_youtube: 'salvo em c1' });
  });

  it('termina no outro corte: a versão espera a volta, e o outro corte não a vê', async () => {
    await abrirCard();
    await clicarNaIa();
    await trocarDeCorte('c2');

    await iaTermina();

    expect(card.desfazerIa).toBeNull();
    expect(card.title).toBe('Título de c2');

    await trocarDeCorte('c1');

    expect(card).toMatchObject(TELA_DA_IA);
    expect(card.desfazerIa).toEqual(GRAVADO);

    await clicarEmDesfazer();

    expect(h.servidor.c1).toMatchObject(GRAVADO);
    expect(h.servidor.c2).toEqual(DO_OUTRO_CORTE);
    expect(card).toMatchObject(TELA_GRAVADA);
  });

  it('termina no outro corte: quem é relido é o corte da geração', async () => {
    await abrirCard(60_000);
    await clicarNaIa();
    await trocarDeCorte('c2');

    await iaTermina();
    await trocarDeCorte('c1');

    expect(card).toMatchObject(TELA_DA_IA);
  });

  it('o que se salva no outro corte durante a geração não entra na versão', async () => {
    await abrirCard();
    await clicarNaIa();
    await trocarDeCorte('c2');
    await digitarTitulo('texto de c2');
    await sairDoTitulo();
    await trocarDeCorte('c1');

    await iaTermina();

    expect(card.desfazerIa).toEqual(GRAVADO);
    await clicarEmDesfazer();
    expect(h.servidor.c1).toMatchObject(GRAVADO);
    expect(h.servidor.c2).toMatchObject({ titulo_youtube: 'texto de c2' });
  });

  it('a oferta não se apaga ao sair: volta quando o operador volta ao corte', async () => {
    await abrirCard();
    await clicarNaIa();
    await iaTermina();
    expect(card.desfazerIa).toEqual(GRAVADO);

    await trocarDeCorte('c2');
    expect(card.desfazerIa).toBeNull();

    await trocarDeCorte('c1');
    expect(card.desfazerIa).toEqual(GRAVADO);
  });

  it('dispensada com Manter, a oferta não volta', async () => {
    await abrirCard();
    await clicarNaIa();
    await iaTermina();
    card.setDesfazerIa(null);
    await assentar();

    await trocarDeCorte('c2');
    await trocarDeCorte('c1');

    expect(card.desfazerIa).toBeNull();
  });

  it('o Completar de um corte, terminando noutro, não apaga a oferta de lá', async () => {
    h.servidor.c1 = { ...GRAVADO, descricao_youtube: '' };
    h.regerar.mockImplementation(iaEmEspera('c2', DA_IA));
    h.gerar.mockImplementation(iaEmEspera('c1', DA_IA));
    await abrirCard();
    await trocarDeCorte('c2');
    await clicarNaIa();
    await iaTermina();
    expect(card.desfazerIa).toEqual(DO_OUTRO_CORTE);

    await trocarDeCorte('c1');
    await clicarNaIa();
    await trocarDeCorte('c2');
    await iaTermina();

    expect(card.desfazerIa).toEqual(DO_OUTRO_CORTE);
  });

  it('a geração que falha não oferece Desfazer na volta', async () => {
    h.regerar.mockImplementation(async () => {
      throw new Error('a IA caiu');
    });
    await abrirCard();
    await clicarNaIa();
    await trocarDeCorte('c2');
    await trocarDeCorte('c1');

    expect(card.desfazerIa).toBeNull();
    expect(card).toMatchObject(TELA_GRAVADA);
  });
});
