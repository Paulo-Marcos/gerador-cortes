// D-581: a gravação da curadoria, com histórico e com selo de estado.
//
// Este hook é o ÚNICO caminho de escrita da tela de edição a partir desta
// demanda. Não é zelo de arquitetura: é o que torna o Ctrl+Z confiável. Uma
// segunda rota de gravação seria uma mudança que o histórico não viu — e um
// desfazer que pula um passo é pior que não ter desfazer, porque o operador
// aperta duas vezes achando que voltou dois.
//
// O que ele acrescenta ao `useAtualizarShort` cru:
//
//   1. captura o "antes" no instante certo (antes da mutation sair);
//   2. empilha o par para o Ctrl+Z / Ctrl+Y;
//   3. expõe o estado da gravação para o selo — porque com auto-save o
//      operador precisa de PROVA de que gravou, e um silêncio total é
//      indistinguível de um botão que não fez nada.
import { useCallback, useEffect, useRef, useState } from 'react';
import type { AtualizarShortBody, ShortSugerido } from './shortsApi';
import { useAtualizarShort } from './useShortsDoCorte';
import {
  desfazer as desfazerPasso,
  ehReversivel,
  empilhar,
  HISTORICO_VAZIO,
  refazer as refazerPasso,
  rotuloDaMudanca,
  valoresAnteriores,
  type HistoricoDeEdicao,
  type MudancaDoShort,
} from './historicoDeEdicao';

/** O que o selo de salvamento mostra. */
export type EstadoDaGravacao = 'parado' | 'gravando' | 'gravado' | 'falhou';

export interface EdicaoDoShort {
  /** Grava e registra no histórico. O caminho único de escrita da tela. */
  gravar: (shortId: string, mudanca: MudancaDoShort) => void;
  desfazer: () => void;
  refazer: () => void;
  podeDesfazer: boolean;
  podeRefazer: boolean;
  /** O que o próximo Ctrl+Z devolve, em palavras — vira o `title` do botão. */
  proximoDesfazer: string;
  estado: EstadoDaGravacao;
  /** Verdadeiro enquanto um PATCH corre — as ações da tela se desabilitam. */
  ocupado: boolean;
  erro: string;
}

/** Quanto tempo o selo fica em "salvo" antes de descansar. */
const SEGUNDOS_DO_SELO = 2500;

export function useEdicaoDoShort(corteId: string, shorts: ShortSugerido[]): EdicaoDoShort {
  const atualizar = useAtualizarShort(corteId);
  const [historico, setHistorico] = useState<HistoricoDeEdicao>(HISTORICO_VAZIO);
  const [estado, setEstado] = useState<EstadoDaGravacao>('parado');

  // A lista em ref para o `gravar` não mudar de identidade a cada refetch: ele
  // entra em `useCallback` de outros componentes e em bindings de atalho
  // memoizados, e uma identidade nova a cada 2s os recriaria sem parar.
  const listaRef = useRef(shorts);
  listaRef.current = shorts;

  // Trocar de corte zera o histórico. Sem isto um Ctrl+Z depois de navegar
  // mandaria um PATCH para um short de OUTRO corte — que existe, aceita, e
  // desfaz algo que não está na tela.
  useEffect(() => setHistorico(HISTORICO_VAZIO), [corteId]);

  useEffect(() => {
    if (estado !== 'gravado') return;
    const timer = setTimeout(() => setEstado('parado'), SEGUNDOS_DO_SELO);
    return () => clearTimeout(timer);
  }, [estado]);

  const enviar = useCallback(
    (shortId: string, mudanca: MudancaDoShort) => {
      setEstado('gravando');
      atualizar.mutate(
        { shortId, ...mudanca } as { shortId: string } & AtualizarShortBody,
        {
          onSuccess: () => setEstado('gravado'),
          onError: () => setEstado('falhou'),
        },
      );
    },
    [atualizar],
  );

  const gravar = useCallback(
    (shortId: string, mudanca: MudancaDoShort) => {
      const short = listaRef.current.find((s) => s.id === shortId);
      const passo = {
        shortId,
        rotulo: rotuloDaMudanca(mudanca),
        antes: valoresAnteriores(short as unknown as Record<string, unknown>, mudanca),
        depois: mudanca,
      };
      // Mudança irreversível grava igual, mas NÃO entra na pilha: um passo que
      // o desfazer não sabe reverter viraria um Ctrl+Z que consome o clique e
      // não muda nada na tela.
      if (ehReversivel(passo)) setHistorico((atual) => empilhar(atual, passo));
      enviar(shortId, mudanca);
    },
    [enviar],
  );

  const desfazer = useCallback(() => {
    setHistorico((atual) => {
      const saida = desfazerPasso(atual);
      if (!saida) return atual;
      enviar(saida.passo.shortId, saida.passo.antes);
      return saida.historico;
    });
  }, [enviar]);

  const refazer = useCallback(() => {
    setHistorico((atual) => {
      const saida = refazerPasso(atual);
      if (!saida) return atual;
      enviar(saida.passo.shortId, saida.passo.depois);
      return saida.historico;
    });
  }, [enviar]);

  return {
    gravar,
    desfazer,
    refazer,
    podeDesfazer: historico.passados.length > 0,
    podeRefazer: historico.futuros.length > 0,
    proximoDesfazer: historico.passados.at(-1)?.rotulo ?? '',
    estado,
    ocupado: atualizar.isPending,
    erro: atualizar.isError ? ((atualizar.error as Error)?.message ?? 'não consegui salvar') : '',
  };
}
