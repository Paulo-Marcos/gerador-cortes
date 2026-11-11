import { useFuncaoEstavel } from '@/hooks/useFuncaoEstavel';
import type { DecisaoDoSilencio } from '@/features/editor/useCortes';
import type { Corte, Desvio, TranscricaoLinha } from '@/types/models';
import type { TrechosRiscados } from '../useTrechosRiscados';
import { DecisoesDoCorte, PerguntaDosDesvios } from './DecisoesDoCorte';
import { PerguntaDoSilencio } from './PerguntaDoSilencio';
import { PerguntaDoSom } from './PerguntaDoSom';
import type { SomDoCorte } from './useSomDoCorte';
import { TrechosList, usePendenciasDosTrechos, type TrechosListProps } from './TrechosList';

// A aba Decisões do painel direito (D-1089, D-1093, D-1095): as perguntas do corte, uma sob a
// outra. Saiu do RightTabsPanel, que estava no teto da catraca de função.

interface EntradaDasAcoes {
  onSeek: (seg: number) => void;
  onAdicionarTrechoAqui?: () => void;
  riscados?: TrechosRiscados;
  onGerarManual: () => void;
  onGerarTrechosIA: (provider: 'claude' | 'gemini') => void;
  pendingTrechos: Omit<TrechosListProps['pending'], 'restaurando'>;
}

/**
 * D-740: a lista de trechos é o maior custo do tique de 4 Hz do player e não depende do
 * tempo. Com callbacks estáveis o memo dela, e o da pergunta 1, seguram a redesenhada.
 */
export function useAcoesDasDecisoes({
  onSeek,
  onAdicionarTrechoAqui,
  riscados,
  onGerarManual,
  onGerarTrechosIA,
  pendingTrechos,
}: EntradaDasAcoes) {
  const adicionarNoCursor = useFuncaoEstavel(() => onAdicionarTrechoAqui?.());
  return {
    irPara: useFuncaoEstavel(onSeek),
    adicionarNoCursor: onAdicionarTrechoAqui ? adicionarNoCursor : undefined,
    riscar: useFuncaoEstavel((indice: number) => riscados?.riscar(indice)),
    restaurar: useFuncaoEstavel((indice: number) => riscados?.restaurar(indice)),
    desfazerRodada: useFuncaoEstavel(() => riscados?.desfazerRodada()),
    voltarABordaDaIa: useFuncaoEstavel((indice: number) => riscados?.voltarABordaDaIa(indice)),
    decidirOsSilencios: useFuncaoEstavel((decisao: DecisaoDoSilencio) =>
      riscados?.decidirOsSilencios(decisao),
    ),
    gerarManual: useFuncaoEstavel(onGerarManual),
    gerarTrechosIA: useFuncaoEstavel(onGerarTrechosIA),
    pendente: usePendenciasDosTrechos(pendingTrechos, riscados?.ocupado),
  };
}

export type AcoesDasDecisoes = ReturnType<typeof useAcoesDasDecisoes>;

interface ConteudoDaAbaDecisoesProps {
  corteId: string;
  desvios: Desvio[];
  selectedDesvioIdx: number | null;
  transcricao?: TranscricaoLinha[];
  corte?: Pick<Corte, 'desvios_riscados' | 'trechos_da_ultima_rodada' | 'inicio_seg' | 'fim_seg'>;
  acoes: AcoesDasDecisoes;
  /** D-1095: sem ele (fora do editor) a pergunta do som não aparece. */
  som?: SomDoCorte;
}

/**
 * Chamada como função, não como elemento (como a `barraDosTrechos` do TrechosList): as
 * perguntas ficam na árvore do painel, onde os testes da aba as procuram.
 */
export function conteudoDaAbaDecisoes({
  corteId,
  desvios,
  selectedDesvioIdx,
  transcricao,
  corte,
  acoes,
  som,
}: ConteudoDaAbaDecisoesProps) {
  return (
    <DecisoesDoCorte>
      {/* D-1093: 1 · o silêncio, decidido de uma vez (P9). */}
      <PerguntaDoSilencio
        corteId={corteId}
        desvios={desvios}
        linhas={transcricao}
        selectedDesvioIdx={selectedDesvioIdx}
        pendente={acoes.pendente.restaurando}
        onSeek={acoes.irPara}
        onRiscar={acoes.riscar}
        onDecidir={acoes.decidirOsSilencios}
      />
      <PerguntaDosDesvios corte={corte} desvios={desvios}>
        <TrechosList
          desvios={desvios}
          semOSilencioDoApp
          selectedDesvioIdx={selectedDesvioIdx}
          onSeek={acoes.irPara}
          onAdicionarTrechoNoCursor={acoes.adicionarNoCursor}
          onRemoverDesvio={acoes.riscar}
          onGerarManual={acoes.gerarManual}
          onGerarTrechosIA={acoes.gerarTrechosIA}
          pending={acoes.pendente}
          linhas={transcricao}
          riscados={corte?.desvios_riscados}
          trechosDaUltimaRodada={corte?.trechos_da_ultima_rodada}
          onRestaurarDesvio={acoes.restaurar}
          onDesfazerRodada={acoes.desfazerRodada}
          onVoltarABordaDaIa={acoes.voltarABordaDaIa}
        />
      </PerguntaDosDesvios>
      {/* D-1095: 3 · o som, que só mexe no áudio. */}
      {som ? <PerguntaDoSom som={som} /> : null}
    </DecisoesDoCorte>
  );
}
