import { describe, expect, it } from 'vitest';
import { resolveThumbUrl } from '../api';

describe('resolveThumbUrl', () => {
  const projetoId = 'proj-123';

  it('normaliza path absoluto antigo (backend/projetos) para URL relativa', () => {
    const thumbPath = 'C:\\Users\\paulo\\OneDrive\\DEV\\gerador-cortes\\backend\\projetos\\proj-123\\thumbnails\\thumb_x.png';

    const url = resolveThumbUrl(projetoId, thumbPath);

    expect(url).toBe('http://localhost:8000/videos/proj-123/thumbnails/thumb_x.png');
    expect(url).not.toMatch(/c:\//i);
    expect(url).not.toMatch(/users\//i);
  });

  it('normaliza path absoluto novo (instance/channels) para URL relativa', () => {
    const thumbPath =
      'C:\\Users\\paulo\\OneDrive\\DEV\\gerador-cortes\\instance\\channels\\default\\projetos\\proj-123\\thumbnails\\thumb_x.png';

    const url = resolveThumbUrl(projetoId, thumbPath);

    expect(url).toBe('http://localhost:8000/videos/proj-123/thumbnails/thumb_x.png');
    expect(url).not.toMatch(/c:\//i);
    expect(url).not.toMatch(/users\//i);
  });

  it('mantém path já relativo sem o projetoId', () => {
    const url = resolveThumbUrl(projetoId, 'thumbnails/t.png');

    expect(url).toBe('http://localhost:8000/videos/proj-123/thumbnails/t.png');
  });

  it('mantém path já relativo já prefixado com o projetoId', () => {
    const url = resolveThumbUrl(projetoId, 'proj-123/thumbnails/t.png');

    expect(url).toBe('http://localhost:8000/videos/proj-123/thumbnails/t.png');
  });

  it('faz passthrough de URL http(s) absoluta', () => {
    const url = resolveThumbUrl(projetoId, 'https://cdn.example.com/thumb.png');

    expect(url).toBe('https://cdn.example.com/thumb.png');
  });

  it('retorna null para path vazio ou nulo', () => {
    expect(resolveThumbUrl(projetoId, null)).toBeNull();
    expect(resolveThumbUrl(projetoId, undefined)).toBeNull();
    expect(resolveThumbUrl(projetoId, '')).toBeNull();
  });
});
