import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { UpgradeModal } from '../UpgradeModal';

// D-999: o "Por que este corte?" só informa; sem o voto, um botão basta.
const rodape = (secondaryLabel?: string | null) =>
  renderToStaticMarkup(
    <UpgradeModal open onClose={() => {}} icon="sparkles" title="T" secondaryLabel={secondaryLabel} primaryLabel="Fechar" primaryIcon="x" />,
  );

describe('UpgradeModal: botão secundário', () => {
  it('null tira o botão secundário e deixa só o primário', () => {
    const html = rodape(null);
    expect(html.match(/<button/g)).toHaveLength(2); // o X do cabeçalho e o Fechar
    expect(html).not.toContain('Cancelar');
  });

  it('sem a prop, o Cancelar de sempre continua', () => {
    expect(rodape()).toContain('Cancelar');
  });
});
