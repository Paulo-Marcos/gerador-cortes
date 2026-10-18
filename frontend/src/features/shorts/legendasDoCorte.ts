import type { QueryClient } from '@tanstack/react-query';
import type { OverflowMenuItem } from '@/components/ui/overflow-menu';

// D-972: as palavras da prévia do short ficam em cache para sempre — o bruto não
// muda enquanto o operador cura. Quem muda é a TRANSCRIÇÃO: refazê-la reescreve
// o banco, e sem descartar este cache a tela seguia mostrando a legenda antiga
// (no caso medido, em inglês) até recarregar a página.

const TRANSCRICOES_DOS_CORTES = ['shorts', 'transcricao'] as const;

export const transcricaoDoCorteKey = (corteId: string) =>
  [...TRANSCRICOES_DOS_CORTES, corteId] as const;

/** Refazer a transcrição da live mexe em todos os cortes: descarta todas. */
export function esquecerLegendasDosCortes(qc: QueryClient) {
  return qc.invalidateQueries({ queryKey: TRANSCRICOES_DOS_CORTES });
}

/** O botão do corte: busca de novo as palavras dele no banco. */
export function atualizarLegendasDoCorte(qc: QueryClient, corteId: string) {
  return qc.invalidateQueries({ queryKey: transcricaoDoCorteKey(corteId) });
}

export function itemAtualizarLegendas(
  onClick: () => void,
  atualizando: boolean,
): OverflowMenuItem & { onClick: () => void } {
  return {
    label: 'Atualizar legendas',
    icon: 'captions',
    title:
      'Relê a transcrição atual do corte na prévia. Short já renderizado precisa refazer a prévia para levar o texto novo.',
    disabled: atualizando,
    onClick,
  };
}
