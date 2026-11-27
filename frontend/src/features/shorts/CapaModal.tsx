import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { ImagemAmpliavel } from '@/components/ui/imagem-ampliavel';
import { AcaoDeIa } from '@/components/ui/acao-de-ia';
import { SeloDeProvider } from '@/components/ui/selo-provider';
import { providerEmVoo } from '@/lib/providerIa';
import { useUltimaGeracao } from '@/features/ia';
import { Modal } from '@/components/ui/modal';
import { capaImagemUrl, shortVideoUrl, type ShortIdentificado } from './shortsApi';
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
import { PassoDesenharCapa } from './PassoDesenharCapa';
import {
  useCapaDoShort,
  useGerarCapa,
  useGerarPromptDaCapa,
  usePromptDaCapa,
  useSubirArteDaCapa,
} from './useShortsDoCorte';
import { Icon } from '@/upgrade/Icon';
import type { CSSProperties } from 'react';

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
// D-804/D-899: o prompt escrito já pede a arte ao robô do ChatGPT, que a grava
// aqui; subir uma feita por fora continua valendo. D-900: a arte é a aba de abertura.


/** D-581: de onde a capa vem. Duas origens, um só arquivo no fim. */
type Origem = 'quadro' | 'arte';

const ABAS: { id: Origem; rotulo: string; nota: string }[] = [
  { id: 'arte', rotulo: 'Arte desenhada', nota: 'gere com a IA ou suba a imagem' },
  { id: 'quadro', rotulo: 'Quadro do vídeo', nota: 'escolha um instante do short' },
];

interface Props {
  open: boolean;
  onClose: () => void;
  short: ShortIdentificado;
}

export function CapaModal({ open, onClose, short }: Props) {
  const capa = useCapaDoShort(short.id, open);
  const gerar = useGerarCapa(short.id);
  // Mora aqui, e não no `ArteDaCapa`: o Ctrl+V vale nas duas abas, e o
  // "subindo…" precisa ser o do MESMO envio que o colar disparou.
  const subir = useSubirArteDaCapa(short.id);
  const video = useRef<HTMLVideoElement>(null);
  const [seg, setSeg] = useState(0);
  const [origem, setOrigem] = useState<Origem>('arte');
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
      <div className="mb-3 flex items-center gap-1 rounded-[9px] bg-poco p-1">
        {ABAS.map(({ id, rotulo, nota }) => (
          <button
            key={id}
            type="button"
            onClick={() => setOrigem(id)}
            aria-pressed={origem === id}
            title={nota}
            className={
              origem === id
                ? 'flex-1 rounded-[7px] bg-painel-solido px-3 py-1.5 text-pequeno font-bold text-fg shadow-topo'
                : 'flex-1 rounded-[7px] px-3 py-1.5 text-pequeno font-semibold text-fg-2 transition-colors hover:text-fg'
            }
          >
            {rotulo}
          </button>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
        <div className="space-y-2">
          {/* A prévia com as guias da vitrine por cima. */}
          <div
            className="relative mx-auto w-full max-w-[240px] overflow-hidden rounded-[8px] border border-fio-2 bg-black"
            style={{ '--corte': `${FRACAO_CORTADA * 100}%` } as CSSProperties}
          >
            {/* D-581: na aba da ARTE a prévia mostra a imagem GRAVADA, e não o
                vídeo. Ali a pergunta é "a arte que subi sobrevive ao recorte?",
                e responder isso com um frame do vídeo seria mostrar outra
                imagem. Sem capa ainda, o vídeo volta — é melhor que um vazio. */}
            {mostrarImagem ? (
              <ImagemAmpliavel
                src={capaImagemUrl(short.id, capa.data?.instante_seg ?? 0)}
                alt="Capa gravada deste short" className="w-full" imgClassName="block w-full"
                imgStyle={{ aspectRatio: '9 / 16', objectFit: 'cover' }}
              />
            ) : (
              <video
                ref={video}
                src={shortVideoUrl(short.id, 'final')}
                muted
                playsInline
                preload="metadata"
                className="block aspect-[9/16] w-full"
              />
            )}
            {/* As faixas PERDIDAS, escurecidas. O que fica claro é o que a
                grade do perfil preserva. */}
            <div
              className="pointer-events-none absolute inset-x-0 top-0 h-[var(--corte)] bg-black/60"
              aria-hidden
            />
            <div
              className="pointer-events-none absolute inset-x-0 bottom-0 h-[var(--corte)] bg-black/60"
              aria-hidden
            />
            <div
              className="pointer-events-none absolute inset-x-0 top-[var(--corte)] bottom-[var(--corte)] border-y border-dashed border-white/50"
              aria-hidden
            />
          </div>
          <p className="text-center text-micro leading-relaxed text-fg-2">
            O claro é o que a vitrine do perfil mostra. O escuro some no recorte 3:4.
          </p>
          {origem === 'arte' && !capa.data?.tem_capa && (
            <p className="text-center text-micro leading-relaxed text-fg-2">
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
                variant="secundario"
                size="pq"
                aria-label="Um segundo atrás"
                disabled={instante.seg <= 0}
                onClick={() => mover(-PASSO_GROSSO_SEG)}
              >
                <Icon name="chevron-left" />
              </Button>
              <span className="font-code text-linha tabular-nums text-fg">
                {comSegundos(instante.seg)}
              </span>
              <Button
                variant="secundario"
                size="pq"
                aria-label="Um segundo à frente"
                disabled={instante.seg >= duracao}
                onClick={() => mover(PASSO_GROSSO_SEG)}
              >
                <Icon name="chevron-right" />
              </Button>
              <span className="ml-2 font-code text-micro text-fg-2">
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
              className="relative h-8 cursor-pointer rounded-[6px] bg-poco"
            >
              {ganchoAte > 0 && duracao > 0 && (
                <div
                  className="pointer-events-none absolute inset-y-0 left-0 rounded-l-[6px] bg-iris-suave w-[var(--larg)]"
                  style={{ '--larg': `${posicaoNaRegua(ganchoAte, duracao) * 100}%` } as CSSProperties}
                  aria-hidden
                />
              )}
              <div
                className="pointer-events-none absolute inset-y-0 w-0.5 left-[var(--pos)] bg-iris"
                style={{ '--pos': `${posicaoNaRegua(instante.seg, duracao) * 100}%` } as CSSProperties}
                aria-hidden
              />
            </div>

            <div className="flex items-center gap-1.5">
              <Button
                variant="fantasma"
                size="pq"
                aria-label="Um décimo atrás"
                onClick={() => mover(-PASSO_SEG)}
              >
                −{PASSO_SEG}s
              </Button>
              <Button
                variant="fantasma"
                size="pq"
                aria-label="Um décimo à frente"
                onClick={() => mover(PASSO_SEG)}
              >
                +{PASSO_SEG}s
              </Button>
            </div>

            <p className="text-micro leading-relaxed text-fg-3">
              {recadoDoInstante(instante)}
            </p>
          </section>
          )}

          {origem === 'quadro' && (
          <div className="flex flex-wrap items-center gap-2 border-t border-fio pt-3">
            <Button variant="secundario"
              size="pq"
              disabled={gerar.isPending || duracao <= 0}
              onClick={() => gerar.mutate({ instante_seg: instante.seg })}
            >
              {gerar.isPending ? <Icon name="loader-2" className="animate-spin" /> : <Icon name="camera" />}
              {gerar.isPending ? 'tirando…' : 'Usar este quadro'}
            </Button>
            {gerar.isError && (
              <span className="text-micro text-fg-3">
                {(gerar.error as Error)?.message ?? 'não consegui tirar o quadro'}
              </span>
            )}
            {/* Sem capa escolhida a publicação NÃO quebra: a plataforma congela
                um quadro qualquer — normalmente um meio-piscar. Dizer isso aqui
                evita a leitura de que a etapa virou obrigatória. */}
            {!capa.data?.tem_capa && !gerar.isPending && (
              <span className="text-micro leading-relaxed text-fg-2">
                Sem isto, a plataforma escolhe um quadro sozinha.
              </span>
            )}
          </div>
          )}

          {capa.data?.tem_capa && (
            <div className="flex items-center gap-2 border-t border-fio pt-3">
              <ImagemAmpliavel
                src={capaImagemUrl(short.id, capa.data.instante_seg)} alt="Capa gravada" className="flex-none"
                imgClassName="h-16 w-9 rounded-[4px] border border-fio-2 object-cover"
              />
              <span className="text-micro leading-relaxed text-fg-2">
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
  short: ShortIdentificado;
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
      <p className="text-micro leading-relaxed text-fg-2">
        O app escreve o prompt; quem desenha é você, no seu agente capista. A capa nasce 9:16, mas
        a grade do Instagram e a do TikTok mostram só o quadrado central — o prompt já pede a
        composição que sobrevive aos três recortes.
      </p>

      {/* Passo 1 — o prompt. */}
      <section className="space-y-2">
        <p className="text-pequeno font-semibold text-fg">1. Gerar o prompt</p>
        <div className="flex flex-wrap items-center gap-2">
          <AcaoDeIa
            rotulo={texto ? 'Refazer prompt' : 'Gerar prompt'}
            descricao={texto ? 'Refazer o prompt da capa' : 'Gerar o prompt da capa'}
            rotuloEmVoo="escrevendo…"
            emVoo={promptEmVoo}
            onGerar={(provider) => gerarPrompt.mutate(provider)}
          />
          {!promptEmVoo && texto && (
            <SeloDeProvider provider={capaGeradaPor} modelo={ultimaCapa.data?.model} />
          )}
          {texto && (
            <Button variant="fantasma" size="pq" onClick={copiar}>
              {copiado ? <Icon name="check" /> : <Icon name="copy" />}
              {copiado ? 'copiado' : 'Copiar'}
            </Button>
          )}
          {gerarPrompt.isPending && (
            // Uma chamada real leva minutos. Sem dizer isso, o spinner vira a
            // mesma escuridão do render antes da D-568 — e aqui a tentação é
            // fechar a janela, que é justamente o que não custa mais nada
            // porque o prompt fica gravado.
            <span className="text-micro text-fg-2">
              lendo o trecho — costuma levar alguns minutos. Pode fechar: o prompt fica guardado.
            </span>
          )}
        </div>

        {gerarPrompt.isError && (
          <p className="text-micro leading-relaxed text-fg-3">
            {(gerarPrompt.error as Error)?.message ?? 'não consegui escrever o prompt'}
          </p>
        )}

        {texto && (
          <textarea name="prompt"
            value={texto}
            readOnly
            rows={7}
            aria-label="Prompt da arte da capa"
            className="w-full resize-y rounded-[8px] border border-fio-2 bg-poco p-2 font-code text-micro leading-relaxed text-fg-3 outline-none focus-visible:ring-2 focus-visible:ring-foco"
          />
        )}
      </section>

      <PassoDesenharCapa shortId={short.id} prompt={texto} ocupado={subir.isPending} />

      {/* Passo 3 — a volta. */}
      <section className="space-y-2 border-t border-fio pt-3">
        <p className="text-pequeno font-semibold text-fg">3. Subir a arte</p>
        <input name="arquivo"
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
            variant="secundario"
            size="pq"
            disabled={subir.isPending}
            onClick={() => seletor.current?.click()}
          >
            {subir.isPending ? <Icon name="loader-2" className="animate-spin" /> : <Icon name="upload" />}
            {subir.isPending ? 'subindo…' : 'Escolher a imagem'}
          </Button>
          {!subir.isPending && (
            <span className="text-micro text-fg-2">
              ou copie a imagem e cole com{' '}
              <kbd className="rounded-[4px] border border-fio-2 bg-poco px-1 font-code text-micro text-fg-3">
                Ctrl+V
              </kbd>
            </span>
          )}
          {subir.isSuccess && (
            <span className="text-micro text-ok">
              arte gravada como a capa deste short
            </span>
          )}
        </div>
        {subir.isError && (
          <p className="text-micro leading-relaxed text-fg-3">
            {(subir.error as Error)?.message ?? 'não consegui subir a arte'}
          </p>
        )}
        <p className="text-micro leading-relaxed text-fg-2">
          A arte substitui o quadro do vídeo — quem publica usa um arquivo só.
        </p>
      </section>
    </div>
  );
}
