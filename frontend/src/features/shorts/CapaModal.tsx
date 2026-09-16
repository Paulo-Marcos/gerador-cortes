import { useEffect, useRef, useState } from 'react';
import {
  Camera,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  Loader2,
  Sparkles,
  Upload,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { GeminiAiButton } from '@/components/ui/gemini-button';
import { SeloDeProvider } from '@/components/ui/selo-provider';
import { providerEmVoo } from '@/lib/providerIa';
import { useUltimaGeracao } from '@/lib/useUltimaGeracao';
import { Modal } from '@/components/ui/modal';
import { capaImagemUrl, shortVideoUrl, type ShortSugerido } from './shortsApi';
import {
  comSegundos,
  FRACAO_CORTADA,
  instanteDaPosicao,
  instanteEm,
  PASSO_GROSSO_SEG,
  PASSO_SEG,
  posicaoNaRegua,
  recadoDoInstante,
} from './capaDoShort';
import { alvoEditavel, imagemDoColar } from './imagemDaAreaDeTransferencia';
import {
  useCapaDoShort,
  useGerarCapa,
  useGerarPromptDaCapa,
  usePromptDaCapa,
  useSubirArteDaCapa,
} from './useShortsDoCorte';

// D-565 (onda 4): escolher o quadro de capa do short.
//
// ## O que esta tela existe para mostrar
//
// Uma coisa só: **a vitrine do perfil recorta a capa em 3:4**. Um quadro
// perfeito com o rosto no rodapé vira, na grade, um quadro sem rosto — e o
// operador só descobriria depois de publicado.
//
// Por isso as faixas perdidas aparecem escurecidas POR CIMA da prévia, e não
// como um texto dizendo "cuidado com as bordas". A regra é a mesma do modal do
// gancho: o que se decide olhando não se resolve lendo.
//
// ## Por que o player e não a imagem
//
// A escolha do instante precisa ser contínua — varrer o short, parar, ajustar
// um décimo. Um `<video>` posicionado por `currentTime` faz isso de graça e sem
// ida ao servidor a cada passo. A imagem gravada só aparece depois, como prova
// do que foi salvo.
//
// ## D-581: por que agora há DOIS caminhos
//
// Porque "o melhor quadro do vídeo" e "a melhor capa" nem sempre são a mesma
// coisa. Na grade de um perfil, disputando com dezenas de miniaturas, uma arte
// composta para ser vista pequena ganha de um frame de alguém falando — e
// nenhum instante do vídeo vira essa arte.
//
// Os dois convivem e gravam no MESMO campo (`capa_path`): para quem publica é
// um arquivo só, e mantê-los em paralelo obrigaria a tela a perguntar qual vale
// na hora de subir. O que muda é a origem, e as abas dizem qual é.
//
// O app não desenha: ele escreve o prompt, o operador gera no agente capista
// dele e sobe a arte de volta. Mesma divisão da capa do TikTok (D-524).


/** D-581: de onde a capa vem. Duas origens, um só arquivo no fim. */
type Origem = 'quadro' | 'arte';

const ABAS: { id: Origem; rotulo: string; nota: string }[] = [
  { id: 'quadro', rotulo: 'Quadro do vídeo', nota: 'escolha um instante do short' },
  { id: 'arte', rotulo: 'Arte desenhada', nota: 'gere o prompt e suba a imagem' },
];

interface Props {
  open: boolean;
  onClose: () => void;
  short: ShortSugerido;
}

export function CapaModal({ open, onClose, short }: Props) {
  const capa = useCapaDoShort(short.id, open);
  const gerar = useGerarCapa(short.id);
  // Mora aqui, e não no `ArteDaCapa`: o Ctrl+V vale nas duas abas, e o
  // "subindo…" precisa ser o do MESMO envio que o colar disparou.
  const subir = useSubirArteDaCapa(short.id);
  const video = useRef<HTMLVideoElement>(null);
  const [seg, setSeg] = useState(0);
  const [origem, setOrigem] = useState<Origem>('quadro');
  const { mutate: subirArte } = subir;

  // D-586: Ctrl+V com uma imagem vira a arte da capa. Escuta a janela porque o
  // foco pode estar em qualquer lugar do modal — exigir clicar numa "área de
  // colar" antes seria o mesmo passo a mais que o atalho existe para tirar.
  // Colar imagem é, por definição, trazer uma arte: por isso a aba muda sozinha.
  useEffect(() => {
    if (!open) return;
    const aoColar = (evento: ClipboardEvent) => {
      if (alvoEditavel(evento.target)) return;
      const arquivo = imagemDoColar(Array.from(evento.clipboardData?.items ?? []));
      if (!arquivo) return;
      evento.preventDefault();
      setOrigem('arte');
      subirArte(arquivo);
    };
    window.addEventListener('paste', aoColar);
    return () => window.removeEventListener('paste', aoColar);
  }, [open, subirArte]);

  const duracao = capa.data?.duracao_seg ?? 0;
  const ganchoAte = capa.data?.gancho_ate_seg ?? 0;
  const instante = instanteEm(seg, duracao, ganchoAte);

  // Abrir no instante certo: o gravado quando já há capa, o sugerido quando
  // não. Sem isto o operador começaria sempre do quadro zero e teria de
  // reencontrar a escolha anterior na mão.
  useEffect(() => {
    if (!open || !capa.data) return;
    setSeg(capa.data.instante_seg);
  }, [open, capa.data]);

  // O player segue o estado, e não o contrário: o instante é a fonte da verdade
  // aqui, porque é ele que vai para o backend.
  useEffect(() => {
    const el = video.current;
    if (el && Number.isFinite(instante.seg)) el.currentTime = instante.seg;
  }, [instante.seg]);

  const mover = (passo: number) => setSeg((atual) => instanteEm(atual + passo, duracao, ganchoAte).seg);

  const mostrarImagem = origem === 'arte' && Boolean(capa.data?.tem_capa);

  return (
    <Modal open={open} onClose={onClose} title="Escolher a capa deste short" size="2xl">
      {/* As abas ficam ACIMA da prévia, e não ao lado dos botões: a origem da
          capa muda o trabalho inteiro do lado direito, e um seletor escondido
          entre controles leria como mais um ajuste. */}
      <div className="mb-3 flex items-center gap-1 rounded-[9px] bg-[var(--wb-bg-inset)] p-1">
        {ABAS.map(({ id, rotulo, nota }) => (
          <button
            key={id}
            type="button"
            onClick={() => setOrigem(id)}
            aria-pressed={origem === id}
            title={nota}
            className={
              origem === id
                ? 'flex-1 rounded-[7px] bg-[var(--wb-bg-panel)] px-3 py-1.5 text-[12.5px] font-bold text-[var(--wb-text)] shadow-[var(--wb-shadow)]'
                : 'flex-1 rounded-[7px] px-3 py-1.5 text-[12.5px] font-semibold text-[var(--wb-text-mute)] transition-colors hover:text-[var(--wb-text)]'
            }
          >
            {rotulo}
          </button>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
        <div className="space-y-2">
          {/* A prévia com as guias da vitrine por cima. */}
          <div className="relative mx-auto w-full max-w-[240px] overflow-hidden rounded-[8px] border border-[var(--wb-border)] bg-black">
            {/* D-581: na aba da ARTE a prévia mostra a imagem GRAVADA, e não o
                vídeo. Ali a pergunta é "a arte que subi sobrevive ao recorte?",
                e responder isso com um frame do vídeo seria mostrar outra
                imagem. Sem capa ainda, o vídeo volta — é melhor que um vazio. */}
            {mostrarImagem ? (
              <img
                src={capaImagemUrl(short.id, capa.data?.instante_seg ?? 0)}
                alt="Capa gravada deste short"
                className="block w-full"
                style={{ aspectRatio: '9 / 16', objectFit: 'cover' }}
              />
            ) : (
              <video
                ref={video}
                src={shortVideoUrl(short.id, 'final')}
                muted
                playsInline
                preload="metadata"
                className="block w-full"
                style={{ aspectRatio: '9 / 16' }}
              />
            )}
            {/* As faixas PERDIDAS, escurecidas. O que fica claro é o que a
                grade do perfil preserva. */}
            <div
              className="pointer-events-none absolute inset-x-0 top-0 bg-black/60"
              style={{ height: `${FRACAO_CORTADA * 100}%` }}
              aria-hidden
            />
            <div
              className="pointer-events-none absolute inset-x-0 bottom-0 bg-black/60"
              style={{ height: `${FRACAO_CORTADA * 100}%` }}
              aria-hidden
            />
            <div
              className="pointer-events-none absolute inset-x-0 border-y border-dashed border-white/50"
              style={{
                top: `${FRACAO_CORTADA * 100}%`,
                bottom: `${FRACAO_CORTADA * 100}%`,
              }}
              aria-hidden
            />
          </div>
          <p className="text-center text-[11px] leading-relaxed text-[var(--wb-text-mute)]">
            O claro é o que a vitrine do perfil mostra. O escuro some no recorte 3:4.
          </p>
          {origem === 'arte' && !capa.data?.tem_capa && (
            <p className="text-center text-[11px] leading-relaxed text-[var(--wb-text-mute)]">
              Ainda é o vídeo: a arte aparece aqui depois que você subir.
            </p>
          )}
        </div>

        <div className="space-y-4">
          {origem === 'arte' && <ArteDaCapa short={short} subir={subir} />}

          {origem === 'quadro' && (
          <section className="space-y-2">
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                aria-label="Um segundo atrás"
                disabled={instante.seg <= 0}
                onClick={() => mover(-PASSO_GROSSO_SEG)}
              >
                <ChevronLeft />
              </Button>
              <span className="font-code text-[14px] tabular-nums text-[var(--wb-text)]">
                {comSegundos(instante.seg)}
              </span>
              <Button
                variant="outline"
                size="sm"
                aria-label="Um segundo à frente"
                disabled={instante.seg >= duracao}
                onClick={() => mover(PASSO_GROSSO_SEG)}
              >
                <ChevronRight />
              </Button>
              <span className="ml-2 font-code text-[11px] text-[var(--wb-text-mute)]">
                de {comSegundos(duracao)}
              </span>
            </div>

            {/* A régua: clicar varre o short. O bloco do gancho fica marcado,
                porque é onde a capa sai com a promessa escrita. */}
            <div
              role="slider"
              tabIndex={0}
              aria-label="Instante da capa"
              aria-valuemin={0}
              aria-valuemax={duracao}
              aria-valuenow={instante.seg}
              onKeyDown={(e) => {
                if (e.key === 'ArrowLeft') mover(-PASSO_SEG);
                if (e.key === 'ArrowRight') mover(PASSO_SEG);
              }}
              onClick={(e) => {
                const caixa = e.currentTarget.getBoundingClientRect();
                setSeg(instanteDaPosicao((e.clientX - caixa.left) / caixa.width, duracao));
              }}
              className="relative h-8 cursor-pointer rounded-[6px] bg-[var(--wb-bg-inset)]"
            >
              {ganchoAte > 0 && duracao > 0 && (
                <div
                  className="pointer-events-none absolute inset-y-0 left-0 rounded-l-[6px] bg-[var(--wb-accent-soft)]"
                  style={{ width: `${posicaoNaRegua(ganchoAte, duracao) * 100}%` }}
                  aria-hidden
                />
              )}
              <div
                className="pointer-events-none absolute inset-y-0 w-0.5 bg-[var(--wb-accent)]"
                style={{ left: `${posicaoNaRegua(instante.seg, duracao) * 100}%` }}
                aria-hidden
              />
            </div>

            <div className="flex items-center gap-1.5">
              <Button
                variant="ghost"
                size="sm"
                aria-label="Um décimo atrás"
                onClick={() => mover(-PASSO_SEG)}
              >
                −{PASSO_SEG}s
              </Button>
              <Button
                variant="ghost"
                size="sm"
                aria-label="Um décimo à frente"
                onClick={() => mover(PASSO_SEG)}
              >
                +{PASSO_SEG}s
              </Button>
            </div>

            <p className="text-[11.5px] leading-relaxed text-[var(--wb-text-dim)]">
              {recadoDoInstante(instante)}
            </p>
          </section>
          )}

          {origem === 'quadro' && (
          <div className="flex flex-wrap items-center gap-2 border-t border-[var(--wb-border-soft)] pt-3">
            <Button
              size="sm"
              disabled={gerar.isPending || duracao <= 0}
              onClick={() => gerar.mutate({ instante_seg: instante.seg })}
            >
              {gerar.isPending ? <Loader2 className="animate-spin" /> : <Camera />}
              {gerar.isPending ? 'tirando…' : 'Usar este quadro'}
            </Button>
            {gerar.isError && (
              <span className="text-[11.5px] text-[var(--wb-text-dim)]">
                {(gerar.error as Error)?.message ?? 'não consegui tirar o quadro'}
              </span>
            )}
            {/* Sem capa escolhida a publicação NÃO quebra: a plataforma congela
                um quadro qualquer — normalmente um meio-piscar. Dizer isso aqui
                evita a leitura de que a etapa virou obrigatória. */}
            {!capa.data?.tem_capa && !gerar.isPending && (
              <span className="text-[11.5px] leading-relaxed text-[var(--wb-text-mute)]">
                Sem isto, a plataforma escolhe um quadro sozinha.
              </span>
            )}
          </div>
          )}

          {capa.data?.tem_capa && (
            <div className="flex items-center gap-2 border-t border-[var(--wb-border-soft)] pt-3">
              <img
                src={capaImagemUrl(short.id, capa.data.instante_seg)}
                alt="Capa gravada"
                className="h-16 w-9 flex-none rounded-[4px] border border-[var(--wb-border)] object-cover"
              />
              <span className="text-[11.5px] leading-relaxed text-[var(--wb-text-mute)]">
                Capa gravada em {comSegundos(capa.data.instante_seg)}.
              </span>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}

/**
 * D-581: a capa desenhada — prompt, cópia, e a arte de volta.
 *
 * A ordem dos passos é a ordem do trabalho, e é por isso que eles são três
 * blocos numerados e não três botões numa linha: entre o passo 1 e o 3 o
 * operador SAI do app (vai ao agente capista dele) e volta minutos depois. Uma
 * fileira de botões não diz que há uma viagem no meio.
 *
 * O prompt fica gravado no short justamente por causa dessa viagem — fechar o
 * modal não pode custar a chamada de IA de novo.
 */
function ArteDaCapa({
  short,
  subir,
}: {
  short: ShortSugerido;
  subir: ReturnType<typeof useSubirArteDaCapa>;
}) {
  const prompt = usePromptDaCapa(short.id);
  const gerarPrompt = useGerarPromptDaCapa(short.id);
  const promptEmVoo = providerEmVoo(gerarPrompt);
  const ultimaCapa = useUltimaGeracao('capa-short-imagem-expert', { shortId: short.id });
  const capaGeradaPor = gerarPrompt.variables ?? ultimaCapa.data?.provider ?? null;
  const seletor = useRef<HTMLInputElement>(null);
  const [copiado, setCopiado] = useState(false);

  const texto = gerarPrompt.data?.prompt ?? prompt.data?.prompt ?? '';

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      // Área de transferência negada (foco, permissão). O prompt continua na
      // caixa abaixo, selecionável — o caminho manual nunca deixa de existir.
      setCopiado(false);
    }
  };

  return (
    <div className="space-y-3">
      <p className="text-[11.5px] leading-relaxed text-[var(--wb-text-mute)]">
        O app escreve o prompt; quem desenha é você, no seu agente capista. A capa nasce 9:16, mas
        a grade do Instagram e a do TikTok mostram só o quadrado central — o prompt já pede a
        composição que sobrevive aos três recortes.
      </p>

      {/* Passo 1 — o prompt. */}
      <section className="space-y-2">
        <p className="text-[12.5px] font-semibold text-[var(--wb-text)]">1. Gerar o prompt</p>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={gerarPrompt.isPending}
            onClick={() => gerarPrompt.mutate('claude')}
          >
            {promptEmVoo === 'claude' ? <Loader2 className="animate-spin" /> : <Sparkles />}
            {promptEmVoo === 'claude'
              ? 'escrevendo…'
              : texto
                ? 'Refazer (Claude)'
                : 'Gerar com o Claude'}
          </Button>
          <GeminiAiButton
            pending={promptEmVoo === 'gemini'}
            disabled={promptEmVoo === 'claude'}
            onClick={() => gerarPrompt.mutate('gemini')}
            pendingLabel="escrevendo…"
            title="Escrever o prompt da capa pelo Gemini"
          />
          {!promptEmVoo && texto && (
            <SeloDeProvider provider={capaGeradaPor} modelo={ultimaCapa.data?.model} />
          )}
          {texto && (
            <Button variant="ghost" size="sm" onClick={copiar}>
              {copiado ? <Check /> : <Copy />}
              {copiado ? 'copiado' : 'Copiar'}
            </Button>
          )}
          {gerarPrompt.isPending && (
            // Uma chamada real leva minutos. Sem dizer isso, o spinner vira a
            // mesma escuridão do render antes da D-568 — e aqui a tentação é
            // fechar a janela, que é justamente o que não custa mais nada
            // porque o prompt fica gravado.
            <span className="text-[11.5px] text-[var(--wb-text-mute)]">
              lendo o trecho — costuma levar alguns minutos. Pode fechar: o prompt fica guardado.
            </span>
          )}
        </div>

        {gerarPrompt.isError && (
          <p className="text-[11.5px] leading-relaxed text-[var(--wb-text-dim)]">
            {(gerarPrompt.error as Error)?.message ?? 'não consegui escrever o prompt'}
          </p>
        )}

        {texto && (
          <textarea
            value={texto}
            readOnly
            rows={7}
            aria-label="Prompt da arte da capa"
            className="w-full resize-y rounded-[8px] border border-[var(--wb-border)] bg-[var(--wb-bg-inset)] p-2 font-code text-[11px] leading-relaxed text-[var(--wb-text-dim)] outline-none"
          />
        )}
      </section>

      {/* Passo 2 — fora do app. Existe como TEXTO porque é o único passo que o
          app não executa, e omiti-lo faria o 1 e o 3 parecerem desconexos. */}
      <section className="border-t border-[var(--wb-border-soft)] pt-3">
        <p className="text-[12.5px] font-semibold text-[var(--wb-text)]">
          2. Desenhar no seu agente
        </p>
        <p className="mt-1 text-[11.5px] leading-relaxed text-[var(--wb-text-mute)]">
          Cole o prompt no gerador de imagem e peça 1080×1920. Confira se o texto e o assunto
          cabem no quadrado central antes de salvar.
        </p>
      </section>

      {/* Passo 3 — a volta. */}
      <section className="space-y-2 border-t border-[var(--wb-border-soft)] pt-3">
        <p className="text-[12.5px] font-semibold text-[var(--wb-text)]">3. Subir a arte</p>
        <input
          ref={seletor}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={(e) => {
            const arquivo = e.target.files?.[0];
            if (arquivo) subir.mutate(arquivo);
            // Zera o input: sem isto, subir o MESMO arquivo de novo (depois de
            // corrigi-lo no disco) não dispara `change` e nada acontece.
            e.target.value = '';
          }}
        />
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={subir.isPending}
            onClick={() => seletor.current?.click()}
          >
            {subir.isPending ? <Loader2 className="animate-spin" /> : <Upload />}
            {subir.isPending ? 'subindo…' : 'Escolher a imagem'}
          </Button>
          {!subir.isPending && (
            <span className="text-[11.5px] text-[var(--wb-text-mute)]">
              ou copie a imagem e cole com{' '}
              <kbd className="rounded-[4px] border border-[var(--wb-border)] bg-[var(--wb-bg-inset)] px-1 font-code text-[10.5px] text-[var(--wb-text-dim)]">
                Ctrl+V
              </kbd>
            </span>
          )}
          {subir.isSuccess && (
            <span className="text-[11.5px] text-[var(--wb-ok-ink)]">
              arte gravada como a capa deste short
            </span>
          )}
        </div>
        {subir.isError && (
          <p className="text-[11.5px] leading-relaxed text-[var(--wb-text-dim)]">
            {(subir.error as Error)?.message ?? 'não consegui subir a arte'}
          </p>
        )}
        <p className="text-[11.5px] leading-relaxed text-[var(--wb-text-mute)]">
          A arte substitui o quadro do vídeo — quem publica usa um arquivo só.
        </p>
      </section>
    </div>
  );
}
