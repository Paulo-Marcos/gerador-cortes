import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { ConfirmDialog } from '../confirm-dialog';
import { Modal, TAMANHO_DO_MODAL } from '../modal';

// D-1122 (E-069 H-11b): `Modal` e `ConfirmDialog` viraram o `Dialog` por baixo, e as
// telas não mudaram. Este arquivo prova que cada forma de chamada que o repositório
// usa continua valendo. Quem chama o `Modal` hoje (levantado na D-1122):
//   · 31 telas e modais em `features/` e `components/ThumbnailHintsEditor.tsx`;
//   · só passam `open`, `onClose`, `title`, `description?`, `footer?` e `size`
//     ('sm' ×2, 'lg' ×1, '2xl' ×3 e o padrão 'md' nos demais).

const noop = () => {};

describe('Modal sobre o Dialog (D-1122)', () => {
  it('a chamada mínima — open, onClose, title — desenha o diálogo com o miolo', () => {
    const h = renderToStaticMarkup(
      <Modal open onClose={noop} title="Metadados">
        <p>miolo</p>
      </Modal>,
    );
    expect(h).toContain('role="dialog"');
    expect(h).toContain('Metadados');
    expect(h).toContain('miolo');
    expect(h).toContain('w-[560px]');
  });

  it('fechado não desenha nada', () => {
    expect(renderToStaticMarkup(<Modal open={false} onClose={noop} title="x">y</Modal>)).toBe('');
  });

  it('descrição e rodapé seguem como antes', () => {
    const h = renderToStaticMarkup(
      <Modal open onClose={noop} title="T" description="Descrição" footer={<button>Salvar</button>}>
        corpo
      </Modal>,
    );
    expect(h).toContain('Descrição');
    expect(h).toMatch(/<footer[^>]*>.*Salvar/);
  });

  it('título em elemento (não só texto) também vale', () => {
    const h = renderToStaticMarkup(
      <Modal open onClose={noop} title={<span>Corte <b>#3</b></span>}>
        x
      </Modal>,
    );
    expect(h).toContain('<b>#3</b>');
  });

  it.each(['sm', 'md', 'lg', 'xl', '2xl'] as const)('o tamanho %s continua aceito e vira um degrau do diálogo', (size) => {
    const h = renderToStaticMarkup(<Modal open onClose={noop} title="T" size={size}>x</Modal>);
    expect(h).toContain('role="dialog"');
    expect(TAMANHO_DO_MODAL[size]).toMatch(/^(sm|md|lg|xl)$/);
  });

  it('o 2xl, do modal de marcar quadro (D-542), fica no degrau mais largo', () => {
    expect(renderToStaticMarkup(<Modal open onClose={noop} title="T" size="2xl">x</Modal>)).toContain('w-[1152px]');
  });
});

describe('ConfirmDialog sobre o Dialog (D-1122)', () => {
  const pedido = {
    titulo: 'Excluir a live?',
    descricao: 'Isto não se desfaz.',
    confirmLabel: 'Excluir live',
    tone: 'danger' as const,
  };

  it('o pedido perigoso confirma em vermelho cheio; o Cancelar leva o foco inicial', () => {
    const h = renderToStaticMarkup(<ConfirmDialog pedido={pedido} onCancel={vi.fn()} onConfirm={vi.fn()} />);
    expect(h).toMatch(/bg-erro-cheio[^>]*>Excluir live/);
    expect(h).toMatch(/data-autofocus[^>]*>Cancelar/);
  });

  it('o pedido comum confirma sem o vermelho', () => {
    const h = renderToStaticMarkup(
      <ConfirmDialog pedido={{ ...pedido, tone: 'default' }} onCancel={vi.fn()} onConfirm={vi.fn()} />,
    );
    expect(h).not.toContain('bg-erro-cheio');
  });
});
