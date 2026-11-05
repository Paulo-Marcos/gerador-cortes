import { useEffect, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, vi } from 'vitest';
import { assentar, montar } from '../../editor/__tests__/domMinimo';
import type { Corte } from '@/types/models';
import type { useMetadataCard } from '../useMetadataCard';

// D-1064: o que os dois testes do Desfazer têm em comum. O hook de verdade, com o servidor em
// memória, e uma tela que recria o card a cada corte como a rota faz (`UmaTelaPorCorte`, D-1033).
// Os mocks ficam em cada teste, que os pega daqui: `vi.mock` só vale no arquivo onde é escrito.

type Card = ReturnType<typeof useMetadataCard>;

export const h = {
  servidor: {} as Record<string, Record<string, unknown>>,
  salvos: [] as { corteId: string; patch: object }[],
  terminarIa: null as (() => void) | null,
  prenderProximaLeitura: false,
  soltarLeitura: null as (() => void) | null,
  falharProximoSalvo: false,
  gerar: vi.fn(),
  regerar: vi.fn(),
};

export const geracaoFalsa = {
  geracaoIaApi: { gerarMetadadosClaude: h.gerar, regerarMetadadosClaude: h.regerar },
  useUltimaGeracao: () => ({ data: null }),
};

export const metadadosApiFalsa = {
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
};

let usarCard: typeof useMetadataCard;

export const GRAVADO = {
  titulo_youtube: 'Título gravado',
  texto_capa: 'CAPA GRAVADA',
  descricao_youtube: 'Descrição gravada',
  tags_youtube: ['gravada'],
};
export const DA_IA = {
  titulo_youtube: 'Título da IA',
  texto_capa: 'CAPA DA IA',
  descricao_youtube: 'Descrição da IA',
  tags_youtube: ['ia'],
};
export const DO_OUTRO_CORTE = {
  titulo_youtube: 'Título de c2',
  texto_capa: 'CAPA DE C2',
  descricao_youtube: 'Descrição de c2',
  tags_youtube: ['c2'],
};
export const TELA_GRAVADA = {
  title: 'Título gravado',
  coverText: 'CAPA GRAVADA',
  description: 'Descrição gravada',
  tagsText: 'gravada',
};
export const TELA_DA_IA = {
  title: 'Título da IA',
  coverText: 'CAPA DA IA',
  description: 'Descrição da IA',
  tagsText: 'ia',
};

export let card: Card;
let irParaCorte: (id: string) => void;
let mostrarModal: (aberto: boolean) => void;
let limpar: () => Promise<void>;

function Sonda({ corteId }: { corteId: string }) {
  const desenhado = usarCard({ projetoId: 'p1', cut: { id: corteId } as Corte, variant: 'modal' });
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

export async function abrirCard(staleTime = 0, recriar = true) {
  const cliente = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime } } });
  ({ limpar } = montar(
    <QueryClientProvider client={cliente}>
      <Tela recriar={recriar} />
    </QueryClientProvider>,
  ));
  await assentar();
}

/** A IA fica trabalhando até o teste mandar terminar, e aí grava o que gerou. */
export function iaEmEspera(corteId: string, gerado: object) {
  return () =>
    new Promise((resolve) => {
      h.terminarIa = () => {
        h.servidor[corteId] = { ...h.servidor[corteId], ...gerado };
        resolve({});
      };
    });
}

export async function clicarNaIa() {
  card.generateMetadataClaude.mutate('claude');
  await assentar();
}

export async function iaTermina() {
  h.terminarIa?.();
  await assentar();
}

export async function digitarTitulo(texto: string) {
  card.setTitle(texto);
  await assentar();
}

/** O blur do título, como o card faz: manda o que está no campo. */
export async function sairDoTitulo() {
  card.save({ titulo_youtube: card.title });
  await assentar();
}

/** O que o botão Desfazer do card faz; o fio do botão está em `botoesDoDesfazer`. */
export async function clicarEmDesfazer() {
  card.desfazerGeracao();
  card.dispensarDesfazer();
  await assentar();
}

export async function clicarEmManter() {
  card.dispensarDesfazer();
  await assentar();
}

export async function fecharModal() {
  mostrarModal(false);
  await assentar();
}

export async function abrirModal() {
  mostrarModal(true);
  await assentar();
}

export async function trocarDeCorte(id: string) {
  irParaCorte(id);
  await assentar();
}

export const salvosEm = (corteId: string) =>
  h.salvos.filter((salvo) => salvo.corteId === corteId).map((salvo) => salvo.patch);

/** Liga o hook já com os mocks do teste, e zera o servidor antes de cada caso. */
export function prepararCadaTeste(hook: typeof useMetadataCard) {
  usarCard = hook;
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
}
