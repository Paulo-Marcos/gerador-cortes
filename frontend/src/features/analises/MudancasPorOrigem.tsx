// D-999: "o que você mudou", somado por quem propôs o corte. Fica no lugar do
// voto de qualidade (D-419), que virou carimbo: em vez de uma nota, quantos
// cortes de cada provedor o operador precisou esticar, encurtar, renomear ou
// retalhar — e quantas propostas apagou, e por quê (D-993).
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

export function MudancasPorOrigem({ grupos }: { grupos: GrupoDaOrigem[] }) {
  if (grupos.length === 0) return null;
  return (
    <section className="grid gap-2">
      <h3 className="text-[15px] font-medium text-[var(--wb-text)]">O que você mudou, por origem</h3>
      <p className="text-[13px] text-[var(--wb-text-dim)]">
        Quantos cortes de cada proposta tiveram cada mudança. + esticou, − encurtou.
      </p>
      <div className="overflow-x-auto rounded-[var(--radius)] border border-[var(--wb-border-soft)]">
        <table className="w-full border-collapse text-left text-[13px]">
          <thead>
            <tr className="bg-[var(--wb-bg-inset)] text-[11px] uppercase text-[var(--wb-text-dim)]">
              <th className="px-3 py-2 font-medium">Origem</th>
              {COLUNAS.map((c) => (
                <th key={c.rotulo} className="px-3 py-2 font-medium">
                  {c.rotulo}
                </th>
              ))}
              <th className="px-3 py-2 font-medium">Por que apagou</th>
            </tr>
          </thead>
          <tbody>
            {grupos.map((g) => (
              <tr key={g.origem} className="border-t border-[var(--wb-border-soft)]">
                <td className="px-3 py-2 font-code text-[var(--wb-text)]">{g.origem}</td>
                {COLUNAS.map((c) => (
                  <td key={c.rotulo} className="px-3 py-2 font-code text-[var(--wb-text-mute)]">
                    {c.valor(g)}
                  </td>
                ))}
                <td className="px-3 py-2 text-[var(--wb-text-mute)]">
                  {resumirApagados(g.apagados.por_motivo, MOTIVOS_APAGADO)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
