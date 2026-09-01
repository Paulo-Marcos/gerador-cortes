// D-459: a curadoria dos candidatos de um Fire.
//
// A premissa editorial manda no desenho: o corte Fire já passou pelo funil
// inteiro, então esta tela não é de garimpo — é de ESCOLHA ENTRE BONS. Por isso
// tudo que o operador precisa para decidir (gancho, nota, justificativa,
// duração) fica visível sem clique, e a ação principal — assistir ao trecho —
// está a um botão de distância.
import { useCallback, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Check,
  Clapperboard,
  Crop,
  MoveHorizontal,
  Play,
  Clapperboard as Render,
  Trash2,
  Undo2,
  X,
} from 'lucide-react';
import { cn, formatarDuracao } from '@/lib/utils';
import { isWorkbenchEnabled } from '@/components/workbench/workbenchFlag';
import { brutoUrl, type ShortSugerido, type StatusShort } from './shortsApi';
import { avisoDescarteBruto } from './descarteBruto';
import { PainelPublicacao } from './PainelPublicacao';
import { useFires } from './useFires';
import {
  useAtualizarShort,
  useDescartarBruto,
  useRenderizarShort,
  useShortsDoCorte,
} from './useShortsDoCorte';

const ROTULO_STATUS: Record<StatusShort, string> = {
  sugerido: 'sugerido',
  aprovado: 'aprovado',
  rejeitado: 'rejeitado',
  renderizado: 'pronto',
};

const CLASSE_STATUS: Record<StatusShort, string> = {
  sugerido: 'text-[var(--wb-text-mute)]',
  aprovado: 'text-[var(--wb-ok-ink)]',
  rejeitado: 'text-[var(--wb-text-dim)] line-through',
  renderizado: 'text-[var(--wb-accent)]',
};

/** Quanto cada clique move o enquadramento. 5% do quadro = ~96px em 1920. */
const PASSO_FOCO = 0.05;

function mmss(segundos: number): string {
  const total = Math.max(0, Math.round(segundos));
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

interface CandidatoProps {
  short: ShortSugerido;
  /** Destaca o candidato que está tocando agora. */
  emFoco: boolean;
  ocupado: boolean;
  onTocar: () => void;
  onStatus: (status: StatusShort) => void;
  onBorda: (campo: 'inicio_seg' | 'fim_seg') => void;
  onFoco: (delta: number) => void;
  onRenderizar: () => void;
}

// O destaque segue o que está TOCANDO, não um clique de seleção à parte: um
// clique que só pinta a borda não decide nada, e um `onClick` no card exigiria
// foco e teclado para não deixar o teclado de fora.
function Candidato({
  short,
  emFoco,
  ocupado,
  onTocar,
  onStatus,
  onBorda,
  onFoco,
  onRenderizar,
}: CandidatoProps) {
  const rejeitado = short.status === 'rejeitado';

  return (
    <article
      className={cn(
        'rounded-[10px] border bg-[var(--wb-bg-panel)] p-3 transition-colors',
        emFoco ? 'border-[var(--wb-accent)]' : 'border-[var(--wb-border)]',
        rejeitado && 'opacity-60',
      )}
    >
      <div className="flex items-start gap-2">
        <span className="font-code text-[15px] font-bold tabular-nums text-[var(--wb-accent)]">
          {short.score.toFixed(1)}
        </span>
        <div className="min-w-0 flex-1">
          <h3
            className={cn('truncate text-[13.5px] font-bold', CLASSE_STATUS[short.status])}
            title={short.titulo}
          >
            {short.titulo}
          </h3>
          {short.gancho && (
            <p className="mt-0.5 line-clamp-2 text-[12px] italic text-[var(--wb-text-dim)]">
              “{short.gancho}”
            </p>
          )}
        </div>
        <span className="flex-none font-code text-[10.5px] uppercase tracking-wide text-[var(--wb-text-mute)]">
          {ROTULO_STATUS[short.status]}
        </span>
      </div>

      {short.justificativa && (
        <p className="mt-2 text-[12px] leading-relaxed text-[var(--wb-text-mute)]">
          {short.justificativa}
        </p>
      )}

      <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 font-code text-[11.5px] tabular-nums text-[var(--wb-text-mute)]">
        <span>
          {mmss(short.inicio_seg)} → {mmss(short.fim_seg)}
        </span>
        <span className="font-semibold text-[var(--wb-text-dim)]">
          {Math.round(short.duracao_seg)}s
        </span>
        {/* D-464: o enquadramento 9:16. Sem ajuste, segue a facecam do layout. */}
        <span className="inline-flex items-center gap-1" title="Enquadramento horizontal do 9:16">
          <Crop size={11} aria-hidden />
          {Math.round(short.foco_efetivo * 100)}%
          {short.foco_x !== null && <span className="text-[var(--wb-accent)]">·ajustado</span>}
        </span>
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        <BotaoAcao onClick={onTocar} disabled={ocupado} icon={<Play size={12} />}>
          tocar trecho
        </BotaoAcao>
        <BotaoAcao onClick={() => onBorda('inicio_seg')} disabled={ocupado}>
          início aqui
        </BotaoAcao>
        <BotaoAcao onClick={() => onBorda('fim_seg')} disabled={ocupado}>
          fim aqui
        </BotaoAcao>
        <BotaoAcao
          onClick={() => onFoco(-PASSO_FOCO)}
          disabled={ocupado}
          icon={<MoveHorizontal size={12} />}
        >
          ←
        </BotaoAcao>
        <BotaoAcao onClick={() => onFoco(PASSO_FOCO)} disabled={ocupado}>
          →
        </BotaoAcao>
        <div className="flex-1" />
        {short.status !== 'aprovado' && (
          <BotaoAcao onClick={() => onStatus('aprovado')} disabled={ocupado} icon={<Check size={12} />}>
            aprovar
          </BotaoAcao>
        )}
        {short.status === 'sugerido' && (
          <BotaoAcao onClick={() => onStatus('rejeitado')} disabled={ocupado} icon={<X size={12} />}>
            rejeitar
          </BotaoAcao>
        )}
        {short.status !== 'sugerido' && (
          <BotaoAcao onClick={() => onStatus('sugerido')} disabled={ocupado} icon={<Undo2 size={12} />}>
            voltar
          </BotaoAcao>
        )}
        {short.status === 'aprovado' && (
          <BotaoAcao onClick={onRenderizar} disabled={ocupado} icon={<Render size={12} />}>
            renderizar
          </BotaoAcao>
        )}
      </div>

      {/* D-468/469/470: so ha o que publicar depois do render. */}
      {short.status === 'renderizado' && <PainelPublicacao shortId={short.id} />}
    </article>
  );
}

function BotaoAcao({
  onClick,
  disabled,
  icon,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="inline-flex items-center gap-1 rounded-[6px] bg-[var(--wb-bg-inset)] px-2 py-1 text-[11.5px] font-semibold text-[var(--wb-text-dim)] transition-colors hover:text-[var(--wb-text)] disabled:cursor-not-allowed disabled:opacity-45"
    >
      {icon}
      {children}
    </button>
  );
}

export default function FireDetalhePage() {
  const workbench = isWorkbenchEnabled();
  const { corteId = '' } = useParams();
  const navigate = useNavigate();
  const video = useRef<HTMLVideoElement>(null);
  const [tocando, setTocando] = useState<string | null>(null);

  const { data, isLoading, isError, error } = useShortsDoCorte(corteId);
  const fires = useFires();
  const atualizar = useAtualizarShort(corteId);
  const descartar = useDescartarBruto();
  const renderizar = useRenderizarShort(corteId);

  const shorts = useMemo(() => data?.shorts ?? [], [data]);
  const fire = fires.data?.fires.find((f) => f.corte_id === corteId);

  const tocarTrecho = useCallback((short: ShortSugerido) => {
    const el = video.current;
    if (!el) return;
    el.currentTime = short.inicio_seg;
    void el.play();
  }, []);

  // O tempo corrente do player é a fonte da borda nova: o operador acabou de
  // ver onde o trecho deveria começar ou terminar, então pedir que ele digite
  // um número seria fazê-lo traduzir o que já sabe.
  // O enquadramento se ajusta a partir do EFETIVO, nao do zero: o operador
  // empurra o que esta vendo, e o primeiro clique num short sem ajuste parte da
  // facecam do layout em vez de pular para o meio do quadro.
  const moverFoco = useCallback(
    (short: ShortSugerido, delta: number) => {
      const alvo = Math.min(1, Math.max(0, short.foco_efetivo + delta));
      atualizar.mutate({ shortId: short.id, foco_x: Number(alvo.toFixed(3)) });
    },
    [atualizar],
  );

  const moverBorda = useCallback(
    (short: ShortSugerido, campo: 'inicio_seg' | 'fim_seg') => {
      const el = video.current;
      if (!el) return;
      atualizar.mutate({ shortId: short.id, [campo]: Number(el.currentTime.toFixed(2)) });
    },
    [atualizar],
  );

  // Descartar tira o Fire da lista, entao a tela em que estamos deixa de fazer
  // sentido — voltar para /shorts e a continuacao honesta da acao.
  const onDescartar = () => {
    if (!fire) return;
    if (!confirm(avisoDescarteBruto(fire.titulo || `Corte ${fire.numero}`, fire.bruto_mb))) return;
    descartar.mutate(corteId, { onSuccess: () => navigate('/shorts') });
  };

  return (
    <div
      className={cn(
        'flex min-h-0 flex-col overflow-hidden bg-[var(--wb-bg)] text-[var(--wb-text)]',
        workbench ? 'h-full' : 'h-screen',
      )}
    >
      <header
        className={cn(
          'flex-none border-b border-[var(--wb-border-soft)]',
          workbench ? 'px-4 py-3' : 'px-7 py-5',
        )}
      >
        <div className="flex items-center gap-2">
          <Link
            to="/shorts"
            className="inline-flex items-center gap-1 text-[12px] text-[var(--wb-text-mute)] hover:text-[var(--wb-text)]"
          >
            <ArrowLeft size={14} aria-hidden />
            Shorts
          </Link>
          <span className="text-[var(--wb-text-mute)]">/</span>
          <Clapperboard size={16} className="text-[var(--wb-accent)]" aria-hidden />
          <h1 className="truncate text-[15px] font-extrabold">
            {fire?.titulo || 'Candidatos do Fire'}
          </h1>
          {fire && (
            <span className="truncate text-xs text-[var(--wb-text-mute)]">
              {fire.projeto_titulo} · bruto de {formatarDuracao(fire.duracao_seg)}
            </span>
          )}
          <div className="flex-1" />
          {fire && (
            <BotaoAcao
              onClick={onDescartar}
              disabled={descartar.isPending}
              icon={<Trash2 size={12} />}
            >
              descartar bruto ({fire.bruto_mb} MB)
            </BotaoAcao>
          )}
        </div>
      </header>

      <main className="grid min-h-0 flex-1 gap-4 overflow-hidden p-4 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-h-0">
          <video
            ref={video}
            src={brutoUrl(corteId)}
            controls
            className="max-h-full w-full rounded-[10px] bg-black"
          />
        </div>

        <aside className="flex min-h-0 flex-col gap-2 overflow-auto">
          {isLoading && (
            <p className="py-8 text-center text-[13px] text-[var(--wb-text-mute)]">
              Carregando candidatos…
            </p>
          )}

          {/* Falha de rede NAO pode se parecer com "nao ha candidatos": a primeira
              pede para tentar de novo, a segunda pede para gerar o bruto. */}
          {isError && (
            <p className="py-8 text-center text-[13px] leading-relaxed text-[var(--wb-text-dim)]">
              Nao consegui carregar os candidatos: {(error as Error)?.message ?? 'erro desconhecido'}
            </p>
          )}

          {!isLoading && !isError && shorts.length === 0 && (
            <p className="py-8 text-center text-[13px] leading-relaxed text-[var(--wb-text-mute)]">
              Nenhum candidato ainda. Gere o bruto de novo para a IA propor os trechos.
            </p>
          )}

          {shorts.map((short) => (
            <Candidato
              key={short.id}
              short={short}
              emFoco={tocando === short.id}
              ocupado={atualizar.isPending || renderizar.isPending}
              onTocar={() => {
                setTocando(short.id);
                tocarTrecho(short);
              }}
              onStatus={(status) => atualizar.mutate({ shortId: short.id, status })}
              onBorda={(campo) => moverBorda(short, campo)}
              onFoco={(delta) => moverFoco(short, delta)}
              onRenderizar={() => renderizar.mutate(short.id)}
            />
          ))}

          {atualizar.isError && (
            <p className="rounded-[8px] bg-[var(--wb-bg-inset)] p-2 text-[12px] text-[var(--wb-text-dim)]">
              {(atualizar.error as Error)?.message ?? 'nao consegui salvar'}
            </p>
          )}
        </aside>
      </main>
    </div>
  );
}
