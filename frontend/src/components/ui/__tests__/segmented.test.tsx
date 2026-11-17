import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { vi } from 'vitest';
import { Segmented, repassarSeEscolhido } from '../segmented';

const OPCOES = [
  { valor: 'mapa', rotulo: 'Mapa' },
  { valor: 'lista', rotulo: 'Lista' },
  { valor: 'grade', rotulo: 'Grade', desabilitado: true },
] as const;

const render = (value: string, extra: { cheio?: boolean } = {}) =>
  renderToStaticMarkup(
    <Segmented value={value} onValueChange={() => {}} opcoes={OPCOES} aria-label="Visão" {...extra} />,
  );

describe('Segmented', () => {
  it('é um radiogroup nomeado, com um radio por opção', () => {
    const h = render('mapa');
    expect(h).toContain('role="radiogroup"');
    expect(h).toContain('aria-label="Visão"');
    expect(h.match(/role="radio"/g)).toHaveLength(3);
  });

  it('só a opção escolhida está marcada e leva o visto', () => {
    const h = render('lista');
    expect(h.match(/aria-checked="true"/g)).toHaveLength(1);
    expect(h.match(/data-marca="visto"/g)).toHaveLength(1);
    expect(h.indexOf('data-marca="visto"')).toBeGreaterThan(h.indexOf('aria-checked="true"'));
  });

  it('é trilho de pílula, com foco visível e opção desabilitada', () => {
    const h = render('mapa');
    expect(h).toContain('rounded-pilula');
    expect(h).toContain('focus-visible:outline-foco');
    expect(h).toContain('disabled=""');
    expect(h).not.toContain('backdrop');
  });

  it('cheio ocupa a largura e reparte entre os itens', () => {
    const h = render('mapa', { cheio: true });
    expect(h.match(/class="([^"]*)"/)?.[1].split(' ')).toContain('flex');
    expect(h).toContain('flex-1');
  });

  it('clicar no já escolhido (valor vazio) não desmarca nem avisa a tela', () => {
    const aoEscolher = vi.fn();
    repassarSeEscolhido('', aoEscolher);
    expect(aoEscolher).not.toHaveBeenCalled();
    repassarSeEscolhido('lista', aoEscolher);
    expect(aoEscolher).toHaveBeenCalledWith('lista');
  });
});
