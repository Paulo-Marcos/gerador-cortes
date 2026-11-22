import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import postcss from 'postcss';
import { describe, expect, it } from 'vitest';
import { Button } from '@/components/ui/button';
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

// D-1119: a casca antiga (`.ap`) não pode anular a fonte nem o foco dos componentes da
// Sala escura. O vitest daqui roda em `node`, sem DOM nem cascata, então a prova se
// divide em duas metades que, juntas, decidem o resultado:
//   1. toda regra reiniciadora da casca (`font: inherit`, o anel `:focus-visible`) traz
//      a exceção `:where(:not(<marcador>))` — e `:where` vale zero, então a regra segue
//      pegando todo controle antigo com a mesma força (nenhuma tela atual muda);
//   2. todo controle novo carrega o marcador que a exceção reconhece.
// A prova de estilo computado, antes e depois, está no PR.

const css = readFileSync(resolve(__dirname, '../upgrade.css'), 'utf-8');

const MARCADORES = ['[data-sala]'];

/** Regras da casca que reiniciam a fonte ou pintam o anel de foco em controles. */
function regrasReiniciadoras() {
  const achadas: { seletor: string; reinicia: string }[] = [];
  postcss.parse(css).walkRules((regra) => {
    const decl = regra.nodes?.find(
      (d): d is postcss.Declaration =>
        d.type === 'decl' &&
        ((d.prop === 'font' && d.value === 'inherit') ||
          (d.prop === 'outline' && d.value.includes('var(--accent)'))),
    );
    if (!decl || /\.(campo|fld):/.test(regra.selector)) return;
    for (const seletor of regra.selectors) {
      if (/^\.ap (button|input|select|textarea|:focus-visible)/.test(seletor)) {
        achadas.push({ seletor, reinicia: decl.prop });
      }
    }
  });
  return achadas;
}

function controlesNovos(): { tag: string; classes: string }[] {
  const html = renderToStaticMarkup(
    <div className="ap" data-theme="dark">
      <Button variant="primario">Salvar</Button>
      <Button variant="secundario">Voltar</Button>
      <Button variant="fantasma">Cancelar</Button>
      <Button variant="destrutivo">Apagar</Button>
      <IconButton variant="vidro" aria-label="Fechar" />
      <LinkDeAcao>Ver tudo</LinkDeAcao>
      <Chip>Prontos</Chip>
      <Segmented value="a" onValueChange={() => {}} opcoes={[{ valor: 'a', rotulo: 'A' }]} aria-label="modo" />
      <Tabs value="a">
        <TabsList>
          <TabsTrigger value="a">Aba</TabsTrigger>
        </TabsList>
      </Tabs>
      <Checkbox checked={false} onCheckedChange={() => {}} aria-label="marca" />
      <Switch checked={false} onCheckedChange={() => {}} aria-label="liga" />
      <GrupoDeRadio value="a" onValueChange={() => {}} aria-label="grupo">
        <Radio value="a" aria-label="um" />
      </GrupoDeRadio>
      <Input aparencia="sala" aria-label="campo" />
      <Textarea aria-label="texto" />
    </div>,
  );
  return [...html.matchAll(/<(button|input|textarea)\s[^>]*?\bclass="([^"]*)"/g)].map((m) => ({
    tag: m[1],
    classes: m[2],
  }));
}

describe('D-1119: a casca antiga não herda por cima da Sala escura', () => {
  it('acha as regras reiniciadoras da casca (a prova não pode passar no vazio)', () => {
    const regras = regrasReiniciadoras();
    expect(regras.filter((r) => r.reinicia === 'font').map((r) => r.seletor.split(':')[0]))
      .toEqual(['.ap button', '.ap input', '.ap select', '.ap textarea']);
    expect(regras.filter((r) => r.reinicia === 'outline')).toHaveLength(1);
  });

  it('cada regra reiniciadora exclui os controles novos por :where(:not(marcador)), com especificidade zero', () => {
    for (const { seletor } of regrasReiniciadoras()) {
      const excecao = /:where\(:not\((.+)\)\)$/.exec(seletor);
      expect(excecao, `${seletor} sem a exceção :where(:not(...))`).not.toBeNull();
      // O marcador do campo basta para input/select/textarea; o botão e o foco
      // precisam dos dois, porque os dois tipos de controle passam por eles.
      expect(excecao![1]).toContain('[data-sala]');
      if (/^\.ap (button|:focus-visible)/.test(seletor)) {
        for (const m of MARCADORES) expect(excecao![1]).toContain(m);
      }
    }
  });

  it('todo controle novo carrega o marcador que a exceção reconhece', () => {
    const controles = controlesNovos();
    expect(controles.length).toBeGreaterThanOrEqual(14);
    for (const { tag, classes } of controles) {
      expect(
        /outline-foco|rounded-campo/.test(classes),
        `<${tag} class="${classes.slice(0, 60)}…"> perdeu o marcador: a casca volta a sobrescrever a fonte e o foco dele`,
      ).toBe(true);
    }
  });

  it('o botão antigo não leva o marcador: segue sob a regra da casca', () => {
    const html = renderToStaticMarkup(
      <>
        <Button variant="default">Antigo</Button>
        <Button variant="outline">Antigo</Button>
        <Input />
      </>,
    );
    expect(html).not.toContain('data-sala');
  });
});
