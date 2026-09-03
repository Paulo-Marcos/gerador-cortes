// D-458: a porta da fábrica de shorts.
//
// A tela lista só os cortes Fire cujo bruto AINDA está em disco. O filtro não é
// detalhe de implementação: é a promessa da tela. Um Fire sem bruto não tem de
// onde recortar short, então listá-lo seria oferecer um caminho que frustra no
// clique.
//
// O trabalho aqui é assíncrono por desenho — os candidatos nascem na geração do
// bruto (E-030) e a curadoria acontece quando o operador quiser.
import { Link } from 'react-router-dom';
import { Clapperboard, Clock, HardDrive } from 'lucide-react';
import { cn, formatarDuracao } from '@/lib/utils';
import { isWorkbenchEnabled } from '@/components/workbench/workbenchFlag';
import type { ContagemShorts, FireComBruto } from './shortsApi';
import { useFires } from './useFires';

const CHIPS: { chave: keyof ContagemShorts; um: string; varios: string; classe: string }[] = [
  { chave: 'sugerido', um: 'sugerido', varios: 'sugeridos', classe: 'text-[var(--wb-text-mute)]' },
  { chave: 'aprovado', um: 'aprovado', varios: 'aprovados', classe: 'text-[var(--wb-ok-ink)]' },
  { chave: 'renderizado', um: 'pronto', varios: 'prontos', classe: 'text-[var(--wb-accent)]' },
];

function ContagemChips({ shorts }: { shorts: ContagemShorts }) {
  if (shorts.total === 0) {
    return (
      <span className="text-[12px] text-[var(--wb-text-mute)]">
        nenhum candidato ainda — gere o bruto de novo para a IA propor
      </span>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      {CHIPS.filter(({ chave }) => shorts[chave] > 0).map(({ chave, um, varios, classe }) => (
        <span key={chave} className={cn('font-code text-[12px] font-semibold tabular-nums', classe)}>
          {shorts[chave]} {shorts[chave] === 1 ? um : varios}
        </span>
      ))}
    </div>
  );
}

function FireCard({ fire }: { fire: FireComBruto }) {
  return (
    <Link
      to={`/shorts/${fire.corte_id}`}
      className="flex flex-col gap-2 rounded-[10px] border border-[var(--wb-border)] bg-[var(--wb-bg-panel)] p-3.5 transition-colors hover:border-[var(--wb-text-dim)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--wb-focus)]"
    >
      <div className="flex items-start gap-2">
        <span aria-hidden className="text-[15px] leading-none">
          🔥
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-[14px] font-bold text-[var(--wb-text)]" title={fire.titulo}>
            {fire.titulo || `Corte ${fire.numero}`}
          </h2>
          <p className="mt-0.5 truncate text-[12px] text-[var(--wb-text-dim)]">
            {fire.projeto_titulo || 'live sem titulo'}
            {fire.tema_central ? ` · ${fire.tema_central}` : ''}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3 font-code text-[11.5px] tabular-nums text-[var(--wb-text-mute)]">
        <span className="inline-flex items-center gap-1">
          <Clock size={12} aria-hidden />
          {formatarDuracao(fire.duracao_seg)}
        </span>
        {/* D-502: sem bruto o corte aparece assim mesmo — dizer "0 MB" seria
            fingir um arquivo. O que ele precisa é de um aviso do que falta. */}
        {fire.tem_bruto ? (
          <span className="inline-flex items-center gap-1">
            <HardDrive size={12} aria-hidden />
            {fire.bruto_mb} MB de bruto
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-[var(--wb-warn-ink)]">
            <HardDrive size={12} aria-hidden />
            sem bruto — será gerado
          </span>
        )}
        {!fire.is_fire && fire.indicado && (
          <span className="rounded-[4px] bg-[var(--wb-bg-inset)] px-1.5 text-[10px] uppercase tracking-wide">
            indicado
          </span>
        )}
      </div>

      <ContagemChips shorts={fire.shorts} />
    </Link>
  );
}

function Vazio() {
  return (
    <div className="mx-auto max-w-md py-16 text-center">
      <span aria-hidden className="text-[32px]">
        🔥
      </span>
      <p className="mt-3 text-[14px] font-semibold text-[var(--wb-text)]">
        Nenhum corte na fábrica de shorts
      </p>
      <p className="mt-2 text-[13px] leading-relaxed text-[var(--wb-text-mute)]">
        Marque um corte com Fire, ou indique um para shorts na tela do corte: a IA propõe os trechos verticais no fim da
        esteira, e eles aparecem aqui para você trabalhar quando quiser.
      </p>
    </div>
  );
}

export default function ShortsPage() {
  const workbench = isWorkbenchEnabled();
  const { data, isLoading, isError, error } = useFires();
  const fires = data?.fires ?? [];

  return (
    <div
      className={cn(
        'flex min-h-0 flex-col overflow-hidden bg-[var(--wb-bg)] text-[var(--wb-text)]',
        // No shell LEGADO a pagina fica ABAIXO de um cabecalho de 3.5rem, e
        // `h-screen` a fazia medir a viewport inteira — transbordando por
        // exatamente a altura desse cabecalho. Com o conteudo rolando dentro
        // (D-499), a ultima linha ficava inalcancavel. No workbench a pagina ja
        // recebe a altura do pai, e `h-full` continua certo.
        workbench ? 'h-full' : 'h-[calc(100vh-3.5rem)]',
      )}
    >
      <header
        className={cn(
          'flex-none border-b border-[var(--wb-border-soft)] bg-[var(--wb-bg)]',
          workbench ? 'px-4 py-3' : 'px-7 py-5',
        )}
      >
        <div className="flex items-center gap-2">
          <Clapperboard size={18} className="text-[var(--wb-accent)]" aria-hidden />
          <h1 className="text-[15px] font-extrabold">Shorts</h1>
          <span className="text-xs text-[var(--wb-text-mute)]">
            cortes Fire com bruto guardado — a nata, pronta para virar vertical
          </span>
        </div>
      </header>

      <main className="flex-1 overflow-auto p-4">
        {isLoading && (
          <p className="py-16 text-center text-[13px] text-[var(--wb-text-mute)]">
            Procurando os Fires…
          </p>
        )}

        {isError && (
          <p className="py-16 text-center text-[13px] text-[var(--wb-danger-ink,var(--wb-text))]">
            Nao consegui carregar os Fires: {(error as Error)?.message ?? 'erro desconhecido'}
          </p>
        )}

        {!isLoading && !isError && fires.length === 0 && <Vazio />}

        {fires.length > 0 && (
          <div className="grid gap-2.5 [grid-template-columns:repeat(auto-fill,minmax(280px,1fr))]">
            {fires.map((fire) => (
              <FireCard key={fire.corte_id} fire={fire} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
