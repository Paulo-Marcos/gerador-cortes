import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { Busca } from '../busca';
import { Checkbox } from '../checkbox';
import { Input } from '../input';
import { Field } from '../field';
import { proximoDoGrupo, Radio, GrupoDeRadio } from '../radio';
import { CartaoDeOpcao } from '../cartao-de-opcao';
import { Switch } from '../switch';

// D-1116: segunda rodada da auditoria. O primeiro arquivo confere o HTML; este aperta os
// botões (sem jsdom: chama o render do componente e dispara o `onClick` do elemento) e
// confere as classes que pintam hover, erro e foco, que nenhum atributo ARIA prova.

type Renderizavel<P> = { render: (props: P, ref: null) => React.ReactElement };

function acha(
  no: React.ReactNode,
  quer: (el: React.ReactElement<Record<string, unknown>>) => boolean,
): React.ReactElement<Record<string, unknown>> | null {
  if (!React.isValidElement(no)) return null;
  const el = no as React.ReactElement<Record<string, unknown>>;
  if (quer(el)) return el;
  for (const filho of React.Children.toArray(el.props.children as React.ReactNode)) {
    const achado = acha(filho, quer);
    if (achado) return achado;
  }
  return null;
}

/** Renderiza `quem` dentro de um render de verdade (com o contexto que `envolve` monta) e devolve o elemento. */
function capturaElemento<P>(
  quem: unknown,
  props: P,
  envolve: (sonda: React.ReactElement) => React.ReactElement = (s) => s,
): React.ReactElement<Record<string, unknown>> {
  let pego: React.ReactElement<Record<string, unknown>> | null = null;
  function Sonda() {
    pego = (quem as Renderizavel<P>).render(props, null) as React.ReactElement<
      Record<string, unknown>
    >;
    return null;
  }
  renderToStaticMarkup(envolve(<Sonda />));
  if (!pego) throw new Error('a sonda não renderizou');
  return pego;
}

describe('cliques', () => {
  it('Switch inverte o estado ao clicar', () => {
    const muda = vi.fn();
    const props = { checked: false, onCheckedChange: muda };
    const el = (Switch as unknown as Renderizavel<typeof props>).render(props, null);
    (el.props as { onClick: () => void }).onClick();
    expect(muda).toHaveBeenCalledWith(true);
    const ligado = (Switch as unknown as Renderizavel<typeof props>).render(
      { ...props, checked: true },
      null,
    );
    (ligado.props as { onClick: () => void }).onClick();
    expect(muda).toHaveBeenLastCalledWith(false);
  });

  it('Checkbox marca vazio, desmarca marcado e marca o parcial', () => {
    const muda = vi.fn();
    const render = (checked: boolean | 'mixed') =>
      (
        Checkbox as unknown as Renderizavel<{
          checked: boolean | 'mixed';
          onCheckedChange: typeof muda;
        }>
      ).render({ checked, onCheckedChange: muda }, null);
    (render(false).props as { onClick: () => void }).onClick();
    expect(muda).toHaveBeenLastCalledWith(true);
    (render(true).props as { onClick: () => void }).onClick();
    expect(muda).toHaveBeenLastCalledWith(false);
    (render('mixed').props as { onClick: () => void }).onClick();
    expect(muda).toHaveBeenLastCalledWith(true);
  });

  it('Busca: "Limpar" zera o texto e digitar entrega o texto, não o evento', () => {
    const muda = vi.fn();
    const props = { value: 'abc', aoMudar: muda };
    const raiz = capturaElemento(Busca, props);
    const limpar = acha(raiz, (e) => e.props['aria-label'] === 'Limpar busca');
    (limpar?.props as { onClick: () => void }).onClick();
    expect(muda).toHaveBeenLastCalledWith('');
    const campo = acha(raiz, (e) => e.type === 'input');
    (campo?.props as { onChange: (e: unknown) => void }).onChange({ target: { value: 'novo' } });
    expect(muda).toHaveBeenLastCalledWith('novo');
  });

  it('Radio e cartão escolhem o próprio valor ao clicar', () => {
    const escolhe = vi.fn();
    const noGrupo = (sonda: React.ReactElement) => (
      <GrupoDeRadio value="a" onValueChange={escolhe} aria-label="g">
        {sonda}
      </GrupoDeRadio>
    );
    const radio = capturaElemento(Radio, { value: 'b' }, noGrupo);
    (radio.props as { onClick: () => void }).onClick();
    expect(escolhe).toHaveBeenLastCalledWith('b');
    const cartao = capturaElemento(CartaoDeOpcao, { value: 'c', titulo: 'C' }, noGrupo);
    (cartao.props as { onClick: () => void }).onClick();
    expect(escolhe).toHaveBeenLastCalledWith('c');
  });
});

describe('teclado do grupo de rádio', () => {
  it('setas avançam e recuam em círculo', () => {
    expect(proximoDoGrupo(3, 0, 'ArrowDown')).toBe(1);
    expect(proximoDoGrupo(3, 0, 'ArrowRight')).toBe(1);
    expect(proximoDoGrupo(3, 2, 'ArrowDown')).toBe(0);
    expect(proximoDoGrupo(3, 0, 'ArrowUp')).toBe(2);
    expect(proximoDoGrupo(3, 1, 'ArrowLeft')).toBe(0);
  });

  it('outra tecla, foco fora dos itens ou grupo vazio não navegam', () => {
    expect(proximoDoGrupo(3, 0, 'Enter')).toBeNull();
    expect(proximoDoGrupo(3, -1, 'ArrowDown')).toBeNull();
    expect(proximoDoGrupo(0, 0, 'ArrowDown')).toBeNull();
  });
});

describe('classes dos estados da §3.4', () => {
  it('campo: hover a 62% do fg, erro pinta a borda e o halo, foco em íris', () => {
    const html = renderToStaticMarkup(<Input aparencia="sala" />);
    expect(html).toContain('hover:border-fg/[.62]');
    expect(html).toContain('aria-[invalid=true]:border-erro');
    expect(html).toContain('aria-[invalid=true]:shadow-');
    expect(html).toContain('focus-visible:shadow-[0_0_0_3px_var(--cc-iris-suave)]');
  });

  it('controles: anel de foco visível e hover em Switch, Checkbox, Radio e cartão', () => {
    const noop = () => {};
    const html = [
      renderToStaticMarkup(<Switch checked={false} onCheckedChange={noop} />),
      renderToStaticMarkup(<Checkbox checked={false} onCheckedChange={noop} />),
      renderToStaticMarkup(
        <GrupoDeRadio value="a" onValueChange={noop} aria-label="g">
          <Radio value="a" />
          <CartaoDeOpcao value="b" titulo="B" />
        </GrupoDeRadio>,
      ),
    ];
    for (const h of html) {
      expect(h).toContain('focus-visible:outline-foco');
      expect(h).toContain('focus-visible:outline-2');
    }
    expect(html[0]).toContain('hover:border-fg/[.62]');
    expect(html[1]).toContain('hover:border-fg/[.62]');
    expect(html[2]).toContain('group-hover:border-fg/[.62]');
  });
});

describe('Input padrão dentro de um Field', () => {
  it('o rótulo continua ligado mesmo sem aparencia="sala"', () => {
    const html = renderToStaticMarkup(
      <Field rotulo="Título" erro="Informe o título">
        <Input />
      </Field>,
    );
    const id = html.match(/<label for="([^"]+)"/)?.[1];
    expect(html).toContain(`id="${id}"`);
    expect(html).toContain('aria-invalid="true"');
  });
});
