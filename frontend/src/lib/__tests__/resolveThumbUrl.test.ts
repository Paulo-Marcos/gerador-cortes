import { describe, expect, it } from 'vitest';
import { VIDEOS_BASE, resolveThumbUrl } from '../api';

describe('resolveThumbUrl', () => {
  const projetoId = 'proj-123';
  // A base sai de VITE_API_URL: DEV roda em porta alternativa (8001) e PROD na
  // porta corrente (8000). O que o teste garante é a normalização do path — o
  // host/porta vem do ambiente, senão o mesmo teste passa num e falha no outro.
  const base = `${VIDEOS_BASE}/${projetoId}`;

  it('deriva a base estática de /videos a partir da URL da API', () => {
    expect(VIDEOS_BASE).toMatch(/\/videos$/);
  });

  it('normaliza path absoluto antigo (backend/projetos) para URL relativa', () => {
    const thumbPath = 'C:\\Users\\paulo\\OneDrive\\DEV\\gerador-cortes\\backend\\projetos\\proj-123\\thumbnails\\thumb_x.png';

    const url = resolveThumbUrl(projetoId, thumbPath);

    expect(url).toBe(`${base}/thumbnails/thumb_x.png`);
    expect(url).not.toMatch(/c:\//i);
    expect(url).not.toMatch(/users\//i);
  });

  it('normaliza path absoluto novo (instance/channels) para URL relativa', () => {
    const thumbPath =
      'C:\\Users\\paulo\\OneDrive\\DEV\\gerador-cortes\\instance\\channels\\default\\projetos\\proj-123\\thumbnails\\thumb_x.png';

    const url = resolveThumbUrl(projetoId, thumbPath);

    expect(url).toBe(`${base}/thumbnails/thumb_x.png`);
    expect(url).not.toMatch(/c:\//i);
    expect(url).not.toMatch(/users\//i);
  });

  it('mantém path já relativo sem o projetoId', () => {
    const url = resolveThumbUrl(projetoId, 'thumbnails/t.png');

    expect(url).toBe(`${base}/thumbnails/t.png`);
  });

  it('mantém path já relativo já prefixado com o projetoId', () => {
    const url = resolveThumbUrl(projetoId, 'proj-123/thumbnails/t.png');

    expect(url).toBe(`${base}/thumbnails/t.png`);
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
