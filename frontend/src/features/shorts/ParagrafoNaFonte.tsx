import type { ComponentProps } from 'react';
import { useFontesDoRender } from '@/lib/fontesDoRender';

// D-1139: o texto da prévia (legenda, gancho) só aparece depois que a fonte do VÍDEO
// desceu. As cinco não vêm mais no `index.html`; até chegarem, pintar o texto seria
// mostrar a fonte de reserva — e o operador aprovaria o que não é o arquivo (D-563).
// A família vem do próprio `style.fontFamily`: vazio é a fonte do canal, que já está lá.
export function ParagrafoNaFonte({ style, ...resto }: ComponentProps<'p'>) {
  const pronta = useFontesDoRender([String(style?.fontFamily ?? '')]);
  return <p {...resto} style={pronta ? style : { ...style, visibility: 'hidden' }} />;
}
