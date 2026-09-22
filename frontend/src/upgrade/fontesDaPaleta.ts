import type { IconName } from './Icon';
import type { Lugar } from './historicoDaCasca';

// ─────────────────────────────────────────────────────────────────
// D-746 · RODADA 3 · o ⌘K passa a encontrar o trabalho inteiro.
//
// A queixa: "o cmd + K só funciona para live, não funciona para short.
// Tinha que ter uma forma de ter um histórico das últimas buscas."
//
// A paleta antiga juntava telas + uma ação + useProjetos(). Shorts, fires
// e cortes simplesmente não existiam no índice, então o caminho para um
// short era sempre pelo trilho — que é o passo que a pessoa repete
// dezenas de vezes por dia.
//
// Três mudanças:
//
//   1. QUATRO FONTES: lives, shorts, cortes, telas/ações. Cada item
//      carrega escopo e contexto ("corte #04 · live 267 · aprovado"),
//      porque uma lista misturada sem contexto é pior que uma lista curta.
//   2. ESCOPO, com Tab para girar e prefixos @ # > para quem já sabe.
//      Escopo não é filtro decorativo: com 4 fontes e nomes parecidos
//      ("O erro que quase toda igreja comete" é live E corte E short),
//      sem escopo o resultado certo fica em quarto lugar.
//   3. RECENTES na caixa vazia — últimas BUSCAS e últimos LUGARES. Abrir
//      a paleta e ver o vazio é a pior tela possível para quem vai e
//      volta entre os mesmos quatro lugares o dia inteiro.
// ─────────────────────────────────────────────────────────────────

export type EscopoDaPaleta = 'tudo' | 'lives' | 'shorts' | 'cortes' | 'telas' | 'acoes';

export const ESCOPOS: { id: EscopoDaPaleta; rotulo: string; prefixo?: string }[] = [
  { id: 'tudo', rotulo: 'Tudo' },
  { id: 'lives', rotulo: 'Lives' },
  { id: 'shorts', rotulo: 'Shorts', prefixo: '@' },
  { id: 'cortes', rotulo: 'Cortes', prefixo: '#' },
  { id: 'telas', rotulo: 'Telas' },
  { id: 'acoes', rotulo: 'Ações', prefixo: '>' },
];

export type ItemDaPaleta = {
  id: string;
  rotulo: string;
  /** Segunda linha: onde esse item vive. Sem isso a lista mente. */
  contexto?: string;
  icone: IconName;
  escopo: Exclude<EscopoDaPaleta, 'tudo'>;
  to?: string;
  aoEscolher?: () => void;
};

/** Sem acento e sem caixa: "sermao" tem de achar "sermão". */
export function normalizar(t: string): string {
  return t
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

/** Resolve o prefixo digitado. Retorna o escopo efetivo e o termo limpo. */
export function lerPrefixo(
  termo: string,
  escopoAtual: EscopoDaPaleta,
): { escopo: EscopoDaPaleta; termo: string } {
  const achado = ESCOPOS.find((e) => e.prefixo && termo.startsWith(e.prefixo));
  if (!achado?.prefixo) return { escopo: escopoAtual, termo };
  return { escopo: achado.id, termo: termo.slice(achado.prefixo.length) };
}

/** Pontuação vira espaço: "Corte #04 — título" tem de casar com "corte 04". */
function palavras(t: string): string {
  return normalizar(t)
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

export function filtrar(
  itens: ItemDaPaleta[],
  termo: string,
  escopo: EscopoDaPaleta,
): ItemDaPaleta[] {
  const q = palavras(termo);
  const noEscopo = escopo === 'tudo' ? itens : itens.filter((i) => i.escopo === escopo);
  if (!q) return [];
  // Cada palavra digitada precisa aparecer (em qualquer ordem): "corte 4"
  // acha "Corte #04", "sermao montanha" acha "O sermão da montanha".
  const pedacos = q.split(' ');
  return noEscopo
    .map((i) => {
      const rotulo = palavras(i.rotulo);
      const tudo = rotulo + ' ' + palavras(i.contexto ?? '');
      if (!pedacos.every((p) => tudo.includes(p))) return { i, nota: -1 };
      // Casar no começo do rótulo vale mais que casar no contexto: quem
      // digita "corte 04" quer o corte 04, não a live que o contém.
      const nota = rotulo.startsWith(pedacos[0]) ? 0 : pedacos.every((p) => rotulo.includes(p)) ? 1 : 2;
      return { i, nota };
    })
    .filter((x) => x.nota >= 0)
    .sort((a, b) => a.nota - b.nota)
    .map((x) => x.i);
}

// ── histórico de buscas ──────────────────────────────────────────
// MRU curto e deduplicado. Dez entradas seria uma lista de leitura, não
// um atalho: cinco é o que se varre sem ler.

const CHAVE_BUSCAS = 'upgrade-buscas';
const MAX_BUSCAS = 5;

export function lerBuscas(): string[] {
  try {
    const cru = window.localStorage.getItem(CHAVE_BUSCAS);
    const j = cru ? (JSON.parse(cru) as unknown) : null;
    return Array.isArray(j) ? j.filter((x): x is string => typeof x === 'string').slice(0, MAX_BUSCAS) : [];
  } catch {
    return [];
  }
}

export function gravarBusca(termo: string) {
  const limpo = termo.trim();
  // Uma letra não é uma busca: gravar "s" enche o histórico de ruído.
  if (limpo.length < 2) return;
  try {
    const anterior = lerBuscas().filter((b) => normalizar(b) !== normalizar(limpo));
    window.localStorage.setItem(CHAVE_BUSCAS, JSON.stringify([limpo, ...anterior].slice(0, MAX_BUSCAS)));
  } catch {
    // histórico de busca é conveniência; falhar aqui não interrompe nada
  }
}

export type GrupoDaPaleta = { titulo: string; icone: IconName; itens: ItemDaPaleta[] };

/** O que a paleta mostra com a caixa vazia. */
export function estadoVazio(buscas: string[], lugares: Lugar[]): GrupoDaPaleta[] {
  const grupos: GrupoDaPaleta[] = [
    {
      titulo: 'Últimas buscas',
      icone: 'history' as IconName,
      itens: buscas.map((b, i) => ({
        id: 'busca-' + i,
        rotulo: b,
        icone: 'search' as IconName,
        escopo: 'acoes' as const,
      })),
    },
    {
      titulo: 'Onde eu estava',
      icone: 'rotate-ccw' as IconName,
      itens: lugares.map((l, i) => ({
        id: 'lugar-' + i,
        rotulo: l.rotulo,
        contexto: l.tipo,
        icone: l.icone,
        escopo: 'telas' as const,
        to: l.to,
      })),
    },
  ];
  return grupos.filter((g) => g.itens.length > 0);
}
