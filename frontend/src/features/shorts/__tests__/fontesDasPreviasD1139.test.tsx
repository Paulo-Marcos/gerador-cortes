import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { GanchoPrevia } from '../GanchoPrevia';

// D-1139: no primeiro desenho a fonte do vídeo ainda não desceu, então a prévia
// esconde o texto em vez de mostrá-lo na fonte de reserva (e o operador aprovar
// uma legenda que não é a do arquivo). Fonte vazia = a do canal, que já está lá.
const gancho = (fonte: string) =>
  renderToStaticMarkup(<GanchoPrevia texto="Olha isto" ateSeg={null} inicioSeg={0} fimSeg={10} tempoAtualSeg={1} fonte={fonte} />);

describe('prévias esperam a fonte do vídeo', () => {
  it('com fonte do vídeo, o gancho nasce oculto', () => {
    expect(gancho('Anton')).toContain('visibility:hidden');
  });

  it('sem fonte (a do canal), o gancho aparece de uma vez', () => {
    expect(gancho('')).not.toContain('visibility:hidden');
  });
});
