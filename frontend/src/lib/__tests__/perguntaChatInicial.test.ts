import { describe, expect, it } from 'vitest';
import { inicialDoAutor } from '@video-renderer/cenas-v2/CenaPerguntaChat';

// D-910: sem avatar (ou com o arquivo sumido), o card da pergunta do chat
// desenha a inicial de quem perguntou num círculo.
describe('a inicial do autor da pergunta do chat', () => {
  it('ignora o @ do handle do YouTube e sobe a caixa', () => {
    expect(inicialDoAutor('@nataliasilveira4739')).toBe('N');
    expect(inicialDoAutor('fulano')).toBe('F');
  });

  it('sem nome vira interrogação', () => {
    expect(inicialDoAutor('')).toBe('?');
    expect(inicialDoAutor('@')).toBe('?');
  });
});
