import type { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { ConfirmDialog, type PedidoConfirmacao } from '@/components/ui/confirm-dialog';

// D-1005: a escolha do diálogo é de múltipla escolha — um corte pode sair por
// mais de um motivo. Mesma sonda do teste da D-993: sem DOM, cada quadro
// aciona um handler e o setState redesenha.

const PEDIDO: PedidoConfirmacao = {
  titulo: 'Excluir o corte de vez',
  descricao: 'Não há como desfazer.',
  confirmLabel: 'Excluir de vez',
  tone: 'danger',
  escolha: {
    pergunta: 'Por que sai?',
    opcoes: [
      { slug: 'tema_fraco', rotulo: 'Tema não rende' },
      { slug: 'repetido', rotulo: 'Repete outro corte' },
      { slug: 'curto_demais', rotulo: 'Curto demais' },
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

function encenar(passos: Passo[]) {
  const onConfirm = vi.fn();
  let quadro = 0;
  function Sonda() {
    const arvore = ConfirmDialog({ pedido: PEDIDO, onCancel: vi.fn(), onConfirm }) as No;
    passos[quadro++]?.(elementos(arvore));
    return arvore;
  }
  const html = renderToStaticMarkup(<Sonda />);
  return { onConfirm, html };
}

const alternar = (slug: string) => (arvore: No[]) => {
  const escolha = arvore.find((no) => 'onAlternar' in no.props)!;
  (escolha.props.onAlternar as (s: string) => void)(slug);
};

const confirmar = (arvore: No[]) => {
  const botao = arvore.find((no) => no.props.children === 'Excluir de vez')!;
  (botao.props.onClick as () => void)();
};

describe('ConfirmDialog · múltipla escolha (D-1005)', () => {
  it('marca mais de uma opção ao mesmo tempo', () => {
    const { html } = encenar([alternar('tema_fraco'), alternar('curto_demais')]);
    expect(html.match(/aria-pressed="true"/g)).toHaveLength(2);
    expect(html).toMatch(/aria-pressed="true"[^>]*>Tema não rende/);
    expect(html).toMatch(/aria-pressed="true"[^>]*>Curto demais/);
  });

  it('as marcadas seguem na ordem das opções, não na dos cliques', () => {
    const { onConfirm } = encenar([alternar('curto_demais'), alternar('tema_fraco'), confirmar]);
    expect(onConfirm).toHaveBeenCalledWith(['tema_fraco', 'curto_demais']);
  });

  it('desmarcar uma mantém as outras', () => {
    const { onConfirm } = encenar([
      alternar('tema_fraco'),
      alternar('repetido'),
      alternar('tema_fraco'),
      confirmar,
    ]);
    expect(onConfirm).toHaveBeenCalledWith(['repetido']);
  });

  it('nenhuma marcada confirma sem escolha', () => {
    const { onConfirm } = encenar([alternar('repetido'), alternar('repetido'), confirmar]);
    expect(onConfirm.mock.calls[0]).toEqual([]);
  });
});
