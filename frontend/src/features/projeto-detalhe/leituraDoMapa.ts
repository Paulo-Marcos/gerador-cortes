import type { CorteDoMapa, EstadoDoCorteNoMapa } from '@/components/ui/mapa-da-live';
import type { TomDoSelo } from '@/components/ui/selo';
import type { Corte, StatusExportCorte } from '@/types/models';
import { estadoDaLinha, type EstadoLinha } from './acoesDaLinha';

// D-1149 (E-069 H-16) · A regra da tela de cortes da live (DIRECAO §7.2): o que o mapa
// desenha, o que a leitura dele diz e qual selo cada linha leva. Pura: a tela só desenha.

export type LinhaDoCorte = { status: StatusExportCorte; corte: Corte | undefined };

/** O `id` da linha na página: é para onde o `<a>` do mapa aponta e quem o clique no mapa foca. */
export const idDaLinha = (corteId: string) => `corte-${corteId}`;

/**
 * O mapa fala em luz (§3.3): pronto e no ar acendem, riscado é contorno, o resto fica
 * apagado. Aprovado e proposto têm a mesma luz e palavras diferentes (D-1152).
 */
export function estadoNoMapa(estado: EstadoLinha): EstadoDoCorteNoMapa {
  if (estado === 'rejeitado') return 'riscado';
  if (estado === 'publicado') return 'pronto';
  return estado;
}

/** Os cortes do mapa, na ordem da lista. Linha sem o corte carregado não tem onde nascer. */
export function cortesDoMapa(linhas: LinhaDoCorte[]): CorteDoMapa[] {
  return linhas.flatMap(({ status, corte }) =>
    corte
      ? [
          {
            id: status.corte_id,
            numero: status.numero,
            nome: status.titulo || `Corte ${status.numero}`,
            inicioSeg: corte.inicio_seg,
            fimSeg: corte.fim_seg,
            estado: estadoNoMapa(estadoDaLinha(corte, status)),
            href: `#${idDaLinha(status.corte_id)}`,
          },
        ]
      : [],
  );
}

/**
 * Quanto da live virou corte, de 0 a 100. Dois cortes que se sobrepõem contam o trecho
 * uma vez só (a união dos intervalos); o riscado não conta. Sem duração, `null`: sem o
 * todo, a porcentagem não existe.
 */
export function percentualCortado(cortes: CorteDoMapa[], duracaoSeg: number): number | null {
  if (!Number.isFinite(duracaoSeg) || duracaoSeg <= 0) return null;
  const trechos = cortes
    .filter((c) => c.estado !== 'riscado')
    .map((c) => [Math.max(0, c.inicioSeg), Math.min(duracaoSeg, c.fimSeg)] as const)
    .filter(([ini, fim]) => fim > ini)
    .sort((a, b) => a[0] - b[0]);
  let total = 0;
  let ate = -Infinity;
  for (const [ini, fim] of trechos) {
    if (fim <= ate) continue;
    total += fim - Math.max(ini, ate);
    ate = fim;
  }
  return Math.round((total / duracaoSeg) * 100);
}

/** A frase dos cortes: "6 cortes · todos prontos", "6 cortes · 2 prontos". */
export function fraseDosCortes(total: number, prontos: number): string {
  const cortes = total === 1 ? '1 corte' : `${total} cortes`;
  if (total === 0) return 'Nenhum corte ainda';
  if (prontos === 0) return `${cortes} · nenhum pronto`;
  if (prontos === total) return `${cortes} · ${total === 1 ? 'pronto' : 'todos prontos'}`;
  return `${cortes} · ${prontos} ${prontos === 1 ? 'pronto' : 'prontos'}`;
}

/** A frase do fire, ou nada quando não há (não se mostra "0 fire"). */
export function fraseDoFire(fires: number): string | null {
  return fires > 0 ? `${fires} fire · ${fires === 1 ? 'vira short' : 'viram shorts'}` : null;
}

/**
 * O selo de cada linha (DIRECAO §5): um por item, com o tom que diz de quem é a vez. O
 * texto é a palavra da tela, com maiúscula, nunca a chave do banco.
 */
export const SELO_DO_CORTE: Record<EstadoLinha, { tom: TomDoSelo; texto: string }> = {
  proposto: { tom: 'neutro', texto: 'Proposto' },
  aprovado: { tom: 'neutro', texto: 'Aprovado' },
  pronto: { tom: 'convite', texto: 'Pronto' },
  publicado: { tom: 'ok', texto: 'No ar' },
  rejeitado: { tom: 'inerte', texto: 'Riscado' },
};

/**
 * O título da live em duas metades (§7.2: "metade em 300, metade em 800"): as palavras se
 * dividem ao meio, e a segunda metade leva o peso. Uma palavra só vai inteira na segunda.
 */
export function metadesDoTitulo(titulo: string): [leve: string, forte: string] {
  const palavras = titulo.trim().split(/\s+/).filter(Boolean);
  const corte = Math.floor(palavras.length / 2);
  return [palavras.slice(0, corte).join(' '), palavras.slice(corte).join(' ')];
}

/** O corte aberto só vale se estiver na lista: um `?corte=` de outra live não acende nada. */
export function abertoNaLista(abertoId: string | null, linhas: LinhaDoCorte[]): string | undefined {
  return abertoId && linhas.some((l) => l.status.corte_id === abertoId) ? abertoId : undefined;
}
