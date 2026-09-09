import { FundoThumb, YOUTUBE_BACKGROUND_OPTIONS } from '@/features/editor/fase2/youtubeBackgrounds';
import type { YoutubeBackgroundId } from '@/features/editor/fase2/youtubeLayout';
import { cn } from '@/lib/utils';

// D-552: o fundo do short passou a ser a TEXTURA, e não uma cor.
//
// O seletor anterior oferecia cores da paleta do canal, e escolher uma não
// mudava nada em lugar nenhum: no arquivo, o PNG do palco cobre a cor; na
// prévia, os recortes cobrem. Era um controle com efeito zero — o operador
// clicava, nada acontecia, e não havia como ele saber por quê.
//
// O que o palco realmente tem por trás é uma das texturas editoriais do canal,
// a mesma família que o horizontal usa. Agora é ISSO que se escolhe, e a
// escolha aparece na prévia no mesmo instante.
//
// A cor da paleta não sumiu do sistema: ela continua sendo a base que o ffmpeg
// pinta debaixo de tudo, e serve de rede para o caso de a textura falhar. O que
// saiu é a promessa de que escolhê-la muda alguma coisa.

interface Props {
  /** O id gravado no short. Vazio = a textura padrão do canal. */
  escolhida: string;
  /** Qual é a padrão, para marcá-la quando não há escolha. */
  padrao: string;
  ocupado: boolean;
  onEscolher: (id: string) => void;
}

export function SeletorDeTextura({ escolhida, padrao, ocupado, onEscolher }: Props) {
  // Sem escolha, o marcado é o DEFAULT — e não "nenhum". Deixar tudo apagado
  // sugeriria que o short sai sem fundo, quando ele sempre tem um.
  const ativa = escolhida || padrao;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {YOUTUBE_BACKGROUND_OPTIONS.map((opcao) => (
        <button
          key={opcao.id}
          type="button"
          disabled={ocupado}
          title={`${opcao.label} — ${opcao.descricao}`}
          aria-label={`Fundo ${opcao.label}`}
          aria-pressed={opcao.id === ativa}
          // Marcar o que já está marcado volta ao padrão do canal — é como se
          // desfaz uma escolha sem precisar de um botão "limpar" só para isso.
          onClick={() => onEscolher(opcao.id === escolhida ? '' : opcao.id)}
          className={cn(
            'overflow-hidden rounded-[7px] border transition-transform disabled:opacity-50',
            opcao.id === ativa
              ? 'border-[var(--wb-accent)] ring-2 ring-[var(--wb-accent)]/40'
              : 'border-[var(--wb-border)] hover:scale-105',
          )}
        >
          {/* A miniatura desenha a própria textura: um quadradinho de cor não
              diria nada sobre um fundo cujo assunto é o desenho, não o tom. */}
          <FundoThumb id={opcao.id as YoutubeBackgroundId} className="h-9 w-16" />
        </button>
      ))}
    </div>
  );
}
