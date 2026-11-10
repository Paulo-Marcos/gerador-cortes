import { useEffect } from 'react';
import { cn } from '@/lib/utils';
import { AudioSyncControl } from './AudioSyncControl';
import { PerguntaDaDecisao } from './DecisoesDoCorte';
import { formatarComSinal } from './descreverOBruto';
import type { SomDoCorte } from './useSomDoCorte';

// D-1095 (E7, canvas `03-cortes-proposta`): "3 · O som bate com a boca?". A
// Sincronia do áudio saiu do player e virou a última pergunta do corte: o
// cabeçalho diz o deslocamento atual, e os passos andam só com o áudio.
// Ctrl+, e Ctrl+. continuam andando 10 ms (nudgeSincronia no useEditorPage).
// "Está certo" marca a resposta como o "Tirar todos" da pergunta 1 e desliga o
// fone; não grava nada, e qualquer passo novo desmarca (useSomDoCorte).

export function PerguntaDoSom({ som }: { som: SomDoCorte }) {
  const { pararDeOuvir } = som;
  // Sair da pergunta (outra aba, coluna recolhida, outro corte) desliga o fone:
  // vídeo mudo com o interruptor fora de vista foi a armadilha da D-601.
  useEffect(() => pararDeOuvir, [pararDeOuvir]);

  return (
    <PerguntaDaDecisao
      numero={3}
      pergunta="O som bate com a boca?"
      resumo={`${formatarComSinal(som.offsetMs)} ms`}
      assunto="o som"
    >
      <div className="flex flex-col gap-1.5 px-2.5 pb-2.5 pt-1.5">
        <p className="m-0 text-[12px] leading-[1.4] text-[var(--wb-text-mute)]">
          <strong className="font-semibold text-[var(--wb-text)]">Muda:</strong> só o áudio anda.{' '}
          <strong className="font-semibold text-[var(--wb-text)]">Fica:</strong> o vídeo, as bordas e os trechos.
        </p>
        <AudioSyncControl
          offsetMs={som.offsetMs}
          onChange={som.mudarOffset}
          previewEnabled={som.ouvindo}
          onTogglePreview={som.alternarOuvir}
          previewEstado={som.estadoDoPreview}
          canPreview={som.podeOuvir}
        >
          <button
            type="button"
            aria-pressed={som.certo}
            // A resposta já dada não se repete, como na pergunta 1.
            onClick={som.certo ? undefined : som.marcarCerto}
            className={cn(
              'h-8 flex-[2_1_auto] rounded-[8px] border px-3 text-[12.5px] font-medium transition-colors',
              som.certo
                ? 'border-[var(--wb-text)] bg-[var(--wb-text)] text-[var(--wb-bg-card)]'
                : 'border-[var(--wb-border)] bg-transparent text-[var(--wb-text)] hover:bg-[var(--wb-bg-inset)]',
            )}
          >
            Está certo
          </button>
        </AudioSyncControl>
      </div>
    </PerguntaDaDecisao>
  );
}
