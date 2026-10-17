import type { Dispatch, SetStateAction } from 'react';
import { Link } from 'react-router-dom';
import { Input } from '@/components/ui/input';
import { AjustesDosCards, TiposDeCard } from '@/features/channels/CardsDoCanal';
import { PainelDoComponente } from '@/features/channels/PalcoDoTipoNoModal';
import { EscolhaDoExemplo } from './ExemploDoCard';
import type { usePalcoDoModal } from '@/features/channels/usePalcoDoModal';
import { cn } from '@/lib/utils';
import { FundoThumb, YOUTUBE_BACKGROUND_OPTIONS } from '@/shared/palco/youtubeBackgrounds';
import type { YoutubeBackgroundId, YoutubePlaca } from '@/shared/palco/youtubeLayout';

// D-927: o conteúdo de cada grupo do modal de posição do horizontal (o menu da
// esquerda escolhe o grupo). Só aparece o que vale no estilo escolhido; no
// padrão global o palco é o do canal e se ajusta pelo botão da tela de Canais,
// que abre este mesmo modal no alvo `canal` (D-938).

const ROTULO = 'mb-1.5 font-code text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--wb-text-dim)]';

export interface ContextoDoPalco {
  palco: ReturnType<typeof usePalcoDoModal>;
  /** O modal do padrão global não muda o palco (é do canal). */
  global: boolean;
  /** D-938: o padrão do canal, aberto pela tela de Canais — só o palco do canal. */
  canal?: boolean;
  /** Segmentos herdam fundo e placa do corte. */
  editavel: boolean;
  fundo: YoutubeBackgroundId;
  placa: YoutubePlaca;
  onFundo: (fundo: YoutubeBackgroundId) => void;
  onPlaca: Dispatch<SetStateAction<YoutubePlaca>>;
  /** D-928: o tipo do card de exemplo desenhado na prévia ('' = nenhum). */
  exemplo?: string;
  onExemplo?: (tipo: string) => void;
}

/** O que o grupo do palco mostra na coluna (fundo, cabeçalho, placa ou cards). */
export function PainelDoPalco({ grupo, ...ctx }: ContextoDoPalco & { grupo: 'fundo' | 'cabecalho' | 'placa' | 'cards' }) {
  const { palco, global, editavel } = ctx;
  const limpo = palco.estilo === 'limpo';
  const doCanal = global ? <AjusteNoCanal /> : null;
  const componente = (aba: 'fundo' | 'cabecalho' | 'placa' | 'cards') =>
    palco.rascunho && palco.efetivo ? (
      <PainelDoComponente aba={aba} tipo="horizontal" rascunho={palco.rascunho} efetivo={palco.efetivo} onMudar={palco.mudar} />
    ) : null;
  if (grupo === 'fundo') {
    if (limpo) return doCanal ?? componente('fundo');
    return editavel ? <FundoDeSempre fundo={ctx.fundo} onFundo={ctx.onFundo} /> : <HerdaDoCorte />;
  }
  if (grupo === 'placa') {
    return (
      <div className="grid gap-3">
        {ctx.canal ? null : editavel ? <TextoDaPlaca placa={ctx.placa} onPlaca={ctx.onPlaca} /> : <HerdaDoCorte />}
        {limpo && (doCanal ?? componente('placa'))}
      </div>
    );
  }
  if (grupo === 'cards') {
    const exemplo = palco.efetivo && ctx.onExemplo && (
      <EscolhaDoExemplo tipos={palco.efetivo.tipos_de_cena} valor={ctx.exemplo ?? ''} onEscolher={ctx.onExemplo} />
    );
    return (
      <div className="grid gap-3">
        {exemplo}
        {doCanal ?? (palco.rascunho ? <AjustesDosCards valor={palco.rascunho.cards} onMudar={(cards) => palco.mudar((r) => r && { ...r, cards })} /> : null)}
      </div>
    );
  }
  return doCanal ?? componente(grupo);
}

/** D-927: embaixo da prévia, o que não cabe na coluna — os tipos de card, em várias colunas. */
export function AbaixoDaPrevia({ grupo, palco, global }: Pick<ContextoDoPalco, 'palco' | 'global'> & { grupo: string }) {
  if (grupo !== 'cards' || global || !palco.rascunho || !palco.efetivo) return null;
  return (
    <TiposDeCard
      valor={palco.rascunho.cards}
      tipos={palco.efetivo.tipos_de_cena}
      colunas="grid-cols-3 xl:grid-cols-5"
      limpo={palco.rascunho.estilo === 'limpo'}
      onMudar={(cards) => palco.mudar((r) => r && { ...r, cards })}
    />
  );
}

function AjusteNoCanal() {
  return (
    <p className="text-[12px] text-[var(--wb-text-dim)]">
      No padrão global o palco é o do canal.{' '}
      <Link to="/canais" className="text-[var(--wb-accent)] underline-offset-2 hover:underline">
        Edite em Canais → Palco do canal
      </Link>
      .
    </p>
  );
}

function HerdaDoCorte() {
  return <p className="text-[12px] text-[var(--wb-text-dim)]">Neste segmento, fundo e placa vêm do corte.</p>;
}

/** A textura do palco de sempre (o estilo atual). */
export function FundoDeSempre({ fundo, onFundo }: { fundo: YoutubeBackgroundId; onFundo: (fundo: YoutubeBackgroundId) => void }) {
  return (
    <div>
      <div className={ROTULO}>Fundo</div>
        <div className="grid grid-cols-3 gap-1.5">
          {YOUTUBE_BACKGROUND_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              type="button"
              aria-pressed={fundo === opt.id}
              title={opt.descricao}
              onClick={() => onFundo(opt.id)}
              className={cn(
                'flex h-[58px] flex-col items-stretch justify-between gap-1 overflow-hidden rounded-[var(--radius-xs)] border p-1.5 pt-1 text-left transition-colors',
                fundo === opt.id
                  ? 'border-[var(--wb-accent)] bg-[var(--wb-accent-soft)] text-[var(--wb-accent)]'
                  : 'border-[var(--wb-border)] bg-[var(--wb-bg-card)] text-[var(--wb-text-mute)] hover:text-[var(--wb-text)]',
              )}
            >
              <span
                className={cn(
                  'flex flex-1 items-center justify-center overflow-hidden rounded-[3px] border border-[var(--wb-border-soft)]',
                  fundo === opt.id
                    ? 'bg-[var(--wb-bg-card)]'
                    : 'bg-[var(--wb-bg-inset)]',
                )}
              >
                <FundoThumb id={opt.id} />
              </span>
              <span className="truncate text-center text-[11px] font-semibold leading-[1.05]">
                {opt.label}
              </span>
            </button>
          ))}
        </div>
    </div>
  );
}

/** Nome e papel de quem fala, do corte ou do preset. */
export function TextoDaPlaca({ placa, onPlaca }: { placa: YoutubePlaca; onPlaca: Dispatch<SetStateAction<YoutubePlaca>> }) {
  return (
    <div>
      <div className={ROTULO}>Placa de nome</div>
        <div className="grid gap-1.5">
          <label className="flex flex-col gap-0.5 font-code text-[11px] uppercase tracking-[0.08em] text-[var(--wb-text-dim)]">
            Nome
            <Input
              value={placa.nome}
              maxLength={80}
              placeholder="Ex.: Nome do Apresentador"
              onChange={(event) =>
                onPlaca((current) => ({ ...current, nome: event.target.value }))
              }
              className="h-7 text-[11.5px]"
            />
          </label>
          <label className="flex flex-col gap-0.5 font-code text-[11px] uppercase tracking-[0.08em] text-[var(--wb-text-dim)]">
            Papel
            <Input
              value={placa.papel}
              maxLength={80}
              placeholder="Ex.: CTO"
              onChange={(event) =>
                onPlaca((current) => ({ ...current, papel: event.target.value }))
              }
              className="h-7 text-[11.5px]"
            />
          </label>
        </div>
    </div>
  );
}
