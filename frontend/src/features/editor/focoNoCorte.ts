// D-1201 (DIRECAO §8.2, Foco): riscar ou trocar de corte recria a tela (D-1033), e o
// botão que tinha o foco some junto: o foco caía no <body>. Quem pede a troca deixa o
// recado aqui, e o cabeçalho do corte novo, já montado, leva o foco ao título dele. O
// recado não pode morar na tela que pediu: ela é desmontada antes de a nova existir.
// Sem recado (a primeira abertura, o link de outra tela) o foco fica onde está.

import type { Corte } from '@/types/models';
import { acharCorteVizinho } from './riscarCorte';

let corteQueEspera: string | null = null;

export function pedirFocoNoTitulo(corteId: string) {
  corteQueEspera = corteId;
}

/** O J/K: acha o vizinho do corte aberto, pede o foco nele e devolve o índice, ou -1. */
export function pedirFocoNoVizinho(cortes: readonly Corte[], corteId: string | undefined, direcao: -1 | 1): number {
  const destino = corteId ? acharCorteVizinho(cortes, corteId, direcao) : null;
  if (!destino) return -1;
  pedirFocoNoTitulo(destino.id);
  return cortes.indexOf(destino);
}

/** Vale uma vez só: o próximo cabeçalho a montar gasta o recado, seja ou não o dele. */
export function consumirPedidoDeFoco(corteId: string): boolean {
  const eDele = corteQueEspera === corteId;
  corteQueEspera = null;
  return eDele;
}
