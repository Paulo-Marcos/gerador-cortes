import { useState } from 'react';
import { Star } from 'lucide-react';
import { cn } from '@/lib/utils';
import type {
  ApontamentoBruto,
  AvaliacaoBruto,
  GravidadeApontamento,
  VereditoBruto,
} from '@/lib/avaliacaoBrutoApi';
import {
  useAvaliacaoBruto,
  useHistoricoAvaliacaoBruto,
  useReavaliarBruto,
} from './useAvaliacaoBruto';
import { AcaoDeIa } from '@/components/ui/acao-de-ia';
import { SeloDeProvider } from '@/components/ui/selo-provider';
import { providerDoModelo, providerEmVoo } from '@/lib/providerIa';

// D-447: o parecer automático sobre a ESTRUTURA do bruto — nota, veredito e os
// pontos que não fecham. Irmão do D-419 (voto humano sobre a PROPOSTA): este lê
// o resultado, aquele lê a intenção.
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
  coesa: 'text-emerald-300',
  aceitavel: 'text-amber-300',
  quebrada: 'text-rose-300',
};

const COR_GRAVIDADE: Record<GravidadeApontamento, string> = {
  leve: 'border-[var(--wb-border)] text-[var(--wb-text-dim)]',
  media: 'border-amber-400/50 text-amber-200',
  grave: 'border-rose-400/60 text-rose-200',
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
        <Star
          key={n}
          size={14}
          aria-hidden
          className={cn(
            'text-[var(--wb-text-mute)]',
            n <= nota && 'fill-amber-300 text-amber-300',
          )}
        />
      ))}
    </span>
  );
}

function Apontamento({ item }: { item: ApontamentoBruto }) {
  return (
    <li className="rounded-md border border-[var(--wb-border)] bg-[var(--wb-bg-inset)] px-2 py-1.5">
      <div className="flex items-center gap-1.5">
        <span
          className={cn(
            'rounded border px-1 py-px text-[9px] font-bold uppercase tracking-wide',
            corDaGravidade(item.gravidade),
          )}
        >
          {item.gravidade}
        </span>
        <span className="text-[11px] font-semibold text-[var(--wb-text)]">{item.rotulo}</span>
        {item.momento && (
          <span className="ml-auto font-mono text-[10px] text-[var(--wb-text-dim)]">
            {item.momento}
          </span>
        )}
      </div>
      {item.descricao && (
        <p className="mt-1 text-[11px] leading-snug text-[var(--wb-text-dim)]">{item.descricao}</p>
      )}
    </li>
  );
}

function LinhaDeSerie({ avaliacao }: { avaliacao: AvaliacaoBruto }) {
  const quando = avaliacao.criado_em ? new Date(avaliacao.criado_em).toLocaleString() : '—';
  return (
    <li className="flex items-center gap-2 text-[10.5px] text-[var(--wb-text-dim)]">
      <span className="font-bold text-[var(--wb-text)]">{avaliacao.nota}/5</span>
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
        <span className="text-[10px] font-bold uppercase tracking-wide text-[var(--wb-text-dim)]">
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
        <p className="text-[11px] text-[var(--wb-text-dim)]">Carregando avaliação…</p>
      )}

      {reavaliar.isError && (
        <p className="text-[11px] text-rose-300">{(reavaliar.error as Error).message}</p>
      )}

      {!query.isLoading && !avaliacao && (
        <p className="text-[11px] leading-snug text-[var(--wb-text-dim)]">
          Ainda sem avaliação. Ela roda sozinha ao final da próxima geração de bruto — ou use
          “reavaliar” para pedir agora.
        </p>
      )}

      {avaliacao && (
        <>
          <div className="flex items-center gap-2">
            <NotaEmEstrelas nota={avaliacao.nota} />
            <span className={cn('text-[11px] font-semibold', corDoVeredito(avaliacao.veredito))}>
              {rotuloDoVeredito(avaliacao.veredito)}
            </span>
          </div>

          <p className="text-[10.5px] text-[var(--wb-text-dim)]">
            {avaliacao.duracao_hms} · {avaliacao.total_emendas} emenda
            {avaliacao.total_emendas === 1 ? '' : 's'} · {Math.round(avaliacao.removido_seg)}s
            removidos
          </p>

          {avaliacao.parecer && (
            <p className="text-[11.5px] leading-snug text-[var(--wb-text)]">{avaliacao.parecer}</p>
          )}

          {avaliacao.apontamentos.length > 0 ? (
            <ul className="flex flex-col gap-1.5">
              {avaliacao.apontamentos.map((item, idx) => (
                <Apontamento key={`${item.tipo}-${item.momento}-${idx}`} item={item} />
              ))}
            </ul>
          ) : (
            <p className="text-[11px] text-emerald-300">Nenhum ponto de quebra apontado.</p>
          )}

          <button
            type="button"
            onClick={() => setHistoricoAberto((v) => !v)}
            className="self-start text-[10.5px] text-[var(--wb-text-dim)] underline-offset-2 hover:underline"
          >
            {historicoAberto ? 'ocultar histórico' : 'ver histórico de notas'}
          </button>

          {historicoAberto && (
            <ul className="flex flex-col gap-1">
              {historico.isLoading && (
                <li className="text-[10.5px] text-[var(--wb-text-dim)]">carregando…</li>
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
