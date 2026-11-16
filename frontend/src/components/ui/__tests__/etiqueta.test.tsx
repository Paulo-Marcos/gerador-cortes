import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Etiqueta } from '../etiqueta';

describe('Etiqueta', () => {
  it('é ladrilho de canto 6 (não pílula), sem cor de estado', () => {
    const h = renderToStaticMarkup(<Etiqueta>Podcast</Etiqueta>);
    expect(h).toContain('rounded-etiqueta');
    expect(h).not.toContain('rounded-pilula');
    expect(h).not.toMatch(/text-(ok|erro|aviso|info|iris)|bg-(ok|erro|aviso|info|iris)/);
    expect(h).toContain('>Podcast<');
  });
});
