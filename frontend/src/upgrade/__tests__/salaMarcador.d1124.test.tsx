import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import postcss from 'postcss';
import { describe, expect, it } from 'vitest';
import { AcaoDeIa } from '@/components/ui/acao-de-ia';
import { Busca } from '@/components/ui/busca';
import { Button } from '@/components/ui/button';
import { CartaoDeOpcao } from '@/components/ui/cartao-de-opcao';
import { Checkbox } from '@/components/ui/checkbox';
import { Chip } from '@/components/ui/chip';
import { IconButton } from '@/components/ui/icon-button';
import { Input } from '@/components/ui/input';
import { LinkDeAcao } from '@/components/ui/link-de-acao';
import { GrupoDeRadio, Radio } from '@/components/ui/radio';
import { Segmented } from '@/components/ui/segmented';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';

// D-1124: a casca antiga (`.ap`) reconhece a Sala escura pelo atributo `data-sala`, não
// pelo nome de uma classe. O vitest daqui roda em `node` (sem DOM), então a prova tem
// três partes que se fecham:
//   1. a exceção do upgrade.css é exatamente `:where(:not([data-sala]))`;
//   2. cada componente renderizável emite `data-sala` no elemento focável, e o legado não;
//   3. todo arquivo de components/ui que desenha foco da Sala (`outline-foco`,
//      `ring-foco`, `rounded-campo`) cita `data-sala` no fonte — cobre o que só
//      aparece aberto (diálogo, menu, popover, seleção) e reprova componente novo
//      que esquecer o atributo.

const raiz = resolve(__dirname, '../..');
const css = readFileSync(resolve(__dirname, '../upgrade.css'), 'utf-8');

function seletoresReiniciadores() {
  const achados: string[] = [];
  postcss.parse(css).walkRules((regra) => {
    const reinicia = regra.nodes?.some(
      (d) =>
        d.type === 'decl' &&
        ((d.prop === 'font' && d.value === 'inherit') ||
          (d.prop === 'outline' && d.value.includes('var(--accent)'))),
    );
    if (!reinicia || /\.(campo|fld):/.test(regra.selector)) return;
    for (const s of regra.selectors) {
      if (/^\.ap (button|input|select|textarea|:focus-visible)/.test(s)) achados.push(s);
    }
  });
  return achados;
}

const noop = () => {};
const nomes = { 'aria-label': 'x' };

const RENDERIZAVEIS: [string, React.ReactElement][] = [
  ['Button primario', <Button variant="primario">a</Button>],
  ['Button secundario', <Button variant="secundario">a</Button>],
  ['IconButton vidro', <IconButton variant="vidro" {...nomes} />],
  ['LinkDeAcao', <LinkDeAcao>a</LinkDeAcao>],
  ['AcaoDeIa', <AcaoDeIa rotulo="Gerar" emVoo={null} onGerar={noop} aparencia="sala-escura" />],
  ['Chip', <Chip>a</Chip>],
  ['Checkbox', <Checkbox checked={false} onCheckedChange={noop} {...nomes} />],
  ['Switch', <Switch checked={false} onCheckedChange={noop} {...nomes} />],
  ['Radio', <GrupoDeRadio value="a" onValueChange={noop} {...nomes}><Radio value="a" {...nomes} /></GrupoDeRadio>],
  ['CartaoDeOpcao', <GrupoDeRadio value="a" onValueChange={noop} {...nomes}><CartaoDeOpcao value="a" titulo="A" /></GrupoDeRadio>],
  ['Segmented', <Segmented value="a" onValueChange={noop} opcoes={[{ valor: 'a', rotulo: 'A' }]} {...nomes} />],
  ['Tabs', <Tabs value="a"><TabsList><TabsTrigger value="a">A</TabsTrigger></TabsList></Tabs>],
  ['Input sala', <Input aparencia="sala" {...nomes} />],
  ['Textarea', <Textarea {...nomes} />],
  ['Busca', <Busca value="x" aoMudar={noop} {...nomes} />],
];

const FOCAVEL = /<(button|input|textarea|select|a)\b[^>]*>/g;

describe('D-1124: a casca reconhece a Sala escura por data-sala', () => {
  it('a exceção da casca é exatamente :where(:not([data-sala])), em todas as regras reiniciadoras', () => {
    const seletores = seletoresReiniciadores();
    expect(seletores).toHaveLength(5); // font: button, input, select, textarea + o anel de foco
    for (const s of seletores) {
      expect(s, s).toMatch(/:where\(:not\(\[data-sala\]\)\)$/);
      expect(s, `${s} ainda reconhece por classe`).not.toContain('class*=');
    }
  });

  it.each(RENDERIZAVEIS)('%s emite data-sala em todo elemento focável', (_nome, arvore) => {
    const focaveis = [...renderToStaticMarkup(<div className="ap">{arvore}</div>).matchAll(FOCAVEL)].map((m) => m[0]);
    expect(focaveis.length).toBeGreaterThan(0);
    for (const tag of focaveis) expect(tag, 'sem data-sala').toContain('data-sala');
  });

  it('o legado não leva o marcador: segue sob a regra da casca', () => {
    const html = renderToStaticMarkup(
      <>
        <Button variant="default">a</Button>
        <Button variant="outline">a</Button>
        <IconButton variant="ghost" aria-label="x" />
        <Input />
      </>,
    );
    expect(html).not.toContain('data-sala');
  });

  it('todo arquivo de components/ui que desenha o foco da Sala cita data-sala (componente novo sem o atributo reprova)', () => {
    const dir = resolve(raiz, 'components/ui');
    const arquivos = readdirSync(dir).filter((f) => f.endsWith('.tsx'));
    const comFoco = arquivos.filter((f) =>
      /outline-foco|ring-foco|rounded-campo/.test(readFileSync(resolve(dir, f), 'utf-8')),
    );
    expect(comFoco.length).toBeGreaterThanOrEqual(20);
    const semMarcador = comFoco.filter((f) => !readFileSync(resolve(dir, f), 'utf-8').includes('data-sala'));
    // `field.tsx` só define a pele (`CLASSES_DO_CAMPO`); quem a usa emite o atributo.
    expect(semMarcador.filter((f) => f !== 'field.tsx')).toEqual([]);
  });
});
