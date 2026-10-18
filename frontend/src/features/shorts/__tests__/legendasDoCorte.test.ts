import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import { aoRefazerTranscricao } from '@/features/projeto-detalhe/useProjetoDetalhe';
import {
  atualizarLegendasDoCorte,
  itemAtualizarLegendas,
  transcricaoDoCorteKey,
} from '../legendasDoCorte';

// D-972: a prévia do short guardava as palavras para sempre (staleTime
// Infinity). Refazer a transcrição corrigia o banco, mas a tela seguia
// mostrando a legenda antiga — em inglês — até alguém recarregar a página.

function comLegendas(...cortes: string[]) {
  const qc = new QueryClient();
  for (const id of cortes) {
    qc.setQueryData(transcricaoDoCorteKey(id), { fonte: 'auto_legenda', palavras: [] });
  }
  return qc;
}

const invalidada = (qc: QueryClient, corteId: string) =>
  qc.getQueryState(transcricaoDoCorteKey(corteId))?.isInvalidated;

describe('legendas do short seguem a transcrição', () => {
  it('refazer a transcrição da live descarta as legendas guardadas dos cortes', async () => {
    const qc = comLegendas('c1', 'c2');
    await aoRefazerTranscricao(qc, 'p1');
    expect(invalidada(qc, 'c1')).toBe(true);
    expect(invalidada(qc, 'c2')).toBe(true);
  });

  it('o botão do corte busca de novo só a legenda dele', async () => {
    const qc = comLegendas('c1', 'c2');
    await atualizarLegendasDoCorte(qc, 'c1');
    expect(invalidada(qc, 'c1')).toBe(true);
    expect(invalidada(qc, 'c2')).toBe(false);
  });

  it('o item "Atualizar legendas" do menu dispara a atualização e trava enquanto roda', () => {
    const onClick = vi.fn();
    const item = itemAtualizarLegendas(onClick, false);
    expect(item.label).toBe('Atualizar legendas');
    expect(item.disabled).toBe(false);
    item.onClick();
    expect(onClick).toHaveBeenCalledOnce();
    expect(itemAtualizarLegendas(onClick, true).disabled).toBe(true);
  });
});
