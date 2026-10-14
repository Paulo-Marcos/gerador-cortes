import { useState } from 'react';
import { cn } from '@/lib/utils';
import { Icon } from '@/upgrade/Icon';
import type { Novidade } from './api';
import { passosDoComoUsar, rotuloDaCategoria, textoCorrido, trechosComCodigo } from './rotulos';

const COR_DO_TOM = {
  ok: 'bg-[var(--wb-ok-soft)] text-[var(--wb-ok)]',
  info: 'bg-[var(--wb-info-soft)] text-[var(--wb-info)]',
  warn: 'bg-[var(--wb-warn-soft)] text-[var(--wb-warn)]',
  err: 'bg-[var(--wb-err-soft)] text-[var(--wb-err)]',
  mute: 'bg-[var(--wb-bg-inset)] text-[var(--wb-text-mute)]',
} as const;

/** Texto com os trechos entre crases em fonte de código, como no CHANGELOG. */
function ComCodigo({ texto }: { texto: string }) {
  return trechosComCodigo(texto).map((trecho, i) =>
    trecho.codigo ? (
      <code key={i} className="rounded bg-[var(--wb-bg-inset)] px-1 font-code text-[11px]">
        {trecho.texto}
      </code>
    ) : (
      <span key={i}>{trecho.texto}</span>
    ),
  );
}

type Props = { novidade: Novidade; nova: boolean; traduzindo: boolean };

/** Uma entrada do CHANGELOG, contada para quem usa o app. */
export function CartaoDaNovidade({ novidade, nova, traduzindo }: Props) {
  const [original, setOriginal] = useState(false);
  const { rotulo, tom } = rotuloDaCategoria(novidade.categoria);
  const traducao = novidade.traducao;
  const passos = traducao ? passosDoComoUsar(traducao.como_usar) : [];

  return (
    <article
      aria-label={traducao?.titulo ?? novidade.titulo_original}
      className={cn(
        'flex flex-col gap-2 rounded-lg border bg-[var(--wb-bg-panel)] p-3.5',
        nova ? 'border-[var(--wb-accent)]' : 'border-[var(--wb-border)]',
      )}
    >
      <header className="flex flex-wrap items-center gap-1.5">
        <span className={cn('rounded px-1.5 py-0.5 text-[11px] font-bold', COR_DO_TOM[tom])}>
          {rotulo}
        </span>
        {nova && (
          <span className="rounded bg-[var(--wb-accent)] px-1.5 py-0.5 text-[11px] font-bold text-[var(--wb-accent-fg)]">
            novo para você
          </span>
        )}
        {!traducao && (
          <span className="text-[11px] text-[var(--wb-text-mute)]">
            {traduzindo ? 'traduzindo…' : 'em inglês, sem tradução ainda'}
          </span>
        )}
      </header>

      <h3 className="text-[14px] font-bold leading-snug">
        {traducao?.titulo ?? novidade.titulo_original}
      </h3>

      {traducao ? (
        <p className="text-[12.5px] leading-relaxed text-[var(--wb-text-mute)]">
          <ComCodigo texto={traducao.resumo} />
        </p>
      ) : (
        <p className="whitespace-pre-line text-[12px] leading-relaxed text-[var(--wb-text-mute)]">
          <ComCodigo texto={textoCorrido(novidade.texto_original)} />
        </p>
      )}

      {passos.length > 0 && (
        <section className="rounded-md bg-[var(--wb-bg-inset)] px-3 py-2">
          <h4 className="mb-1 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-[var(--wb-text-mute)]">
            <Icon name="info" />
            Como usar
          </h4>
          <ul className="flex list-disc flex-col gap-0.5 pl-5 text-[12.5px] leading-relaxed">
            {passos.map((passo) => (
              <li key={passo}>
                <ComCodigo texto={passo} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {traducao && (
        <div className="flex flex-col gap-1">
          <button
            type="button"
            onClick={() => setOriginal((aberto) => !aberto)}
            aria-expanded={original}
            className="self-start text-[11px] font-semibold text-[var(--wb-text-mute)] hover:text-[var(--wb-text)]"
          >
            {original ? 'Esconder o original' : 'Ver o original (inglês)'}
          </button>
          {original && (
            <p className="whitespace-pre-line text-[11.5px] leading-relaxed text-[var(--wb-text-mute)]">
              <ComCodigo texto={textoCorrido(novidade.texto_original)} />
            </p>
          )}
        </div>
      )}
    </article>
  );
}
