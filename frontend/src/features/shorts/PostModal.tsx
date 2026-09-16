import { useEffect, useState } from 'react';
import { useIsMutating } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { cn } from '@/lib/utils';
import {
  cortePorPlataforma,
  hashtagsDoTexto,
  parteEscondida,
  parteVisivel,
  recadoDoTitulo,
  textoDasHashtags,
  TITULO_MAX,
  tomDoTitulo,
  type TomDoTitulo,
} from './postDoShort';
import {
  gerarPostKey,
  useAtualizarPost,
  useGerarPost,
  usePostDoShort,
} from './useShortsDoCorte';
import { AcaoDeIa } from '@/components/ui/acao-de-ia';
import { SeloDeProvider } from '@/components/ui/selo-provider';
import { providerEmVoo } from '@/lib/providerIa';
import { useUltimaGeracao } from '@/lib/useUltimaGeracao';
import type { ShortSugerido } from './shortsApi';

// D-565 (onda 3): o texto que acompanha o short no feed.
//
// ## Por que esta tela precisava existir
//
// A tabela `metadados_shorts` está no banco desde a D-452 e nunca foi
// preenchida. Até aqui a publicação montava o texto na hora, a partir de
// `titulo_sugerido` e `gancho` — dois campos que a skill de shorts escreve para
// a CURADORIA. Ou seja: o que ia para o feed tinha sido escrito para outro
// leitor (você, na triagem), e ninguém revisava antes de subir.
//
// ## O que a tela mostra e por quê
//
// O título é partido em DOIS pedaços: o que aparece antes do "mais" e o que
// some atrás dele. Um contador diria "62/100" — verdadeiro e inútil. O que
// decide a escrita é saber ONDE o texto é cortado, e isso se vê, não se conta.

const TONS: Record<TomDoTitulo, string> = {
  vazio: 'text-[var(--wb-text-mute)]',
  cabe: 'text-[var(--wb-ok-ink,var(--wb-accent))]',
  corta: 'text-[var(--wb-warn-ink,var(--wb-text-dim))]',
};

interface Props {
  open: boolean;
  onClose: () => void;
  short: ShortSugerido;
}

export function PostModal({ open, onClose, short }: Props) {
  const post = usePostDoShort(short.id, open);
  const gerar = useGerarPost(short.id);
  const salvar = useAtualizarPost(short.id);

  const [titulo, setTitulo] = useState('');
  const [descricao, setDescricao] = useState('');
  const [tags, setTags] = useState('');

  // O que vem do servidor manda enquanto o operador não digita. Sem isto, gerar
  // pela IA atualizaria o cache e os campos continuariam com o texto antigo —
  // ele veria o botão "funcionar" sem nada mudar na tela.
  useEffect(() => {
    if (!open || !post.data) return;
    setTitulo(post.data.titulo);
    setDescricao(post.data.descricao);
    setTags(textoDasHashtags(post.data.hashtags));
  }, [open, post.data]);

  // O Finalizar manda a IA escrever sozinho, numa mutation de outro componente.
  // Abrir o modal no meio disso tem de mostrar "escrevendo…", e não campos
  // vazios com um botão que dispararia uma segunda escrita por cima.
  const escrevendoPorFora = useIsMutating({ mutationKey: gerarPostKey(short.id) }) > 0;
  const escrevendo = gerar.isPending || escrevendoPorFora;
  // O Finalizar escreve por fora, e sempre pelo Claude: lá não há botão.
  const emVoo = providerEmVoo(gerar) ?? (escrevendoPorFora ? 'claude' : null);
  // Quem escreveu o texto que está na tela: esta geração, ou a última registrada.
  const ultima = useUltimaGeracao('metadados-short-expert', { shortId: short.id }, open);
  const geradoPor = gerar.variables ?? ultima.data?.provider ?? null;

  const tom = tomDoTitulo(titulo);
  const hashtags = hashtagsDoTexto(tags);
  const ocupado = escrevendo || salvar.isPending;

  return (
    <Modal open={open} onClose={onClose} title="Escrever o post deste short" size="2xl">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <AcaoDeIa
            rotulo={post.data?.gerado ? 'Escrever de novo' : 'Escrever o post'}
            descricao="Escrever o post do short"
            rotuloEmVoo="escrevendo…"
            emVoo={emVoo}
            desabilitado={ocupado}
            onGerar={(provider) => gerar.mutate(provider)}
          />
          {!escrevendo && post.data?.gerado && (
            <SeloDeProvider provider={geradoPor} modelo={ultima.data?.model} />
          )}
          {escrevendo && (
            <span className="text-[11.5px] text-[var(--wb-text-mute)]">
              lendo a transcrição deste trecho…
            </span>
          )}
          {gerar.isError && (
            <span className="text-[11.5px] text-[var(--wb-text-dim)]">
              {(gerar.error as Error)?.message ?? 'não consegui escrever'}
            </span>
          )}
        </div>

        <section className="space-y-2 border-t border-[var(--wb-border-soft)] pt-3">
          <label
            htmlFor="post-titulo"
            className="block text-[12.5px] font-semibold text-[var(--wb-text)]"
          >
            Título
          </label>
          <input
            id="post-titulo"
            value={titulo}
            onChange={(e) => setTitulo(e.target.value.slice(0, TITULO_MAX))}
            placeholder="o que aparece abaixo do vídeo"
            className="w-full rounded-[8px] border border-[var(--wb-border)] bg-[var(--wb-bg-inset)] px-2.5 py-2 text-[14px] font-semibold text-[var(--wb-text)] outline-none focus:border-[var(--wb-accent)]"
          />
          {/* O corte visto, não contado: um "62/100" é verdadeiro e não ajuda
              a decidir onde pôr o peso da frase. */}
          {titulo.trim() && (
            <p className="rounded-[6px] bg-[var(--wb-bg-inset)] px-2 py-1.5 text-[12.5px] leading-snug">
              <span className="text-[var(--wb-text)]">{parteVisivel(titulo)}</span>
              {parteEscondida(titulo) && (
                <>
                  <span className="text-[var(--wb-text-mute)]">{parteEscondida(titulo)}</span>
                  <span className="ml-1 font-code text-[10px] uppercase text-[var(--wb-text-mute)]">
                    ← só depois do “mais”
                  </span>
                </>
              )}
            </p>
          )}
          <p className={cn('text-[11.5px] leading-relaxed', TONS[tom])}>{recadoDoTitulo(tom)}</p>
        </section>

        <section className="space-y-2 border-t border-[var(--wb-border-soft)] pt-3">
          <label
            htmlFor="post-descricao"
            className="block text-[12.5px] font-semibold text-[var(--wb-text)]"
          >
            Descrição
          </label>
          <textarea
            id="post-descricao"
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
            rows={3}
            placeholder="o contexto de quem já parou"
            className="w-full resize-none rounded-[8px] border border-[var(--wb-border)] bg-[var(--wb-bg-inset)] px-2.5 py-2 text-[13px] leading-relaxed text-[var(--wb-text)] outline-none focus:border-[var(--wb-accent)]"
          />
          <p className="text-[11.5px] leading-relaxed text-[var(--wb-text-mute)]">
            Não escreva o link do corte longo: o sistema o acrescenta sozinho quando o corte já
            está publicado.
          </p>
        </section>

        <section className="space-y-2 border-t border-[var(--wb-border-soft)] pt-3">
          <label
            htmlFor="post-tags"
            className="block text-[12.5px] font-semibold text-[var(--wb-text)]"
          >
            Hashtags
          </label>
          <input
            id="post-tags"
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            placeholder="juros financiamento economia"
            className="w-full rounded-[8px] border border-[var(--wb-border)] bg-[var(--wb-bg-inset)] px-2.5 py-2 font-code text-[12.5px] text-[var(--wb-text)] outline-none focus:border-[var(--wb-accent)]"
          />
          {/* Cada plataforma corta num ponto. Sem isto o operador escreve dez
              achando que todas valem em todo lugar. */}
          {hashtags.length > 0 && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-code text-[11px] tabular-nums text-[var(--wb-text-mute)]">
              {cortePorPlataforma(hashtags.length).map(({ plataforma, usa }) => (
                <span key={plataforma}>
                  {plataforma}: <span className="text-[var(--wb-text-dim)]">{usa}</span>
                  {usa < hashtags.length && ` de ${hashtags.length}`}
                </span>
              ))}
            </div>
          )}
        </section>

        <div className="flex flex-wrap items-center gap-2 border-t border-[var(--wb-border-soft)] pt-3">
          <Button
            size="sm"
            disabled={ocupado}
            onClick={() => {
              salvar.mutate({ titulo, descricao, hashtags });
              onClose();
            }}
          >
            Gravar o post
          </Button>
          {/* Sem post escrito a publicação NÃO quebra — ela cai no texto da
              curadoria, como sempre fez. Dizer isso aqui evita a leitura de que
              esta etapa virou obrigatória. */}
          {!post.data?.gerado && (
            <span className="text-[11.5px] leading-relaxed text-[var(--wb-text-mute)]">
              Sem isto, a publicação usa “{short.titulo}”.
            </span>
          )}
          {salvar.isError && (
            <span className="text-[11.5px] text-[var(--wb-text-dim)]">
              {(salvar.error as Error)?.message ?? 'não consegui gravar'}
            </span>
          )}
        </div>
      </div>
    </Modal>
  );
}
