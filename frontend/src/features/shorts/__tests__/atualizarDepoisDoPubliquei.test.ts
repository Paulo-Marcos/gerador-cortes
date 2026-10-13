// D-905 (auditoria): o "já publiquei" tem de refrescar tudo o que mostra onde
// o vídeo está — inclusive a lista de Fires, onde o chip da rede acende.
import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import { atualizarDepoisDoPubliquei, LOTE_KEY, publicacoesKey } from '../useLotePublicacao';
import { FIRES_KEY } from '../useFires';
import { PRONTOS_KEY } from '../useShortsProntos';

function chavesInvalidadas(corteId?: string): unknown[] {
  const cliente = new QueryClient();
  const espiao = vi.spyOn(cliente, 'invalidateQueries');
  atualizarDepoisDoPubliquei(cliente, corteId);
  return espiao.mock.calls.map(([filtro]) => filtro?.queryKey);
}

describe('atualizarDepoisDoPubliquei', () => {
  it('refresca a lista de Fires: o chip da rede acende sem esperar o cache vencer', () => {
    expect(chavesInvalidadas('c1')).toContainEqual(FIRES_KEY);
  });

  it('mantém o que já refrescava: lote, histórico do corte e central de prontos', () => {
    const chaves = chavesInvalidadas('c1');
    expect(chaves).toContainEqual(LOTE_KEY);
    expect(chaves).toContainEqual(publicacoesKey('c1'));
    expect(chaves).toContainEqual(PRONTOS_KEY);
  });

  it('sem corte, refresca o histórico de todos', () => {
    expect(chavesInvalidadas()).toContainEqual(['shorts', 'publicacoes']);
  });
});
