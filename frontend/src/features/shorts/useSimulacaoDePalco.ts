import { useCallback, useEffect, useRef, useState } from 'react';
import { shortsApi, type PlanoDesenhavel } from './shortsApi';
import {
  INICIAL,
  aoDescartar,
  aoMover,
  aoResponder,
  aoSoltar,
  type Ajustes,
  type EstadoSimulacao,
} from './simulacaoDePalco';

// D-500: o palco redesenhado DURANTE o arraste.
//
// O problema: o canvas só redesenhava depois do PATCH e do refetch. O retângulo
// se movia, mas o vídeo dentro dele não refluía — arrastar era mover uma
// moldura vazia e descobrir o resultado depois.
//
// A saída ÓBVIA seria recalcular no frontend, e é justamente a que este épico
// existe para não tomar. Portar `escalar`/cobrir-caber para cá criaria a segunda
// implementação da geometria, que já produziu dois bugs de divergência
// silenciosa (D-490, D-493). Em vez disso o backend RESOLVE um plano hipotético
// sem gravar nada, e a tela só desenha o que ele devolve.
//
// A decisão de quando chamar e o que aceitar mora em `simulacaoDePalco.ts`,
// pura e testada. Aqui fica só a ligação com o React e com o relógio.

export function useSimulacaoDePalco(shortId: string | null) {
  const [simulado, setSimulado] = useState<PlanoDesenhavel | null>(null);
  const estado = useRef<EstadoSimulacao>(INICIAL);

  const chamar = useCallback(
    async (ajustes: Ajustes, geracao: number) => {
      if (!shortId) return;
      let plano: PlanoDesenhavel | null = null;
      try {
        plano = await shortsApi.simularPalco(shortId, ajustes);
      } catch {
        // Simulação é conforto, não correção: falhar aqui só faz o canvas
        // seguir mostrando o último plano bom. O valor real é gravado no
        // soltar, por outro caminho.
      }
      const passo = aoResponder(estado.current, geracao, Date.now());
      estado.current = passo.estado;
      if (passo.pintar && plano) setSimulado(plano);
      if (passo.disparar) void chamar(passo.disparar, passo.estado.geracao);
    },
    [shortId],
  );

  /** Chame a cada movimento do ponteiro. */
  const simular = useCallback(
    (ajustes: Ajustes) => {
      if (!shortId) return;
      const passo = aoMover(estado.current, ajustes, Date.now());
      estado.current = passo.estado;
      if (passo.disparar) void chamar(passo.disparar, passo.estado.geracao);
    },
    [chamar, shortId],
  );

  /** Chame ao soltar: para de simular, mantendo o último quadro na tela. */
  const encerrar = useCallback(() => {
    estado.current = aoSoltar(estado.current);
  }, []);

  /** Chame quando o plano gravado chegar (ou a gravação falhar). */
  const descartar = useCallback(() => {
    estado.current = aoDescartar(estado.current);
    setSimulado(null);
  }, []);

  // Trocar de candidato zera tudo: o rascunho é de um short, e mostrá-lo sobre
  // outro seria pintar o palco errado.
  useEffect(() => {
    estado.current = aoDescartar(estado.current);
    setSimulado(null);
  }, [shortId]);

  return { simulado, simular, encerrar, descartar };
}
