import type { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { ConfirmDialog, type PedidoConfirmacao } from '@/components/ui/confirm-dialog';

// D-993: a escolha opcional que segue com a confirmação (o motivo de apagar).
//
// Sem DOM não há clique; a sonda chama o diálogo como função e, a cada quadro,
// aciona um handler da árvore. O setState no meio do desenho faz o React do
// servidor desenhar de novo com o estado novo (mesma técnica do teste da
// linha do corte, D-878).

const PEDIDO: PedidoConfirmacao = {
  titulo: 'Excluir o corte de vez',
  descricao: 'Não há como desfazer.',
  confirmLabel: 'Excluir de vez',
  tone: 'danger',
  escolha: {
    pergunta: 'Por que sai? (opcional)',
    opcoes: [
      { slug: 'tema_fraco', rotulo: 'Tema não rende' },
      { slug: 'repetido', rotulo: 'Repete outro corte' },
    ],
  },
};

type No = ReactElement<Record<string, unknown> & { children?: unknown }>;

function elementos(raiz: unknown): No[] {
  if (Array.isArray(raiz)) return raiz.flatMap(elementos);
  if (!raiz || typeof raiz !== 'object' || !('props' in raiz)) return [];
  const no = raiz as No;
  return [no, ...elementos(no.props.children)];
}

type Passo = (arvore: No[]) => void;

function encenar(passos: Passo[], pedido: PedidoConfirmacao = PEDIDO) {
  const onConfirm = vi.fn();
  let quadro = 0;
  function Sonda() {
    const arvore = ConfirmDialog({ pedido, onCancel: vi.fn(), onConfirm }) as No;
    passos[quadro++]?.(elementos(arvore));
    return arvore;
  }
  const html = renderToStaticMarkup(<Sonda />);
  return { onConfirm, html };
}

const escolher = (slug: string | undefined) => (arvore: No[]) => {
  const escolha = arvore.find((no) => 'onEscolher' in no.props)!;
  (escolha.props.onEscolher as (s: string | undefined) => void)(slug);
};

const confirmar = (arvore: No[]) => {
  const botao = arvore.find((no) => no.props.children === 'Excluir de vez')!;
  (botao.props.onClick as () => void)();
};

describe('ConfirmDialog · escolha opcional (D-993)', () => {
  it('mostra a pergunta e as opções, nenhuma marcada', () => {
    const { html } = encenar([]);
    expect(html).toContain('Por que sai? (opcional)');
    expect(html).toContain('Tema não rende');
    expect(html).toContain('Repete outro corte');
    expect(html).not.toContain('aria-pressed="true"');
  });

  it('confirmar sem escolher segue rápido e não manda escolha', () => {
    const { onConfirm } = encenar([confirmar]);
    expect(onConfirm).toHaveBeenCalledOnce();
    expect(onConfirm.mock.calls[0]).toEqual([]);
  });

  it('a opção marcada segue com a confirmação', () => {
    const { onConfirm, html } = encenar([escolher('repetido'), confirmar]);
    expect(html).toMatch(/aria-pressed="true"[^>]*>Repete outro corte/);
    expect(onConfirm).toHaveBeenCalledWith('repetido');
  });

  it('desmarcar volta a confirmar sem escolha', () => {
    const { onConfirm } = encenar([escolher('repetido'), escolher(undefined), confirmar]);
    expect(onConfirm.mock.calls[0]).toEqual([]);
  });

  it('pedido sem escolha não desenha opção nenhuma', () => {
    const { html } = encenar([], { ...PEDIDO, escolha: undefined });
    expect(html).not.toContain('aria-pressed');
  });
});
