import { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { assentar, montar } from '../../editor/__tests__/domMinimo';
import type { Corte } from '@/types/models';

// D-1054: o operador clica em "Completar metadados" e segue digitando sem sair do
// campo. A IA termina, o metadado novo chega, e a tela regravava os quatro campos com o
// que veio do servidor: o texto sumia, e o blur seguinte não tinha o que salvar. Aqui
// roda o hook de verdade (React, TanStack Query, mutações), com o servidor em memória.

type Gravado = { titulo_youtube: string; texto_capa: string; descricao_youtube: string; tags_youtube: string[] };

const h = vi.hoisted(() => ({
  servidor: {} as Record<string, unknown>,
  salvos: [] as unknown[],
  terminarIa: null as (() => void) | null,
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
    obterMetadado: async (corteId: string) => ({ ...(h.servidor[corteId] as object) }),
    atualizarMetadado: async (corteId: string, patch: object) => {
      h.salvos.push(patch);
      h.servidor[corteId] = { ...(h.servidor[corteId] as object), ...patch };
      return {};
    },
  },
}));

const { useMetadataCard } = await import('../useMetadataCard');
type Card = ReturnType<typeof useMetadataCard>;

const GRAVADO: Gravado = {
  titulo_youtube: 'Título gravado',
  texto_capa: 'CAPA GRAVADA',
  descricao_youtube: 'Descrição gravada',
  tags_youtube: ['gravada'],
};
const DA_IA: Gravado = {
  titulo_youtube: 'Título da IA',
  texto_capa: 'CAPA DA IA',
  descricao_youtube: 'Descrição da IA',
  tags_youtube: ['ia'],
};
const TELA_DA_IA = {
  title: 'Título da IA',
  coverText: 'CAPA DA IA',
  description: 'Descrição da IA',
  tagsText: 'ia',
};

const CAMPOS = [
  { nome: 'título', tela: 'title', trocar: 'setTitle', texto: 'digitado', patch: { titulo_youtube: 'digitado' } },
  { nome: 'texto da capa', tela: 'coverText', trocar: 'setCoverText', texto: 'digitado', patch: { texto_capa: 'digitado' } },
  { nome: 'descrição', tela: 'description', trocar: 'setDescription', texto: 'digitado', patch: { descricao_youtube: 'digitado' } },
  { nome: 'tags', tela: 'tagsText', trocar: 'setTagsText', texto: 'dig, itado', patch: { tags_youtube: ['dig', 'itado'] as string[] } },
] as const;
const [TITULO, CAPA, DESCRICAO, TAGS] = CAMPOS;

let card: Card;
let irParaCorte: (id: string) => void;
let limpar: () => Promise<void>;

function Sonda() {
  const [corteId, setCorteId] = useState('c1');
  irParaCorte = setCorteId;
  card = useMetadataCard({ projetoId: 'p1', cut: { id: corteId } as Corte, variant: 'modal' });
  return null;
}

async function abrirCard() {
  const cliente = new QueryClient({ defaultOptions: { queries: { retry: false } } });
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
        h.servidor[corteId] = { ...(h.servidor[corteId] as object), ...gerado };
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

async function digitar(campo: (typeof CAMPOS)[number], texto: string = campo.texto) {
  card[campo.trocar](texto);
  await assentar();
}

beforeEach(() => {
  h.servidor = {};
  h.salvos = [];
  h.terminarIa = null;
  h.gerar.mockReset();
  h.regerar.mockReset();
});

afterEach(async () => {
  await limpar();
});

describe('o metadado novo chega com texto não salvo na tela', () => {
  beforeEach(() => {
    // Sem descrição: o botão é "Completar", que não substitui o que está gravado.
    h.servidor.c1 = { ...GRAVADO, descricao_youtube: '' };
    h.gerar.mockImplementation(iaEmEspera('c1', DA_IA));
  });

  it.each(CAMPOS)('$nome: fica o que foi digitado, e os outros recebem o que chegou', async (campo) => {
    await abrirCard();
    await clicarNaIa();
    await digitar(campo);

    await iaTermina();

    expect(card[campo.tela]).toBe(campo.texto);
    for (const outro of CAMPOS.filter((c) => c !== campo)) {
      expect(card[outro.tela]).toBe(TELA_DA_IA[outro.tela]);
    }
  });

  it.each(CAMPOS)('$nome: o blur seguinte ainda tem o que salvar', async (campo) => {
    await abrirCard();
    await clicarNaIa();
    await digitar(campo);
    await iaTermina();

    // O blur manda o texto que está no campo: se ele sumiu, não há o que salvar.
    const naTela = card[campo.tela];
    card.save(campo.tela === 'tagsText' ? { tags_youtube: naTela.split(', ') } : { [Object.keys(campo.patch)[0]]: naTela });
    await assentar();

    expect(h.salvos).toEqual([campo.patch]);
    expect(card[campo.tela]).toBe(campo.texto);
  });

  it('sem nada digitado, todos os campos recebem o que chegou', async () => {
    await abrirCard();
    await clicarNaIa();

    await iaTermina();

    expect(card).toMatchObject(TELA_DA_IA);
  });

  it('digitar e voltar ao texto original não conta como edição', async () => {
    await abrirCard();
    await clicarNaIa();
    await digitar(TITULO);
    await digitar(TITULO, GRAVADO.titulo_youtube);

    await iaTermina();

    expect(card.title).toBe('Título da IA');
  });

  it('apagar o campo inteiro é edição: o texto não volta sozinho', async () => {
    await abrirCard();
    await clicarNaIa();
    await digitar(CAPA, '');

    await iaTermina();

    expect(card.coverText).toBe('');
  });

  it('Completar não oferece Desfazer', async () => {
    await abrirCard();
    await clicarNaIa();
    await digitar(TITULO);

    await iaTermina();

    expect(card.desfazerIa).toBeNull();
  });
});

describe('o metadado novo chega por outro motivo', () => {
  beforeEach(() => {
    h.servidor.c1 = GRAVADO;
  });

  it('salvar um campo não apaga o que já se digita no próximo', async () => {
    await abrirCard();
    await digitar(TITULO);
    card.save(TITULO.patch);
    await digitar(DESCRICAO);

    await assentar();

    expect(card.title).toBe('digitado');
    expect(card.description).toBe('digitado');
  });

  it('a capa nova não apaga o que está sendo digitado', async () => {
    await abrirCard();
    await digitar(DESCRICAO);

    h.servidor.c1 = { ...GRAVADO, thumbnail_path: 'capa.jpg' };
    card.invalidate();
    await assentar();

    expect(card.description).toBe('digitado');
    expect(card.meta?.thumbnail_path).toBe('capa.jpg');
  });

  it('depois de salvar, a tela volta à forma gravada e o blur não salva de novo', async () => {
    const patch = { tags_youtube: ['um', 'dois'], descricao_youtube: 'com # duas' };
    await abrirCard();
    await digitar(TAGS, 'um,dois, ');
    await digitar(DESCRICAO, 'com ## duas');

    card.save(patch);
    await assentar();

    expect(card.tagsText).toBe('um, dois');
    expect(card.description).toBe('com # duas');
    card.save(patch);
    await assentar();
    expect(h.salvos).toHaveLength(1);
  });
});

describe('a troca de corte', () => {
  beforeEach(() => {
    h.servidor.c1 = GRAVADO;
    h.servidor.c2 = DA_IA;
  });

  it.each(CAMPOS)('$nome: o rascunho de um corte não aparece no outro', async (campo) => {
    await abrirCard();
    await digitar(campo);

    irParaCorte('c2');
    await assentar();

    expect(card).toMatchObject(TELA_DA_IA);
  });

  it('nem no corte já lido, que chega do cache', async () => {
    await abrirCard();
    irParaCorte('c2');
    await assentar();
    irParaCorte('c1');
    await assentar();
    await digitar(TITULO);

    irParaCorte('c2');
    await assentar();

    expect(card.title).toBe('Título da IA');
  });

  it('o Desfazer de um corte não vai para o outro', async () => {
    h.regerar.mockImplementation(iaEmEspera('c1', { titulo_youtube: 'Outro' }));
    await abrirCard();
    await clicarNaIa();
    await iaTermina();
    expect(card.desfazerIa).toEqual(GRAVADO);

    irParaCorte('c2');
    await assentar();

    expect(card.desfazerIa).toBeNull();
  });

  it('a geração do corte anterior, ao terminar, não mexe no rascunho do corte novo', async () => {
    h.regerar.mockImplementation(iaEmEspera('c1', { titulo_youtube: 'Outro' }));
    await abrirCard();
    await clicarNaIa();
    irParaCorte('c2');
    await assentar();
    await digitar(TITULO);

    await iaTermina();

    expect(card.title).toBe('digitado');
    expect(card.desfazerIa).toBeNull();
  });
});

describe('o Regerar substitui de propósito', () => {
  beforeEach(() => {
    h.servidor.c1 = GRAVADO;
    h.regerar.mockImplementation(iaEmEspera('c1', DA_IA));
  });

  it.each(CAMPOS)('$nome: o digitado dá lugar à IA, e o Desfazer o traz de volta', async (campo) => {
    await abrirCard();
    await clicarNaIa();
    await digitar(campo);

    await iaTermina();

    expect(card).toMatchObject(TELA_DA_IA);
    expect(card.desfazerIa).toEqual({ ...GRAVADO, ...campo.patch });

    card.saveMutation.mutate(card.desfazerIa!);
    await assentar();

    expect(card[campo.tela]).toBe(campo.texto);
    expect(h.servidor.c1).toMatchObject(campo.patch);
  });

  it('sem nada digitado, o Desfazer volta a versão gravada', async () => {
    await abrirCard();
    await clicarNaIa();

    await iaTermina();

    expect(card).toMatchObject(TELA_DA_IA);
    expect(card.desfazerIa).toEqual(GRAVADO);
  });

  it('digitar e clicar direto: o texto que o blur salvou entra no Desfazer', async () => {
    await abrirCard();
    await digitar(TITULO);

    // O blur vem antes do clique: o metadado da tela ainda é o de antes de salvar.
    card.save(TITULO.patch);
    await clicarNaIa();
    await iaTermina();

    expect(card.title).toBe('Título da IA');
    expect(card.desfazerIa).toEqual({ ...GRAVADO, ...TITULO.patch });
  });

  it('o que se salvou durante a geração também entra no Desfazer', async () => {
    await abrirCard();
    await clicarNaIa();
    await digitar(CAPA);
    card.save(CAPA.patch);
    await assentar();

    await iaTermina();

    expect(card.coverText).toBe('CAPA DA IA');
    expect(card.desfazerIa).toEqual({ ...GRAVADO, ...CAPA.patch });
  });
});
