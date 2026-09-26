// E-022 / D-310: aba "Proposta × Final". Telemetria interna que mede quanto o
// editor mudou depois da proposta da IA (bordas, duração, desvios, título) por
// corte de um projeto. Nasce vazia: escolha um projeto para carregar o diff.
import { useState } from 'react';
import { Download, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { analisesApi, type TelemetriaCorteDiff } from './api';
import { cn } from '@/lib/utils';
import { useProjetosAnalises, useTelemetriaCortes } from './useAnalises';
import {
  formatarDelta,
  formatarSeg,
  resumirOrigens,
  rotuloSituacao,
  somarOrigens,
  tomDelta,
} from './analisesFormat';

const TOM_DELTA_CLASSE: Record<ReturnType<typeof tomDelta>, string> = {
  pos: 'text-[var(--wb-warn)]',
  neg: 'text-[var(--wb-info)]',
  zero: 'text-[var(--wb-text-dim)]',
  nulo: 'text-[var(--wb-text-dim)]',
};

const SITUACAO_CLASSE: Record<string, string> = {
  com_snapshot: 'bg-[var(--wb-accent-soft)] text-[var(--wb-accent)]',
  sem_proposta_ia: 'bg-[var(--wb-bg-inset)] text-[var(--wb-warn)]',
  sem_snapshot: 'bg-[var(--wb-bg-inset)] text-[var(--wb-text-dim)]',
};

function Delta({ seg }: { seg: number | null }) {
  return <span className={TOM_DELTA_CLASSE[tomDelta(seg)]}>{formatarDelta(seg)}</span>;
}

function SituacaoBadge({ situacao }: { situacao: TelemetriaCorteDiff['situacao'] }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 font-code text-[10px] uppercase tracking-[0.06em]',
        SITUACAO_CLASSE[situacao] ?? 'bg-[var(--wb-bg-inset)] text-[var(--wb-text-dim)]',
      )}
    >
      {rotuloSituacao(situacao)}
    </span>
  );
}

function ResumoChip({ rotulo, valor }: { rotulo: string; valor: number }) {
  return (
    <div className="grid gap-0.5 rounded-[var(--radius-sm)] border border-[var(--wb-border-soft)] bg-[var(--wb-bg-card)] px-4 py-2.5">
      <span className="font-code text-[10px] uppercase tracking-[0.08em] text-[var(--wb-text-dim)]">
        {rotulo}
      </span>
      <span className="text-[22px] font-medium leading-none text-[var(--wb-text)]">{valor}</span>
    </div>
  );
}

function CorteRow({ diff }: { diff: TelemetriaCorteDiff }) {
  const { titulo, bordas, desvios } = diff;
  const semProposta = diff.situacao !== 'com_snapshot';
  return (
    <tr className="border-t border-[var(--wb-border-soft)] align-top">
      <td className="px-3 py-3 font-code text-[13px] text-[var(--wb-text-mute)]">
        #{diff.numero}
      </td>
      <td className="px-3 py-3">
        <SituacaoBadge situacao={diff.situacao} />
        {diff.origem_analise && (
          <div className="mt-1 font-code text-[10px] text-[var(--wb-text-dim)]">
            {diff.origem_analise}
          </div>
        )}
      </td>
      <td className="px-3 py-3 text-[13px]">
        {semProposta ? (
          <span className="text-[var(--wb-text)]">{titulo.final || '—'}</span>
        ) : (
          <div className="grid gap-1">
            <span className="text-[var(--wb-text-dim)] line-through decoration-[var(--wb-border)]">
              {titulo.proposto || '—'}
            </span>
            <span
              className={cn(
                titulo.mudou ? 'text-[var(--wb-text)]' : 'text-[var(--wb-text-mute)]',
              )}
            >
              {titulo.final || '—'}
              {!titulo.mudou && (
                <span className="ml-1.5 font-code text-[10px] text-[var(--wb-text-dim)]">
                  (mantido)
                </span>
              )}
            </span>
          </div>
        )}
      </td>
      <td className="px-3 py-3 font-code text-[12px] text-[var(--wb-text-mute)]">
        <div>
          início <Delta seg={bordas.delta_inicio_seg} />
        </div>
        <div>
          fim <Delta seg={bordas.delta_fim_seg} />
        </div>
      </td>
      <td className="px-3 py-3 font-code text-[12px] text-[var(--wb-text-mute)]">
        <div>{formatarSeg(bordas.duracao_final_seg)}</div>
        <div className="text-[var(--wb-text-dim)]">
          prop {formatarSeg(bordas.duracao_proposta_seg)} · <Delta seg={bordas.delta_duracao_seg} />
        </div>
      </td>
      <td className="px-3 py-3 font-code text-[12px] text-[var(--wb-text-mute)]">
        {semProposta ? (
          <div>
            {desvios.finais} finais
            <div className="text-[var(--wb-text-dim)]">{resumirOrigens(desvios.finais_por_origem)}</div>
          </div>
        ) : (
          <div className="grid gap-0.5">
            <div>
              {desvios.propostos ?? 0} propostos · {desvios.mantidos?.length ?? 0} mantidos ·{' '}
              {desvios.removidos?.length ?? 0} removidos
            </div>
            <div className="text-[var(--wb-text-dim)]">
              +{somarOrigens(desvios.adicionados_por_origem)} adicionados
              {somarOrigens(desvios.adicionados_por_origem) > 0 &&
                ` (${resumirOrigens(desvios.adicionados_por_origem)})`}
            </div>
          </div>
        )}
      </td>
    </tr>
  );
}

export function PropostaFinalTab() {
  const [projetoId, setProjetoId] = useState<string | null>(null);
  const projetos = useProjetosAnalises();
  const telemetria = useTelemetriaCortes(projetoId);

  return (
    <div className="grid content-start gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <label className="grid gap-1.5">
          <span className="font-code text-[10px] uppercase tracking-[0.08em] text-[var(--wb-text-dim)]">
            Projeto
          </span>
          <select
            value={projetoId ?? ''}
            onChange={(e) => setProjetoId(e.target.value || null)}
            disabled={projetos.isLoading}
            className="min-w-[280px] rounded-[var(--radius-sm)] border border-[var(--wb-border-soft)] bg-[var(--wb-bg-card)] px-3 py-2 text-[14px] text-[var(--wb-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--wb-focus)]"
          >
            <option value="">
              {projetos.isLoading ? 'Carregando projetos…' : 'Selecione um projeto…'}
            </option>
            {(projetos.data ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.titulo_live || p.id}
              </option>
            ))}
          </select>
        </label>

        <Button
          type="button"
          variant="outline"
          onClick={() => window.open(analisesApi.telemetriaCortesCsvUrl(), '_blank', 'noopener')}
        >
          <Download size={16} aria-hidden />
          Exportar CSV (todos os projetos)
        </Button>
      </div>

      {!projetoId && (
        <div className="rounded-[var(--radius)] border border-dashed border-[var(--wb-border)] bg-[var(--wb-bg-card)] p-8 text-center">
          <p className="text-[15px] text-[var(--wb-text-mute)]">
            Escolha um projeto para comparar a proposta da IA com o corte final.
          </p>
          <p className="mt-1.5 text-[13px] text-[var(--wb-text-dim)]">
            A telemetria é populada quando você <strong>roda uma análise na v2</strong> — projetos
            anteriores aparecem marcados como legado.
          </p>
        </div>
      )}

      {projetoId && telemetria.isLoading && (
        <p className="flex items-center gap-2 text-[15px] text-[var(--wb-text-mute)]">
          <Loader2 className="animate-spin" size={16} aria-hidden />
          Carregando telemetria…
        </p>
      )}

      {projetoId && telemetria.isError && (
        <div className="rounded-[var(--radius)] border border-[var(--wb-border-soft)] bg-[var(--wb-bg-card)] p-5 text-[14px] text-[var(--wb-err)]">
          Não foi possível carregar a telemetria deste projeto.
        </div>
      )}

      {projetoId && telemetria.data && (
        <>
          <div className="flex flex-wrap gap-2.5">
            <ResumoChip rotulo="Cortes" valor={telemetria.data.total_cortes} />
            <ResumoChip rotulo="Com proposta da IA" valor={telemetria.data.com_snapshot} />
            <ResumoChip rotulo="Sem snapshot" valor={telemetria.data.sem_snapshot} />
          </div>

          {telemetria.data.cortes.length === 0 ? (
            <div className="rounded-[var(--radius)] border border-dashed border-[var(--wb-border)] bg-[var(--wb-bg-card)] p-8 text-center text-[15px] text-[var(--wb-text-mute)]">
              Este projeto ainda não tem cortes.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-[var(--radius)] border border-[var(--wb-border-soft)]">
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="bg-[var(--wb-bg-inset)] font-code text-[10px] uppercase tracking-[0.08em] text-[var(--wb-text-dim)]">
                    <th className="px-3 py-2 font-medium">#</th>
                    <th className="px-3 py-2 font-medium">Situação</th>
                    <th className="px-3 py-2 font-medium">Título proposto → final</th>
                    <th className="px-3 py-2 font-medium">Bordas</th>
                    <th className="px-3 py-2 font-medium">Duração</th>
                    <th className="px-3 py-2 font-medium">Desvios</th>
                  </tr>
                </thead>
                <tbody>
                  {telemetria.data.cortes.map((diff) => (
                    <CorteRow key={diff.corte_id || diff.numero} diff={diff} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
