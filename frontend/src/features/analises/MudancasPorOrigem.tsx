// D-999: "o que você mudou", somado por quem propôs o corte. Fica no lugar do
// voto de qualidade (D-419), que virou carimbo: em vez de uma nota, quantos
// cortes de cada provedor o operador precisou esticar, encurtar, renomear ou
// retalhar — e quantas propostas apagou, e por quê (D-993).
import {
  Tabela,
  TabelaCabeca,
  TabelaCelula,
  TabelaCorpo,
  TabelaLinha,
  TabelaTitulo,
} from '@/components/ui/tabela';
import { MOTIVOS_APAGADO } from '@/features/editor/motivoApagado';
import type { TelemetriaProjeto } from './api';
import { resumirApagados } from './analisesFormat';

type GrupoDaOrigem = TelemetriaProjeto['mudancas_por_origem'][number];

const COLUNAS: { rotulo: string; valor: (g: GrupoDaOrigem) => string }[] = [
  { rotulo: 'Cortes', valor: (g) => String(g.cortes) },
  { rotulo: 'Intactos', valor: (g) => String(g.sem_mudanca) },
  {
    rotulo: 'Começo + / −',
    valor: (g) => `${g.por_tipo.inicio_esticado ?? 0} / ${g.por_tipo.inicio_encurtado ?? 0}`,
  },
  {
    rotulo: 'Fim + / −',
    valor: (g) => `${g.por_tipo.fim_esticado ?? 0} / ${g.por_tipo.fim_encurtado ?? 0}`,
  },
  { rotulo: 'Título trocado', valor: (g) => String(g.por_tipo.titulo_trocado ?? 0) },
  {
    rotulo: 'Trechos + / −',
    valor: (g) =>
      `${g.por_tipo.trechos_acrescentados ?? 0} / ${g.por_tipo.trechos_desfeitos ?? 0}`,
  },
  { rotulo: 'Apagados', valor: (g) => String(g.apagados.total) },
];

export function MudancasPorOrigem({
  grupos,
  motivos = MOTIVOS_APAGADO,
}: {
  grupos: GrupoDaOrigem[];
  /** D-1006: os motivos do canal, inclusive os escondidos, para nomear a contagem. */
  motivos?: readonly { slug: string; rotulo: string }[];
}) {
  if (grupos.length === 0) return null;
  return (
    <section className="grid gap-2">
      <h3 className="text-linha text-fg">O que você mudou, por origem</h3>
      <p className="text-corpo text-fg-3">
        Quantos cortes de cada proposta tiveram cada mudança. + esticou, − encurtou.
      </p>
      <div className="overflow-x-auto rounded-cartao border border-fio bg-vidro">
        <Tabela>
          <TabelaCabeca>
            <TabelaLinha>
              <TabelaTitulo>Origem</TabelaTitulo>
              {COLUNAS.map((c) => (
                <TabelaTitulo key={c.rotulo} aDireita>
                  {c.rotulo}
                </TabelaTitulo>
              ))}
              <TabelaTitulo>Por que apagou</TabelaTitulo>
            </TabelaLinha>
          </TabelaCabeca>
          <TabelaCorpo>
            {grupos.map((g) => (
              <TabelaLinha key={g.origem}>
                <TabelaCelula numero>{g.origem}</TabelaCelula>
                {COLUNAS.map((c) => (
                  <TabelaCelula key={c.rotulo} numero aDireita className="text-fg-2">
                    {c.valor(g)}
                  </TabelaCelula>
                ))}
                <TabelaCelula className="text-fg-2">
                  {resumirApagados(g.apagados.por_motivo, motivos)}
                </TabelaCelula>
              </TabelaLinha>
            ))}
          </TabelaCorpo>
        </Tabela>
      </div>
    </section>
  );
}
