import { memo, useEffect, useMemo, useRef } from 'react';
import { cn } from '@/lib/utils';
import { useCorte, type DecisaoDoSilencio } from '@/features/editor/useCortes';
import type { Desvio, TranscricaoLinha } from '@/types/models';
import { PerguntaDaDecisao } from './DecisoesDoCorte';
import { LinhaDoTrecho } from './LinhaDoTrecho';
import { resumoDoSilencio, silencioDoCorte, type RespostaDoSilencio } from './silencioDoCorte';
import { FOCO } from '../salaDoEditor';

// D-1093 (E5, P9, canvas `03-cortes-proposta`): "1 · Tirar o silêncio? Sai X". Uma
// resposta para todos — Tirar todos / Manter todos —, e cada silêncio que sai mostra o
// SAI e o FICA da emenda (o bloco da pergunta 2, com o selo "Auto · borda da IA"). A
// exceção se risca pelo Riscar do bloco: nada de caixa de seleção por silêncio.

/** Até aqui a lista abre sozinha; com mais, ela empurraria a pergunta 2 para fora da tela. */
const ABERTA_ATE = 3;

interface PerguntaDoSilencioProps {
  corteId: string;
  desvios: Desvio[];
  linhas?: TranscricaoLinha[];
  selectedDesvioIdx: number | null;
  pendente?: boolean;
  onSeek: (seg: number) => void;
  /** Risca um silêncio só, pelo índice na lista do corte. */
  onRiscar: (indice: number) => void;
  onDecidir: (decisao: DecisaoDoSilencio) => void;
}

const SEM_LINHAS: TranscricaoLinha[] = [];

export const PerguntaDoSilencio = memo(function PerguntaDoSilencio({
  corteId,
  desvios,
  linhas = SEM_LINHAS,
  selectedDesvioIdx,
  pendente,
  onSeek,
  onRiscar,
  onDecidir,
}: PerguntaDoSilencioProps) {
  const riscados = useCorte(corteId).data?.desvios_riscados;
  const silencio = useMemo(() => silencioDoCorte(desvios, riscados), [desvios, riscados]);
  const selecionado = useRef<HTMLDivElement | null>(null);
  const selecionadoESilencio = !!silencio?.saem.some((s) => s.indice === selectedDesvioIdx);
  useEffect(() => {
    if (selecionadoESilencio) selecionado.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [selecionadoESilencio, selectedDesvioIdx]);

  // Sem silêncio nenhum não há o que perguntar: o app os procura a cada bruto gerado.
  if (!silencio) return null;
  const { saem } = silencio;
  return (
    <PerguntaDaDecisao
      numero={1}
      pergunta={`Tirar o silêncio? Sai ${silencio.rotulo}`}
      resumo={resumoDoSilencio(silencio)}
      assunto="o silêncio"
    >
      <div className="flex flex-col gap-1.5 px-2.5 pb-2.5 pt-1.5">
        {saem.length > 0 ? (
          <details open={saem.length <= ABERTA_ATE || selecionadoESilencio}>
            <summary className="cursor-pointer text-pequeno font-semibold text-fg-2">
              {saem.length === 1 ? 'O silêncio que sai' : `Os ${saem.length} silêncios que saem`}
            </summary>
            <div className="mt-1.5 flex flex-col gap-1.5">
              {saem.map(({ desvio, indice }) => (
                <div key={`${desvio.inicio_hms}-${indice}`} ref={indice === selectedDesvioIdx ? selecionado : undefined}>
                  <LinhaDoTrecho
                    desvio={desvio}
                    ativo={indice === selectedDesvioIdx}
                    linhas={linhas}
                    pendente={pendente}
                    onSeek={onSeek}
                    onRiscar={() => onRiscar(indice)}
                    silencio
                  />
                </div>
              ))}
            </div>
          </details>
        ) : null}
        <RespostaEmLote resposta={silencio.resposta} pendente={pendente} onDecidir={onDecidir} />
        <p className="m-0 text-micro leading-[1.4] text-fg-2">
          Para manter um só, risque-o. Conta como silêncio a pausa de 0,8 s ou mais.
        </p>
      </div>
    </PerguntaDaDecisao>
  );
});

// D-1150 (§7.3): a resposta é um segmented — pílula de poço com a opção marcada acesa.
const BOTAO_DA_RESPOSTA = `h-7 flex-1 rounded-pilula text-pequeno transition-colors duration-150 disabled:text-fg-off motion-reduce:transition-none ${FOCO}`;

function RespostaEmLote({
  resposta,
  pendente,
  onDecidir,
}: {
  resposta: RespostaDoSilencio;
  pendente?: boolean;
  onDecidir: (decisao: DecisaoDoSilencio) => void;
}) {
  const opcoes: { decisao: DecisaoDoSilencio; rotulo: string }[] = [
    { decisao: 'tirar', rotulo: 'Tirar todos' },
    { decisao: 'manter', rotulo: 'Manter todos' },
  ];
  return (
    <div role="group" aria-label="Resposta para todos os silêncios" className="flex gap-0.5 rounded-pilula bg-poco p-0.5">
      {opcoes.map(({ decisao, rotulo }) => {
        const marcada = resposta === decisao;
        return (
          <button
            key={decisao}
            type="button"
            aria-pressed={marcada}
            // A resposta já dada não se repete: o clique iria ao servidor para nada.
            onClick={marcada ? undefined : () => onDecidir(decisao)}
            disabled={pendente}
            data-sala=""
            className={cn(
              BOTAO_DA_RESPOSTA,
              marcada
                ? 'bg-vidro-3 text-fg shadow-topo'
                : 'bg-transparent text-fg-2 hover:text-fg',
            )}
          >
            {rotulo}
          </button>
        );
      })}
    </div>
  );
}
