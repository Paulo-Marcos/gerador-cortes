import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { AcaoDeIa } from '../acao-de-ia';

const render = (props: Partial<Parameters<typeof AcaoDeIa>[0]> = {}) =>
  renderToStaticMarkup(<AcaoDeIa rotulo="Gerar trechos" emVoo={null} onGerar={vi.fn()} {...props} />);

describe('AcaoDeIa — aparência Sala escura (D-1114)', () => {
  it('a pílula de vidro leva a faísca em íris e os provedores sem cor de marca', () => {
    const h = render({ aparencia: 'sala-escura' });
    expect(h).toContain('data-aparencia="sala-escura"');
    expect(h).toContain('rounded-pilula');
    expect(h).toContain('text-iris');
    expect(h).toContain('aria-label="Gerar trechos com o Claude"');
    expect(h).not.toContain('#D97757');
    expect(h).not.toContain('color:');
    expect(h).not.toContain('backdrop');
    expect(h).not.toContain('--wb-');
  });

  it('o padrão continua sendo o desenho antigo', () => {
    const h = render();
    expect(h).toContain('data-aparencia="legada"');
    expect(h).toContain('border-fio-2');
    expect(h).toContain('--marca:#D97757');
    expect(h).not.toContain('rounded-pilula');
  });

  it('em voo: gira, trava o outro provedor e marca aria-busy', () => {
    const h = render({ aparencia: 'sala-escura', emVoo: 'claude', rotuloEmVoo: 'escrevendo…' });
    expect(h).toContain('escrevendo…');
    expect(h).toContain('animate-spin');
    expect(h.match(/aria-busy="true"/g)).toHaveLength(1);
    expect(h.match(/disabled=""/g)).toHaveLength(2);
  });

  it('a terceira opção "As duas" também veste a Sala escura', () => {
    const h = render({ aparencia: 'sala-escura', asDuas: { onGerar: vi.fn(), emVoo: false } });
    expect(h).toContain('As duas');
    expect(h).toContain('hover:bg-vidro-3');
    expect(h).not.toContain('--wb-');
  });
});
