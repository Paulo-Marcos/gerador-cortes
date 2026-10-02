import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { PreRequisitosLista, resumoDoAmbiente } from '../PreRequisitosSection';
import type { Ambiente, ItemAmbiente } from '../useAmbiente';

function item(id: string, estado: ItemAmbiente['estado'], obrigatorio = true): ItemAmbiente {
  return {
    id,
    nome: id,
    obrigatorio,
    estado,
    detalhe: `detalhe ${id}`,
    como_resolver: estado === 'ok' ? '' : `resolva ${id}`,
  };
}

describe('resumoDoAmbiente', () => {
  it('diz que está tudo instalado quando nada falta', () => {
    expect(resumoDoAmbiente({ pronto: true, itens: [item('ffmpeg', 'ok')] })).toBe(
      'Tudo instalado.',
    );
  });

  it('prioriza o obrigatório faltando', () => {
    const ambiente: Ambiente = {
      pronto: false,
      itens: [item('ffmpeg', 'erro'), item('chrome', 'aviso', false)],
    };
    expect(resumoDoAmbiente(ambiente)).toMatch(/^1 obrigatório/);
  });

  it('com só opcionais faltando, avisa que o app funciona', () => {
    const ambiente: Ambiente = { pronto: true, itens: [item('chrome', 'aviso', false)] };
    expect(resumoDoAmbiente(ambiente)).toMatch(/o app funciona/);
  });
});

describe('PreRequisitosLista', () => {
  it('mostra como resolver só do que falta e marca o opcional', () => {
    const html = renderToStaticMarkup(
      <PreRequisitosLista
        ambiente={{ pronto: true, itens: [item('ffmpeg', 'ok'), item('chrome', 'aviso', false)] }}
      />,
    );
    expect(html).toContain('resolva chrome');
    expect(html).not.toContain('resolva ffmpeg');
    expect(html).toContain('opcional');
  });

  // D-861: o estado de cada item é dito por um ícone, por nome desde a D-857.
  it.each([
    ['ok', 'lucide-circle-check'],
    ['aviso', 'lucide-triangle-alert'],
    ['erro', 'lucide-circle-x'],
  ] as const)('estado %s: desenha %s a 16 px', (estado, classe) => {
    const html = renderToStaticMarkup(
      <PreRequisitosLista ambiente={{ pronto: true, itens: [item('ffmpeg', estado)] }} />,
    );
    const icone = html.match(/<svg[^>]*>/)?.[0] ?? '';
    expect(icone).toContain(classe);
    expect(icone).toContain('width="16"');
  });
});
