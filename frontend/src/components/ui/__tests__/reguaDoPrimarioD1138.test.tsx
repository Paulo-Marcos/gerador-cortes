// D-1138: controle da régua `umPrimarioPorTela`. Ela contava `primary` e o Button novo
// grava `primario`, então contava zero. Aqui a régua é provada contra o HTML que o Button
// de verdade emite, e não contra strings escritas à mão.

import { renderToStaticMarkup } from 'react-dom/server';
import { Button } from '../button';
import { contarPrimarios, contarPrimariosAcesos, esperarPrimarios } from '@/shared/qualidade/__tests__/primariosDaTela';

const primario = (props: { disabled?: boolean } = {}) =>
  renderToStaticMarkup(
    <Button variant="primario" {...props}>
      Publicar
    </Button>,
  );
const secundario = renderToStaticMarkup(<Button variant="secundario">Editar</Button>);

describe('régua do primário: variante certa', () => {
  it('conta o `primario` que o Button emite de verdade', () => {
    expect(contarPrimarios(primario())).toBe(1);
    expect(contarPrimarios(secundario)).toBe(0);
  });

  it('ainda conta o `primary` antigo de tela legada', () => {
    expect(contarPrimarios('<button data-variant="primary">A</button>')).toBe(1);
  });
});

describe('régua do primário: aceso', () => {
  it('o Button grava a variante mesmo desabilitado: contar variante não basta', () => {
    expect(contarPrimarios(primario({ disabled: true }))).toBe(1);
    expect(contarPrimariosAcesos(primario({ disabled: true }))).toBe(0);
    expect(contarPrimariosAcesos(primario())).toBe(1);
  });

  it('`aria-disabled` e `data-disabled` não são `disabled`', () => {
    expect(contarPrimariosAcesos('<button data-variant="primario" aria-disabled="true" data-disabled>A</button>')).toBe(1);
  });
});

describe('esperarPrimarios', () => {
  it('a tela certa passa: um primário aceso, ao lado de secundário', () => {
    expect(() => esperarPrimarios(primario() + secundario, 'Editor')).not.toThrow();
  });

  it('reprova dois primários', () => {
    expect(() => esperarPrimarios(primario() + primario(), 'Editor')).toThrow();
  });

  it('reprova nenhum primário onde deve haver um', () => {
    expect(() => esperarPrimarios(secundario, 'Biblioteca')).toThrow();
  });

  it('reprova a tela de leitura que ganhou um primário', () => {
    expect(() => esperarPrimarios(primario(), 'Fila')).toThrow();
  });

  it('reprova o primário desabilitado onde não deveria estar', () => {
    expect(() => esperarPrimarios(primario({ disabled: true }), 'Editor')).toThrow(/desabilitado/);
  });

  it('aceita o desabilitado só quando o teste declara o estado', () => {
    expect(() => esperarPrimarios(primario({ disabled: true }), 'Editor', { primarioDesabilitado: true })).not.toThrow();
  });

  it('declarar o estado não afrouxa a contagem: dois primários ainda reprovam', () => {
    const dois = primario({ disabled: true }) + primario({ disabled: true });
    expect(() => esperarPrimarios(dois, 'Editor', { primarioDesabilitado: true })).toThrow();
  });
});
