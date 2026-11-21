import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Selo } from '@/components/ui/selo';
import { cn } from '@/lib/utils';
import type { Novidade } from './api';
import { passosDoComoUsar, rotuloDaCategoria, textoCorrido, trechosComCodigo } from './rotulos';

const SELO_DO_TOM = {
  ok: 'ok',
  info: 'curso',
  warn: 'convite',
  err: 'erro',
  mute: 'inerte',
} as const;

/** Texto com os trechos entre crases em fonte de código, como no CHANGELOG. */
function ComCodigo({ texto }: { texto: string }) {
  return trechosComCodigo(texto).map((trecho, i) =>
    trecho.codigo ? (
      <code key={i} className="rounded-etiqueta bg-poco px-1 font-mono text-pequeno">
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
        'flex flex-col gap-2 rounded-cartao border bg-vidro p-3.5 shadow-topo',
        nova ? 'border-iris-fio' : 'border-fio',
      )}
    >
      <header className="flex flex-wrap items-center gap-1.5">
        <Selo tom={SELO_DO_TOM[tom]}>{rotulo}</Selo>
        {nova && <Selo tom="convite">novo para você</Selo>}
        {!traducao && (
          <span className="text-pequeno text-fg-3">
            {traduzindo ? 'traduzindo…' : 'em inglês, sem tradução ainda'}
          </span>
        )}
      </header>

      <h3 className="text-linha font-semibold leading-snug text-fg">
        {traducao?.titulo ?? novidade.titulo_original}
      </h3>

      {traducao ? (
        <p className="text-corpo leading-relaxed text-fg-2">
          <ComCodigo texto={traducao.resumo} />
        </p>
      ) : (
        <p className="whitespace-pre-line text-corpo leading-relaxed text-fg-2">
          <ComCodigo texto={textoCorrido(novidade.texto_original)} />
        </p>
      )}

      {passos.length > 0 && (
        <section className="rounded-bloco bg-poco px-3 py-2">
          <h4 className="mb-1 flex items-center gap-1.5 text-micro text-fg-3">
            <Icon name="info" />
            Como usar
          </h4>
          <ul className="flex list-disc flex-col gap-0.5 pl-5 text-corpo leading-relaxed text-fg">
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
          <Button
            variant="fantasma"
            size="pq"
            onClick={() => setOriginal((aberto) => !aberto)}
            aria-expanded={original}
            className="self-start"
          >
            {original ? 'Esconder o original' : 'Ver o original (inglês)'}
          </Button>
          {original && (
            <p className="whitespace-pre-line text-pequeno leading-relaxed text-fg-3">
              <ComCodigo texto={textoCorrido(novidade.texto_original)} />
            </p>
          )}
        </div>
      )}
    </article>
  );
}
