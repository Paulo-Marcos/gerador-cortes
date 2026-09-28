import { GerarNoChatGPT } from '@/features/capa-chatgpt/GerarNoChatGPT';

// O passo 2 da capa do short: desenhar a arte.
//
// Era só TEXTO, porque era o único passo que o app não executava — e omiti-lo
// faria o 1 e o 3 parecerem desconexos. Desde a D-804 o robô pode fazê-lo no
// ChatGPT do operador; a imagem cai direto no passo 3, pelo mesmo upload. O
// texto fica para quem prefere desenhar em outro gerador.

interface Props {
  prompt: string;
  entregar: (arquivo: File) => Promise<unknown>;
  ocupado: boolean;
}

export function PassoDesenharCapa({ prompt, entregar, ocupado }: Props) {
  return (
    <section className="border-t border-[var(--wb-border-soft)] pt-3">
      <p className="text-[12.5px] font-semibold text-[var(--wb-text)]">2. Desenhar a arte</p>
      <p className="mt-1 text-[11.5px] leading-relaxed text-[var(--wb-text-mute)]">
        Gere no ChatGPT com um clique, ou cole o prompt no gerador de imagem e peça 1080×1920.
        Confira se o texto e o assunto cabem no quadrado central antes de salvar.
      </p>
      <GerarNoChatGPT
        prompt={prompt}
        proporcao="9:16"
        entregar={entregar}
        desabilitado={ocupado}
        className="mt-2 w-fit"
      />
    </section>
  );
}
