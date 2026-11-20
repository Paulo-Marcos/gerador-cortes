import { useState } from 'react';
import { cn } from '@/lib/utils';
import type {
  ApontamentoBruto,
  AvaliacaoBruto,
  GravidadeApontamento,
  VereditoBruto,
} from '@/features/editor/avaliacao/api/avaliacaoBruto';
import {
  useAvaliacaoBruto,
  useHistoricoAvaliacaoBruto,
  useReavaliarBruto,
} from './useAvaliacaoBruto';
import { AcaoDeIa } from '@/components/ui/acao-de-ia';
import { SeloDeProvider } from '@/components/ui/selo-provider';
import { providerDoModelo, providerEmVoo } from '@/lib/providerIa';
import { Icon } from '@/upgrade/Icon';

// D-447: o parecer automático sobre a ESTRUTURA do bruto — nota, veredito e os
// pontos que não fecham. Irmão do "o que você mudou" (D-999, o diff sobre a
// PROPOSTA): este lê o resultado, aquele lê a intenção.
//
// O painel não dispara a avaliação no fluxo normal: ela roda sozinha ao fim de
// cada geração de bruto. O botão de reavaliar existe para quando a skill do
// canal muda e o editor quer a nota nova sem regerar o vídeo.

const ROTULO_VEREDITO: Record<VereditoBruto, string> = {
  coesa: 'Estrutura coesa',
  aceitavel: 'Coesa com ressalvas',
  quebrada: 'Estrutura quebrada',
};

const COR_VEREDITO: Record<VereditoBruto, string> = {
  coesa: 'text-success',
  aceitavel: 'text-warning',
  quebrada: 'text-error',
};

const COR_GRAVIDADE: Record<GravidadeApontamento, string> = {
  leve: 'border-fio-2 text-fg-3',
  media: 'border-warning/50 text-warning',
  grave: 'border-error/60 text-error',
};

// Os três mapas acima são indexados por valor que veio da REDE. O backend
// normaliza para o vocabulário fechado, mas um `Record` indexado fora da chave
// devolve `undefined` em silêncio — e `undefined` num rótulo vira texto vazio na
// tela, sem erro nenhum para investigar depois. O fallback custa uma linha.
const rotuloDoVeredito = (v: VereditoBruto) => ROTULO_VEREDITO[v] ?? v;
const corDoVeredito = (v: VereditoBruto) => COR_VEREDITO[v] ?? COR_VEREDITO.aceitavel;
const corDaGravidade = (g: GravidadeApontamento) => COR_GRAVIDADE[g] ?? COR_GRAVIDADE.media;

function NotaEmEstrelas({ nota }: { nota: number }) {
  return (
    <span className="flex items-center gap-0.5" aria-label={`Nota ${nota} de 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Icon
          key={n}
          name="star"
          className={cn('text-fg-2', n <= nota && 'fill-warning text-warning')}
        />
      ))}
    </span>
  );
}

function Apontamento({ item }: { item: ApontamentoBruto }) {
  return (
    <li className="rounded-md border border-fio-2 bg-poco px-2 py-1.5">
      <div className="flex items-center gap-1.5">
        <span
          className={cn(
            'rounded border px-1 py-px text-micro font-bold tracking-wide',
            corDaGravidade(item.gravidade),
          )}
        >
          {item.gravidade}
        </span>
        <span className="text-micro font-semibold text-fg">{item.rotulo}</span>
        {item.momento && (
          <span className="ml-auto font-mono text-micro text-fg-3">
            {item.momento}
          </span>
        )}
      </div>
      {item.descricao && (
        <p className="mt-1 text-micro leading-snug text-fg-3">{item.descricao}</p>
      )}
    </li>
  );
}

function LinhaDeSerie({ avaliacao }: { avaliacao: AvaliacaoBruto }) {
  const quando = avaliacao.criado_em ? new Date(avaliacao.criado_em).toLocaleString() : '—';
  return (
    <li className="flex items-center gap-2 text-micro text-fg-3">
      <span className="font-bold text-fg">{avaliacao.nota}/5</span>
      <span className={corDoVeredito(avaliacao.veredito)}>{avaliacao.veredito}</span>
      <span className="ml-auto font-mono">{quando}</span>
    </li>
  );
}

interface Props {
  corteId: string;
}

export function AvaliacaoBrutoPanel({ corteId }: Props) {
  const [historicoAberto, setHistoricoAberto] = useState(false);
  const query = useAvaliacaoBruto(corteId);
  const historico = useHistoricoAvaliacaoBruto(corteId, historicoAberto);
  const reavaliar = useReavaliarBruto(corteId);
  const emVoo = providerEmVoo(reavaliar);

  const avaliacao = query.data ?? null;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-2 py-2">
      <div className="flex items-center gap-2">
        <span className="text-micro font-bold tracking-wide text-fg-3">
          Avaliação do bruto
        </span>
        <SeloDeProvider
          provider={providerDoModelo(avaliacao?.modelo)}
          modelo={avaliacao?.modelo}
        />
        <AcaoDeIa
          rotulo="Reavaliar"
          descricao="Reavaliar o bruto sem regerar o vídeo"
          rotuloEmVoo="avaliando…"
          emVoo={emVoo}
          onGerar={(provider) => reavaliar.mutate(provider)}
          className="ml-auto h-6"
        />
      </div>

      {query.isLoading && (
        <p className="text-micro text-fg-3">Carregando avaliação…</p>
      )}

      {reavaliar.isError && (
        <p className="text-micro text-error">{(reavaliar.error as Error).message}</p>
      )}

      {!query.isLoading && !avaliacao && (
        <p className="text-micro leading-snug text-fg-3">
          Ainda sem avaliação. Ela roda sozinha ao final da próxima geração de bruto — ou use
          “reavaliar” para pedir agora.
        </p>
      )}

      {avaliacao && (
        <>
          <div className="flex items-center gap-2">
            <NotaEmEstrelas nota={avaliacao.nota} />
            <span className={cn('text-micro font-semibold', corDoVeredito(avaliacao.veredito))}>
              {rotuloDoVeredito(avaliacao.veredito)}
            </span>
          </div>

          <p className="text-micro text-fg-3">
            {avaliacao.duracao_hms} · {avaliacao.total_emendas} emenda
            {avaliacao.total_emendas === 1 ? '' : 's'} · {Math.round(avaliacao.removido_seg)}s
            removidos
          </p>

          {avaliacao.parecer && (
            <p className="text-micro leading-snug text-fg">{avaliacao.parecer}</p>
          )}

          {avaliacao.apontamentos.length > 0 ? (
            <ul className="flex flex-col gap-1.5">
              {avaliacao.apontamentos.map((item, idx) => (
                <Apontamento key={`${item.tipo}-${item.momento}-${idx}`} item={item} />
              ))}
            </ul>
          ) : (
            <p className="text-micro text-success">Nenhum ponto de quebra apontado.</p>
          )}

          <button
            type="button"
            onClick={() => setHistoricoAberto((v) => !v)}
            className="self-start text-micro text-fg-3 underline-offset-2 hover:underline"
          >
            {historicoAberto ? 'ocultar histórico' : 'ver histórico de notas'}
          </button>

          {historicoAberto && (
            <ul className="flex flex-col gap-1">
              {historico.isLoading && (
                <li className="text-micro text-fg-3">carregando…</li>
              )}
              {(historico.data ?? []).map((item) => (
                <LinhaDeSerie key={item.id} avaliacao={item} />
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
