import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ToastProvider } from '@/components/ui/toaster';
import type { EstiloDaCapa } from '../api';
import { EstiloDaCapaSection } from '../EstiloDaCapaSection';
import { AndamentoDoPedido } from '../GerarNoChatGPT';

// D-1167 (E-069 H-19; DIRECAO §3, §4.3, §5, §7.5): as peças do ChatGPT nas capas, na Sala
// escura. O "Mais" e o primário não moram aqui: nesta pasta não há botão primário.

const PASTA = resolve(__dirname, '..');
const FONTES = readdirSync(PASTA)
  .filter((nome) => nome.endsWith('.tsx'))
  .map((nome) => ({ nome, texto: readFileSync(resolve(PASTA, nome), 'utf8') }));

const ESTILO: EstiloDaCapa = {
  protagonista: 'apresentador',
  luminancia_minima: 95,
  escuros_maximo: 40,
  fotos_do_apresentador: ['pensativo.jpg'],
  expressoes: ['pensativo'],
  maximo_de_fotos: 40,
};

function secao(estilo: EstiloDaCapa) {
  const qc = new QueryClient();
  qc.setQueryData(['capa-chatgpt', 'estilo'], estilo);
  return renderToStaticMarkup(
    <QueryClientProvider client={qc}>
      <ToastProvider>
        <EstiloDaCapaSection />
      </ToastProvider>
    </QueryClientProvider>,
  );
}

describe('D-1167 · capa-chatgpt no desenho da Sala escura', () => {
  it('nenhum arquivo da pasta tem botão primário, vidro de desfoque, style de aparência ou token legado', () => {
    expect(FONTES.length).toBeGreaterThan(0);
    for (const { nome, texto } of FONTES) {
      expect(texto, nome).not.toMatch(/variant=["']?(?:primario|primary|default)\b/);
      expect(texto, nome).not.toMatch(/backdrop-filter|backdrop-blur|backdropFilter/);
      expect(texto, nome).not.toMatch(/style=\{\{/);
      expect(texto, nome).not.toMatch(/var\(--wb-|var\(--(?:sel|line|ink|mute|dim)\b|\buppercase\b/);
      expect(texto, nome).not.toMatch(/text-\[\d/);
      expect(texto, nome).not.toMatch(/transition-all/);
    }
  });

  it('a seção rende sem botão primário e com os botões na variante nova, com data-sala', () => {
    const html = secao(ESTILO);
    expect(html).not.toMatch(/data-variant="(?:primario|primary)"/);
    const botoes = html.match(/<button\b[^>]*data-variant="secundario"[^>]*>/g) ?? [];
    expect(botoes.length).toBeGreaterThanOrEqual(2); // Adicionar fotos e Salvar
    for (const tag of botoes) expect(tag).toContain('data-sala=""');
  });

  it('o protagonista é um rádio da Sala: o escolhido em íris, um só, com foco desenhado', () => {
    const html = secao(ESTILO);
    expect(html.match(/role="radio"/g)).toHaveLength(2);
    expect(html.match(/aria-checked="true"/g)).toHaveLength(1);
    expect(html).toMatch(/role="radio" data-sala=""/);
    expect(html).toContain('border-iris-fio bg-iris-suave');
    expect(html).toContain('focus-visible:outline-foco');
  });

  it('os campos da meta de claridade são Field + Input da Sala, com rótulo ligado', () => {
    const html = secao(ESTILO);
    expect(html).toMatch(/<label for="[^"]+"[^>]*>Luz média mínima \(0–255\)<\/label>/);
    expect(html.match(/<input[^>]*type="number"[^>]*data-sala=""|<input[^>]*data-sala=""[^>]*type="number"/g)).toHaveLength(2);
  });

  it('botão de adicionar fotos trava com o banco cheio, pelo atributo (não pela classe)', () => {
    const html = secao({ ...ESTILO, maximo_de_fotos: 1 });
    const tag = html.match(/<button\b[^>]*>(?=[^<]*(?:<svg[\s\S]*?<\/svg>)?\s*Adicionar fotos)/)?.[0] ?? '';
    expect(tag).toMatch(/\sdisabled(=|\s|>)/);
  });

  it('o andamento do robô usa a escala e os tokens: erro em `erro`, resto em `fg-2`', () => {
    const erro = renderToStaticMarkup(
      <AndamentoDoPedido pedido={{ estado: 'erro', etapa: 'anexar', erro: 'caiu' } as never} />,
    );
    expect(erro).toContain('text-micro text-erro');
    const andando = renderToStaticMarkup(
      <AndamentoDoPedido pedido={{ estado: 'executando', etapa: 'colando' } as never} />,
    );
    expect(andando).toContain('text-micro text-fg-2');
  });
});
