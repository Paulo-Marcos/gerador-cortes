import { useEffect, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { assentar, montar } from '../../editor/__tests__/domMinimo';
import type { Corte } from '@/types/models';

// D-1064: duas perdas do Desfazer. Na S1, o blur e o clique saem juntos, e o texto do blur
// ficava na tela por cima do que o Desfazer gravou. Na S2, quem sai da tela durante o Regerar
// perdia a versão anterior: trocar de corte recria o card (`UmaTelaPorCorte`, D-1033) e fechar
// o modal o desmonta, enquanto a geração segue. Roda o hook de verdade, com o servidor em memória.

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
let mostrarModal: (aberto: boolean) => void;
let limpar: () => Promise<void>;

function Sonda({ corteId }: { corteId: string }) {
  const desenhado = useMetadataCard({ projetoId: 'p1', cut: { id: corteId } as Corte, variant: 'modal' });
  // Depois do commit: é o que chegou à tela, não um desenho que o React descartou.
  useEffect(() => {
    card = desenhado;
  });
  return null;
}

/** Como a rota e o modal: a `key` recria o card a cada corte, e fechar o desmonta. */
function Tela({ recriar }: { recriar: boolean }) {
  const [corteId, setCorteId] = useState('c1');
  const [aberto, setAberto] = useState(true);
  irParaCorte = setCorteId;
  mostrarModal = setAberto;
  return aberto ? <Sonda key={recriar ? corteId : 'o mesmo card'} corteId={corteId} /> : null;
}

async function abrirCard(staleTime = 0, recriar = true) {
  const cliente = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime } } });
  ({ limpar } = montar(
    <QueryClientProvider client={cliente}>
      <Tela recriar={recriar} />
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
  card.dispensarDesfazer();
  await assentar();
}

async function clicarEmManter() {
  card.dispensarDesfazer();
  await assentar();
}

async function fecharModal() {
  mostrarModal(false);
  await assentar();
}

async function abrirModal() {
  mostrarModal(true);
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

describe('S2: trocar de corte durante o Regerar', () => {
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

  it('o salvo antes de sair continua na versão', async () => {
    await abrirCard();
    await clicarNaIa();
    await digitarTitulo('salvo em c1');
    await sairDoTitulo();
    await trocarDeCorte('c2');
    await trocarDeCorte('c1');

    await iaTermina();

    expect(card.desfazerIa).toEqual({ ...GRAVADO, titulo_youtube: 'salvo em c1' });
  });

  it('o salvo depois de voltar também entra na versão', async () => {
    await abrirCard();
    await clicarNaIa();
    await trocarDeCorte('c2');
    await trocarDeCorte('c1');
    await digitarTitulo('salvo na volta');
    await sairDoTitulo();

    await iaTermina();

    expect(card.desfazerIa).toEqual({ ...GRAVADO, titulo_youtube: 'salvo na volta' });
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

  it('termina no outro corte: o rascunho de lá fica, e o Desfazer não grava nele', async () => {
    await abrirCard();
    await clicarNaIa();
    await trocarDeCorte('c2');
    await digitarTitulo('rascunho de c2');

    await iaTermina();

    expect(card.title).toBe('rascunho de c2');
    card.desfazerGeracao();
    await assentar();
    expect(salvosEm('c2')).toEqual([]);
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

  it('a geração que falha longe do corte não oferece Desfazer na volta', async () => {
    let cair: (erro: Error) => void = () => undefined;
    h.regerar.mockImplementation(
      () =>
        new Promise((_, rejeitar) => {
          cair = rejeitar;
        }),
    );
    await abrirCard();
    await clicarNaIa();
    await trocarDeCorte('c2');

    cair(new Error('a IA caiu'));
    await assentar();
    await trocarDeCorte('c1');

    expect(card.desfazerIa).toBeNull();
    expect(card).toMatchObject(TELA_GRAVADA);
  });
});

describe('o mesmo card trocando de corte, sem a tela recriar', () => {
  it('a geração termina na gaveta do corte que a pediu, e é ele quem é relido', async () => {
    await abrirCard(60_000, false);
    await clicarNaIa();
    await trocarDeCorte('c2');
    await digitarTitulo('rascunho de c2');

    await iaTermina();

    expect(card.title).toBe('rascunho de c2');
    expect(card.desfazerIa).toBeNull();

    await trocarDeCorte('c1');

    expect(card).toMatchObject(TELA_DA_IA);
    expect(card.desfazerIa).toEqual(GRAVADO);
  });
});

describe('S2: fechar o modal durante o Regerar', () => {
  it('a IA termina com o modal fechado: ao reabrir, o Desfazer está lá', async () => {
    await abrirCard();
    await clicarNaIa();
    await fecharModal();

    await iaTermina();
    await abrirModal();

    expect(card).toMatchObject(TELA_DA_IA);
    expect(card.desfazerIa).toEqual(GRAVADO);

    await clicarEmDesfazer();

    expect(h.servidor.c1).toMatchObject(GRAVADO);
    expect(card).toMatchObject(TELA_GRAVADA);
  });

  it('reabre antes de terminar: o rascunho é substituído, e o Desfazer chega sozinho', async () => {
    await abrirCard();
    await clicarNaIa();
    await fecharModal();
    await abrirModal();
    await digitarTitulo('digitado ao reabrir');

    await iaTermina();

    expect(card).toMatchObject(TELA_DA_IA);
    expect(card.desfazerIa).toEqual({ ...GRAVADO, titulo_youtube: 'digitado ao reabrir' });
  });

  it('o card que nasceu antes da oferta também a dispensa com Manter', async () => {
    await abrirCard();
    await clicarNaIa();
    await fecharModal();
    await abrirModal();
    await iaTermina();
    expect(card.desfazerIa).toEqual(GRAVADO);

    await clicarEmManter();

    expect(card.desfazerIa).toBeNull();
  });

  it('a oferta ainda sem resposta continua ao fechar e reabrir', async () => {
    await abrirCard();
    await clicarNaIa();
    await iaTermina();

    await fecharModal();
    await abrirModal();

    expect(card.desfazerIa).toEqual(GRAVADO);
  });
});

describe('quando a versão sai', () => {
  async function regerarAte(gerado: object) {
    h.regerar.mockImplementation(iaEmEspera('c1', gerado));
    await clicarNaIa();
    await iaTermina();
  }

  it('Desfazer: sai, e não volta ao reabrir nem ao trocar de corte', async () => {
    await abrirCard();
    await regerarAte(DA_IA);

    await clicarEmDesfazer();
    expect(card.desfazerIa).toBeNull();

    await fecharModal();
    await abrirModal();
    expect(card.desfazerIa).toBeNull();

    await trocarDeCorte('c2');
    await trocarDeCorte('c1');
    expect(card.desfazerIa).toBeNull();
  });

  it('Manter: sai, fica o texto da IA, e não volta ao reabrir nem ao trocar de corte', async () => {
    await abrirCard();
    await regerarAte(DA_IA);

    await clicarEmManter();
    expect(card.desfazerIa).toBeNull();
    expect(card).toMatchObject(TELA_DA_IA);
    expect(h.salvos).toEqual([]);

    await fecharModal();
    await abrirModal();
    expect(card.desfazerIa).toBeNull();

    await trocarDeCorte('c2');
    await trocarDeCorte('c1');
    expect(card.desfazerIa).toBeNull();
  });

  it('segundo Regerar: a versão nova é o texto que ele reescreveu, um nível só', async () => {
    const SEGUNDA = { ...DA_IA, titulo_youtube: 'Segunda da IA' };
    await abrirCard();
    await regerarAte(DA_IA);

    await regerarAte(SEGUNDA);

    expect(card.title).toBe('Segunda da IA');
    expect(card.desfazerIa).toEqual(DA_IA);
  });

  it('segundo Regerar que falha: a oferta anterior continua valendo', async () => {
    await abrirCard();
    await regerarAte(DA_IA);

    h.regerar.mockImplementation(async () => {
      throw new Error('a IA caiu');
    });
    await clicarNaIa();

    expect(card.desfazerIa).toEqual(GRAVADO);
    expect(card).toMatchObject(TELA_DA_IA);
  });

  it('Desfazer durante o segundo Regerar: o que ele gravou é o que a IA reescreve, e volta', async () => {
    const SEGUNDA = { ...DA_IA, titulo_youtube: 'Segunda da IA' };
    await abrirCard();
    await regerarAte(DA_IA);
    h.regerar.mockImplementation(iaEmEspera('c1', SEGUNDA));
    await clicarNaIa();

    await clicarEmDesfazer();
    await iaTermina();

    expect(card.title).toBe('Segunda da IA');
    expect(card.desfazerIa).toEqual(GRAVADO);
  });

  it('Regerar num corte não mexe na oferta do outro', async () => {
    await abrirCard();
    await regerarAte(DA_IA);

    await trocarDeCorte('c2');
    h.regerar.mockImplementation(iaEmEspera('c2', DA_IA));
    await clicarNaIa();
    await iaTermina();
    expect(card.desfazerIa).toEqual(DO_OUTRO_CORTE);

    await trocarDeCorte('c1');
    expect(card.desfazerIa).toEqual(GRAVADO);
  });
});
