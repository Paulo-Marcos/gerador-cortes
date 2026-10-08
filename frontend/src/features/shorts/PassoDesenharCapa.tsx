import { useQueryClient } from '@tanstack/react-query';
import { GerarNoChatGPT } from '@/features/capa-chatgpt/GerarNoChatGPT';
import { capaDoShortKey } from './useShortsDoCorte';

// O passo 2 da capa do short: desenhar a arte.
//
// Era só TEXTO, porque era o único passo que o app não executava — e omiti-lo
// faria o 1 e o 3 parecerem desconexos. Desde a D-804 o robô pode fazê-lo no
// ChatGPT do operador; o backend grava a imagem como a capa (D-898), e a tela
// só relê. O texto fica para quem prefere desenhar em outro gerador.

interface Props {
  shortId: string;
  prompt: string;
  ocupado: boolean;
}

export function PassoDesenharCapa({ shortId, prompt, ocupado }: Props) {
  const qc = useQueryClient();
  return (
    <section className="border-t border-[var(--wb-border-soft)] pt-3">
      <p className="text-[12.5px] font-semibold text-[var(--wb-text)]">2. Desenhar a arte</p>
      <p className="mt-1 text-[11.5px] leading-relaxed text-[var(--wb-text-mute)]">
        Gere no ChatGPT com um clique, ou cole o prompt no gerador de imagem e peça 1080×1920.
        Confira se o texto e o assunto cabem no quadrado central antes de salvar.
      </p>
      <GerarNoChatGPT
        prompt={prompt}
        destino="short"
        alvoId={shortId}
        aoConcluir={() => void qc.invalidateQueries({ queryKey: capaDoShortKey(shortId) })}
        desabilitado={ocupado}
        className="mt-2 w-fit"
      />
    </section>
  );
}
