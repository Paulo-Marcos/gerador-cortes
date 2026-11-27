// E-022 / D-310 / D-1176: aba "Proposta × Final". Telemetria interna que mede quanto o
// editor mudou depois da proposta da IA (bordas, duração, desvios, título) por corte de uma
// live. Nasce vazia: escolha uma live para carregar o diff (DIRECAO §7.8).
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { EstadoDeErro } from '@/components/ui/estado-de-erro';
import { mensagemErro } from '@/lib/mensagemErro';
import { EstadoVazio } from '@/components/ui/estado-vazio';
import { Field } from '@/components/ui/field';
import { Select } from '@/components/ui/select';
import { Selo, type TomDoSelo } from '@/components/ui/selo';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Tabela,
  TabelaCabeca,
  TabelaCelula,
  TabelaCorpo,
  TabelaLinha,
  TabelaTitulo,
} from '@/components/ui/tabela';
import { cn } from '@/lib/utils';
import type { Projeto } from '@/types/models';
import type { TelemetriaCorteDiff, TelemetriaProjeto } from './api';
import { useProjetosAnalises, useTelemetriaCortes } from './useAnalises';
import {
  formatarDelta,
  formatarSeg,
  fraseBuscandoLives,
  resumirOrigens,
  rotuloSituacao,
  somarOrigens,
  tomDelta,
} from './analisesFormat';
import { MudancasPorOrigem } from './MudancasPorOrigem';

const TOM_DELTA_CLASSE: Record<ReturnType<typeof tomDelta>, string> = {
  pos: 'text-aviso',
  neg: 'text-[color:var(--cc-info)]',
  zero: 'text-fg-3',
  nulo: 'text-fg-3',
};

const TOM_DA_SITUACAO: Record<string, TomDoSelo> = {
  com_snapshot: 'neutro',
  sem_proposta_ia: 'convite',
  sem_snapshot: 'inerte',
};

function Delta({ seg }: { seg: number | null }) {
  return <span className={TOM_DELTA_CLASSE[tomDelta(seg)]}>{formatarDelta(seg)}</span>;
}

function ResumoDoProjeto({ telemetria }: { telemetria: TelemetriaProjeto }) {
  const itens = [
    ['Cortes', telemetria.total_cortes],
    ['Com proposta da IA', telemetria.com_snapshot],
    ['Sem snapshot', telemetria.sem_snapshot],
  ] as const;
  return (
    <dl className="flex flex-wrap gap-3.5">
      {itens.map(([rotulo, valor]) => (
        <div key={rotulo} className="flex flex-col gap-1 rounded-cartao border border-fio bg-vidro px-4 py-3">
          <dt className="text-micro text-fg-3">{rotulo}</dt>
          <dd className="text-linha font-bold tabular-nums text-fg">{valor}</dd>
        </div>
      ))}
    </dl>
  );
}

/** D-999: o que o operador mudou na proposta, no lugar do voto (D-419). */
function MudancasCell({ diff }: { diff: TelemetriaCorteDiff }) {
  if (diff.situacao !== 'com_snapshot') return <span className="text-fg-3">—</span>;
  if (diff.mudancas.length === 0) return <span className="text-fg-3">Nada</span>;
  return (
    <ul className="grid gap-0.5">
      {diff.mudancas.map((m) => (
        <li key={m.tipo}>{m.descricao}</li>
      ))}
    </ul>
  );
}

const CELULA = 'py-3 align-top';

function CorteRow({ diff }: { diff: TelemetriaCorteDiff }) {
  const { titulo, bordas, desvios } = diff;
  const semProposta = diff.situacao !== 'com_snapshot';
  return (
    <TabelaLinha>
      <TabelaCelula numero className={cn(CELULA, 'text-fg-2')}>
        #{diff.numero}
      </TabelaCelula>
      <TabelaCelula className={CELULA}>
        <Selo tom={TOM_DA_SITUACAO[diff.situacao] ?? 'inerte'}>{rotuloSituacao(diff.situacao)}</Selo>
        {diff.origem_analise && <div className="mt-1 num text-pequeno text-fg-3">{diff.origem_analise}</div>}
      </TabelaCelula>
      <TabelaCelula className={CELULA}>
        {semProposta ? (
          <span>{titulo.final || '—'}</span>
        ) : (
          <div className="grid gap-1">
            <span className="text-fg-3 line-through">{titulo.proposto || '—'}</span>
            <span className={titulo.mudou ? 'text-fg' : 'text-fg-2'}>
              {titulo.final || '—'}
              {!titulo.mudou && <span className="ml-1.5 text-pequeno text-fg-3">(mantido)</span>}
            </span>
          </div>
        )}
      </TabelaCelula>
      <TabelaCelula numero className={cn(CELULA, 'text-fg-2')}>
        <div>
          início <Delta seg={bordas.delta_inicio_seg} />
        </div>
        <div>
          fim <Delta seg={bordas.delta_fim_seg} />
        </div>
      </TabelaCelula>
      <TabelaCelula numero className={cn(CELULA, 'text-fg-2')}>
        <div>{formatarSeg(bordas.duracao_final_seg)}</div>
        <div className="text-fg-3">
          prop {formatarSeg(bordas.duracao_proposta_seg)} · <Delta seg={bordas.delta_duracao_seg} />
        </div>
      </TabelaCelula>
      <TabelaCelula className={cn(CELULA, 'text-fg-2')}>
        {semProposta ? (
          <div>
            {desvios.finais} finais
            <div className="text-fg-3">{resumirOrigens(desvios.finais_por_origem)}</div>
          </div>
        ) : (
          <div className="grid gap-0.5">
            <div>
              {desvios.propostos ?? 0} propostos · {desvios.mantidos?.length ?? 0} mantidos ·{' '}
              {desvios.removidos?.length ?? 0} removidos
            </div>
            <div className="text-fg-3">
              +{somarOrigens(desvios.adicionados_por_origem)} adicionados
              {somarOrigens(desvios.adicionados_por_origem) > 0 &&
                ` (${resumirOrigens(desvios.adicionados_por_origem)})`}
            </div>
          </div>
        )}
      </TabelaCelula>
      <TabelaCelula className={cn(CELULA, 'text-fg-2')}>
        <MudancasCell diff={diff} />
      </TabelaCelula>
    </TabelaLinha>
  );
}

function TabelaDosCortes({ cortes }: { cortes: TelemetriaCorteDiff[] }) {
  return (
    <div className="overflow-x-auto rounded-cartao border border-fio bg-vidro">
      <Tabela>
        <TabelaCabeca>
          <TabelaLinha>
            <TabelaTitulo>#</TabelaTitulo>
            <TabelaTitulo>Situação</TabelaTitulo>
            <TabelaTitulo>Título proposto → final</TabelaTitulo>
            <TabelaTitulo>Bordas</TabelaTitulo>
            <TabelaTitulo>Duração</TabelaTitulo>
            <TabelaTitulo>Desvios</TabelaTitulo>
            <TabelaTitulo>O que você mudou</TabelaTitulo>
          </TabelaLinha>
        </TabelaCabeca>
        <TabelaCorpo>
          {cortes.map((diff) => (
            <CorteRow key={diff.corte_id || diff.numero} diff={diff} />
          ))}
        </TabelaCorpo>
      </Tabela>
    </div>
  );
}

/** O select de live: enquanto a lista do canal carrega ele fica desabilitado, gira e diz o que busca. */
function SeletorDeLive({
  projetoId,
  onEscolher,
}: {
  projetoId: string | null;
  onEscolher: (id: string) => void;
}) {
  const projetos = useProjetosAnalises();
  // A Biblioteca já pode ter contado as lives do canal; sem isso a frase fica sem número.
  const conhecidas = useQueryClient().getQueryData<Projeto[]>(['projetos'])?.length;
  const carregando = projetos.isLoading;
  const opcoes = (projetos.data ?? []).map((p) => ({ valor: p.id, rotulo: p.titulo_live || p.id }));
  return (
    <div className="flex flex-wrap items-end gap-4">
      <Field rotulo="Live" className="w-full max-w-[420px]">
        <Select name="projeto_id"
          opcoes={opcoes}
          value={projetoId ?? undefined}
          onValueChange={onEscolher}
          placeholder="Selecione uma live…"
          carregando={carregando ? 'Carregando lives…' : false}
        />
      </Field>
      {carregando && (
        <p role="status" className="pb-2.5 text-pequeno text-fg-3">
          {fraseBuscandoLives(conhecidas)}
        </p>
      )}
    </div>
  );
}

export function PropostaFinalTab() {
  const [projetoId, setProjetoId] = useState<string | null>(null);
  const telemetria = useTelemetriaCortes(projetoId);
  const projetos = useProjetosAnalises();

  // D-1204: sem a lista não há o que escolher; pedir "Escolha uma live" esconderia a falha.
  if (projetos.isError && !projetos.data) {
    return (
      <EstadoDeErro
        titulo="Não consegui carregar a lista de lives"
        motivo={mensagemErro(projetos.error, 'O backend não respondeu. Tente de novo.')}
        aoTentar={() => void projetos.refetch()}
      />
    );
  }

  return (
    <div className="grid content-start gap-5">
      <SeletorDeLive projetoId={projetoId} onEscolher={setProjetoId} />

      {!projetoId && (
        <EstadoVazio
          icone="git-compare-arrows"
          titulo="Escolha uma live para comparar"
          descricao="A telemetria nasce quando você roda uma análise na v2; lives anteriores aparecem marcadas como legado."
        />
      )}

      {projetoId && telemetria.isLoading && (
        <div role="status" className="grid gap-3">
          <p className="text-pequeno text-fg-3">Carregando a telemetria da live…</p>
          <Skeleton className="h-[72px] w-full" />
        </div>
      )}

      {projetoId && telemetria.isError && (
        <EstadoDeErro
          titulo="Não foi possível carregar a telemetria"
          motivo="Esta live não respondeu. Tente de novo em instantes."
          aoTentar={() => void telemetria.refetch()}
        />
      )}

      {projetoId && telemetria.data && (
        <>
          <ResumoDoProjeto telemetria={telemetria.data} />
          <MudancasPorOrigem
            grupos={telemetria.data.mudancas_por_origem}
            motivos={telemetria.data.motivos_apagado}
          />
          {telemetria.data.cortes.length === 0 ? (
            <EstadoVazio icone="scissors" titulo="Esta live ainda não tem cortes" />
          ) : (
            <TabelaDosCortes cortes={telemetria.data.cortes} />
          )}
        </>
      )}
    </div>
  );
}
