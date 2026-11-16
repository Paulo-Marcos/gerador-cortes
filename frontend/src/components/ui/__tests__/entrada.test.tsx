import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Busca } from '../busca';
import { Checkbox } from '../checkbox';
import { CartaoDeOpcao } from '../cartao-de-opcao';
import { Field } from '../field';
import { Input } from '../input';
import { Label } from '../label';
import { GrupoDeRadio, Radio } from '../radio';
import { Select } from '../select';
import { Switch } from '../switch';
import { Textarea } from '../textarea';

// D-1116 (E-069 H-08): a entrada da Sala escura. Cada estado da §3.4 vira uma classe ou
// um atributo ARIA; o visual em si se confere no navegador, na página Kit.

const noop = () => {};

describe('Input', () => {
  it('padrão continua o campo atual: nenhuma tela muda de cara', () => {
    const html = renderToStaticMarkup(<Input placeholder="x" />);
    expect(html).toContain('fld');
    expect(html).not.toContain('border-campo');
  });

  it('sala: poço, fio de campo, foco em íris e nada de backdrop-filter (§3.6)', () => {
    const html = renderToStaticMarkup(<Input aparencia="sala" />);
    expect(html).toContain('bg-poco');
    expect(html).toContain('border-campo');
    expect(html).toContain('rounded-campo');
    expect(html).toContain('focus-visible:border-iris');
    expect(html).not.toContain('backdrop');
  });

  it('inválido marca aria-invalid; desabilitado fica tracejado', () => {
    expect(renderToStaticMarkup(<Input aparencia="sala" invalido />)).toContain(
      'aria-invalid="true"',
    );
    const off = renderToStaticMarkup(<Input aparencia="sala" disabled />);
    expect(off).toContain('disabled=""');
    expect(off).toContain('disabled:border-dashed');
  });

  it('carregando: aria-busy, desabilitado, giro e a frase do que busca', () => {
    const html = renderToStaticMarkup(<Input aparencia="sala" carregando="Buscando capas…" />);
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('disabled=""');
    expect(html).toContain('placeholder="Buscando capas…"');
    expect(html).toContain('animate-spin');
    expect(renderToStaticMarkup(<Input aparencia="sala" carregando />)).toContain(
      'placeholder="Carregando…"',
    );
  });
});

describe('Field', () => {
  it('liga rótulo, controle e mensagem de ajuda', () => {
    const html = renderToStaticMarkup(
      <Field rotulo="Título" ajuda="Até 100 caracteres">
        <Input aparencia="sala" />
      </Field>,
    );
    const id = html.match(/<label for="([^"]+)"/)?.[1];
    expect(id).toBeTruthy();
    expect(html).toContain(`id="${id}"`);
    expect(html).toContain(`aria-describedby="${id}-msg"`);
    expect(html).toContain('Até 100 caracteres');
    expect(html).not.toContain('aria-invalid');
  });

  it('erro troca a ajuda, invalida o controle e é anunciado', () => {
    const html = renderToStaticMarkup(
      <Field rotulo="Título" ajuda="Até 100 caracteres" erro="Informe o título" obrigatorio>
        <Textarea />
      </Field>,
    );
    expect(html).toContain('aria-invalid="true"');
    expect(html).toContain('role="alert"');
    expect(html).toContain('Informe o título');
    expect(html).not.toContain('Até 100 caracteres');
    expect(html).toContain('required=""');
  });

  it('sem ajuda nem erro não deixa aria-describedby apontando para o vazio', () => {
    const html = renderToStaticMarkup(
      <Field rotulo="Nome">
        <Input aparencia="sala" />
      </Field>,
    );
    expect(html).not.toContain('aria-describedby');
  });
});

describe('Label', () => {
  it('padrão intacto; sala usa fg-2 semibold', () => {
    expect(renderToStaticMarkup(<Label>a</Label>)).toContain('text-text-300');
    const sala = renderToStaticMarkup(<Label aparencia="sala">a</Label>);
    expect(sala).toContain('text-fg-2');
    expect(sala).toContain('font-semibold');
  });
});

describe('Textarea', () => {
  it('usa a mesma pele do campo e carrega', () => {
    const html = renderToStaticMarkup(<Textarea carregando="Gerando…" />);
    expect(html).toContain('bg-poco');
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('placeholder="Gerando…"');
  });
});

describe('Busca', () => {
  it('é uma pílula com lupa e sem "limpar" quando vazia', () => {
    const html = renderToStaticMarkup(<Busca value="" aoMudar={noop} aria-label="Buscar" />);
    expect(html).toContain('role="search"');
    expect(html).toContain('rounded-pilula');
    expect(html).toContain('lucide-search');
    expect(html).not.toContain('Limpar busca');
  });

  it('com texto oferece limpar; carregando troca o limpar pelo giro', () => {
    expect(renderToStaticMarkup(<Busca value="a" aoMudar={noop} />)).toContain('Limpar busca');
    const html = renderToStaticMarkup(<Busca value="a" aoMudar={noop} carregando="Buscando…" />);
    expect(html).not.toContain('Limpar busca');
    expect(html).toContain('animate-spin');
  });
});

describe('Select', () => {
  const opcoes = [
    { valor: 'a', rotulo: 'Alfa' },
    { valor: 'b', rotulo: 'Beta' },
  ];

  it('gatilho é um campo com o valor escolhido', () => {
    const html = renderToStaticMarkup(<Select opcoes={opcoes} value="b" />);
    expect(html).toContain('role="combobox"');
    expect(html).toContain('border-campo');
    expect(html).toContain('Beta');
  });

  it('placeholder, inválido e carregando', () => {
    expect(renderToStaticMarkup(<Select opcoes={opcoes} placeholder="Escolha" />)).toContain(
      'Escolha',
    );
    expect(renderToStaticMarkup(<Select opcoes={opcoes} invalido />)).toContain(
      'aria-invalid="true"',
    );
    const html = renderToStaticMarkup(<Select opcoes={opcoes} carregando="Buscando canais…" />);
    expect(html).toContain('Buscando canais…');
    expect(html).toContain('aria-busy="true"');
  });
});

describe('Switch', () => {
  it('é role=switch e reflete o estado em aria-checked', () => {
    const ligado = renderToStaticMarkup(
      <Switch checked onCheckedChange={noop} aria-label="Legendas" />,
    );
    expect(ligado).toContain('role="switch"');
    expect(ligado).toContain('aria-checked="true"');
    expect(renderToStaticMarkup(<Switch checked={false} onCheckedChange={noop} />)).toContain(
      'aria-checked="false"',
    );
  });

  it('desabilitado e carregando travam o botão', () => {
    expect(
      renderToStaticMarkup(<Switch checked={false} onCheckedChange={noop} disabled />),
    ).toContain('disabled=""');
    const c = renderToStaticMarkup(<Switch checked onCheckedChange={noop} carregando />);
    expect(c).toContain('aria-busy="true"');
    expect(c).toContain('disabled=""');
  });

  it('a bolinha respeita prefers-reduced-motion', () => {
    expect(renderToStaticMarkup(<Switch checked onCheckedChange={noop} />)).toContain(
      'motion-reduce:after:transition-none',
    );
  });
});

describe('Checkbox', () => {
  it('marcado mostra o visto; parcial mostra o traço; vazio nada', () => {
    const on = renderToStaticMarkup(<Checkbox checked onCheckedChange={noop} />);
    expect(on).toContain('role="checkbox"');
    expect(on).toContain('aria-checked="true"');
    expect(on).toContain('lucide-check');
    const mixed = renderToStaticMarkup(<Checkbox checked="mixed" onCheckedChange={noop} />);
    expect(mixed).toContain('aria-checked="mixed"');
    expect(mixed).toContain('lucide-minus');
    expect(renderToStaticMarkup(<Checkbox checked={false} onCheckedChange={noop} />)).not.toContain(
      '<svg',
    );
  });
});

describe('Radio e CartaoDeOpcao', () => {
  it('o marcado é aria-checked e é o único no Tab', () => {
    const html = renderToStaticMarkup(
      <GrupoDeRadio value="b" onValueChange={noop} aria-label="Formato">
        <Radio value="a" aria-label="A" />
        <Radio value="b" aria-label="B" />
      </GrupoDeRadio>,
    );
    expect(html).toContain('role="radiogroup"');
    const [a, b] = html.split('<button').slice(1);
    expect(a).toContain('aria-checked="false"');
    expect(a).toContain('tabindex="-1"');
    expect(b).toContain('aria-checked="true"');
    expect(b).toContain('tabindex="0"');
  });

  it('sem seleção, todos são alcançáveis pelo Tab', () => {
    const html = renderToStaticMarkup(
      <GrupoDeRadio value={undefined} onValueChange={noop} aria-label="Formato">
        <Radio value="a" aria-label="A" />
        <Radio value="b" aria-label="B" />
      </GrupoDeRadio>,
    );
    expect(html.match(/tabindex="0"/g)).toHaveLength(2);
  });

  it('o cartão é um rádio com título, descrição e o estado de íris', () => {
    const html = renderToStaticMarkup(
      <GrupoDeRadio value="v" onValueChange={noop} aria-label="Layout">
        <CartaoDeOpcao value="v" titulo="Vertical" descricao="9:16 para shorts" />
        <CartaoDeOpcao value="h" titulo="Horizontal" disabled />
      </GrupoDeRadio>,
    );
    expect(html).toContain('Vertical');
    expect(html).toContain('9:16 para shorts');
    expect(html).toContain('aria-checked:border-iris-fio');
    expect(html).not.toContain('erro');
    expect(html).toContain('disabled=""');
  });

  it('fora de um grupo é erro de uso, não um rádio solto', () => {
    expect(() => renderToStaticMarkup(<Radio value="a" />)).toThrow(/GrupoDeRadio/);
  });
});
