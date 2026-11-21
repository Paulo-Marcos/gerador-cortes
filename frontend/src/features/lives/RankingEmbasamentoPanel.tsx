import { Dialog } from '@/components/ui/dialog';
import {
  Tabela,
  TabelaCabeca,
  TabelaCelula,
  TabelaCorpo,
  TabelaLinha,
  TabelaTitulo,
} from '@/components/ui/tabela';
import type { EmbasamentoItem } from './api';
import { Icon } from '@/upgrade/Icon';

/**
 * D-1176: na Sala escura é o `Dialog` (foco preso, Esc fecha) com uma `Tabela`.
 * Painel de embasamento de uma live no ranking (D-356).
 *
 * Mostra POR QUE a live tirou aquela nota: para cada critério, o valor bruto que o
 * dono reconhece → o normalizado (posição no lote) → o peso → a contribuição em
 * pontos; a nota final é a soma das contribuições; e as frases que o Claude extraiu
 * justificando a positividade dos comentários.
 */

interface PanelProps {
  titulo: string;
  pontuacaoTotal: number;
  embasamento: EmbasamentoItem[];
  destaques: string[];
  onClose: () => void;
}

function formatBruto(criterio: string, valor: number): string {
  switch (criterio) {
    case 'views':
      return `${Math.round(valor).toLocaleString('pt-BR')} views`;
    case 'likes_por_view':
      return `${(valor * 100).toFixed(2)}% das views`;
    case 'comentarios_por_view':
      return `${(valor * 100).toFixed(3)}% das views`;
    case 'sentimento':
      return `${valor.toFixed(1)} / 10`;
    case 'recencia':
      return `${Math.round(valor)} dias atrás`;
    case 'vph':
      return `${Math.round(valor).toLocaleString('pt-BR')} views/h`;
    default:
      return String(valor);
  }
}

export function RankingEmbasamentoPanel({
  titulo,
  pontuacaoTotal,
  embasamento,
  destaques,
  onClose,
}: PanelProps) {
  const somaContribuicoes = embasamento.reduce((acc, item) => acc + item.contribuicao, 0);

  return (
    <Dialog
      open
      onClose={onClose}
      tamanho="md"
      title={`Por que essa nota? ${Math.round(pontuacaoTotal)} pontos`}
      description={`${titulo}. Cada critério vale o valor bruto, sua posição no lote (0–100%) × o peso do canal = a contribuição em pontos. A soma das contribuições é a nota final.`}
    >
      <div className="overflow-x-auto rounded-cartao border border-fio bg-vidro">
        <Tabela>
          <TabelaCabeca>
            <TabelaLinha>
              <TabelaTitulo>Critério</TabelaTitulo>
              <TabelaTitulo>Bruto</TabelaTitulo>
              <TabelaTitulo aDireita>No lote</TabelaTitulo>
              <TabelaTitulo aDireita>Peso</TabelaTitulo>
              <TabelaTitulo aDireita>Contrib.</TabelaTitulo>
            </TabelaLinha>
          </TabelaCabeca>
          <TabelaCorpo>
            {embasamento.map((item) => (
              <TabelaLinha key={item.criterio}>
                <TabelaCelula className="font-semibold">{item.rotulo}</TabelaCelula>
                <TabelaCelula className="text-fg-2">{formatBruto(item.criterio, item.valor_bruto)}</TabelaCelula>
                <TabelaCelula numero aDireita className="text-fg-2">
                  {Math.round(item.valor_normalizado * 100)}%
                </TabelaCelula>
                <TabelaCelula numero aDireita className="text-fg-2">
                  {item.peso.toFixed(2)}
                </TabelaCelula>
                <TabelaCelula numero aDireita className="font-bold">
                  {item.contribuicao.toFixed(1)}
                </TabelaCelula>
              </TabelaLinha>
            ))}
            <TabelaLinha>
              <TabelaCelula colSpan={4} className="text-fg-3">
                Nota final (soma)
              </TabelaCelula>
              <TabelaCelula numero aDireita className="text-linha font-bold">
                {somaContribuicoes.toFixed(1)}
              </TabelaCelula>
            </TabelaLinha>
          </TabelaCorpo>
        </Tabela>
      </div>

      {destaques.length > 0 && (
        <section className="mt-5">
          <h3 className="mb-2 flex items-center gap-1.5 text-micro text-fg-3">
            <Icon name="quote" />
            Comentários que justificam o tom
          </h3>
          <ul className="grid gap-2">
            {destaques.map((destaque, i) => (
              <li key={i} className="rounded-etiqueta border-l-2 border-iris-fio bg-vidro px-3 py-2 text-corpo italic text-fg-2">
                &ldquo;{destaque}&rdquo;
              </li>
            ))}
          </ul>
        </section>
      )}
    </Dialog>
  );
}
