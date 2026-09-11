import { useEffect, useRef, useState } from 'react';
import { Camera, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
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
import { useCapaDoShort, useGerarCapa } from './useShortsDoCorte';

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

interface Props {
  open: boolean;
  onClose: () => void;
  short: ShortSugerido;
}

export function CapaModal({ open, onClose, short }: Props) {
  const capa = useCapaDoShort(short.id, open);
  const gerar = useGerarCapa(short.id);
  const video = useRef<HTMLVideoElement>(null);
  const [seg, setSeg] = useState(0);

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

  return (
    <Modal open={open} onClose={onClose} title="Escolher a capa deste short" size="2xl">
      <div className="grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
        <div className="space-y-2">
          {/* A prévia com as guias da vitrine por cima. */}
          <div className="relative mx-auto w-full max-w-[240px] overflow-hidden rounded-[8px] border border-[var(--wb-border)] bg-black">
            <video
              ref={video}
              src={shortVideoUrl(short.id, 'final')}
              muted
              playsInline
              preload="metadata"
              className="block w-full"
              style={{ aspectRatio: '9 / 16' }}
            />
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
        </div>

        <div className="space-y-4">
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
