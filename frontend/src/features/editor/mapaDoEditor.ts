import type { CorteDoMapa, EstadoDoCorteNoMapa } from '@/components/ui/mapa-da-live';
import { estaAprovado } from '@/lib/statusDoCorte';
import type { Corte } from '@/types/models';
import { estaRiscado, separarRiscados } from './riscarCorte';

// D-1150 (E-069 H-17) · o mapa compacto no cabeçalho do editor (DIRECAO §7.3).
//
// É por ele que se troca de corte: a lista lateral "Cortes da live" saiu do editor.
// Regra pura: o componente só lê. O mapa fala em LUZ (§3.3): aprovado acende,
// proposto é vidro, riscado é contorno tracejado. O corte aberto vai no feixe.

/** A luz do corte no mapa. Aprovado (ou já processado) acende; riscado apaga. */
export function estadoNoMapa(corte: Pick<Corte, 'status'>): EstadoDoCorteNoMapa {
  if (estaRiscado(corte)) return 'riscado';
  return estaAprovado(corte.status) ? 'pronto' : 'proposto';
}

/** Os cortes da live como pílulas do mapa, cada uma com o caminho da mesma tela. */
export function cortesDoMapa(
  cortes: readonly Corte[],
  caminhoDoCorte: (corte: Corte) => string,
): CorteDoMapa[] {
  return cortes.map((c) => ({
    id: c.id,
    numero: c.numero,
    nome: c.titulo_proposto,
    inicioSeg: c.inicio_seg,
    fimSeg: c.fim_seg,
    estado: estadoNoMapa(c),
    href: caminhoDoCorte(c),
  }));
}

/**
 * O sobretítulo: "Corte 2 de 6 · Live". A conta é dos vivos, a mesma do J/K, que
 * pula os riscados (D-1092). Aberto num riscado, diz que ele está riscado.
 */
export function sobretituloDoCorte(cortes: readonly Corte[], corte: Corte, tituloLive: string): string {
  const { vivos } = separarRiscados(cortes);
  const posicao = vivos.findIndex((c) => c.id === corte.id);
  const onde =
    posicao >= 0 ? `Corte ${posicao + 1} de ${vivos.length}` : `Corte #${corte.numero}, riscado`;
  return tituloLive ? `${onde} · ${tituloLive}` : onde;
}
