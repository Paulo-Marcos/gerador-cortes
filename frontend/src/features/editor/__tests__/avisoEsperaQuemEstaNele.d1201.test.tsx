import { useEffect } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider, useToast } from '@/components/ui/toaster';
import { montarComFoco, type No } from './domComFoco';
import { assentar } from './domMinimo';

// D-1201 (§8.2): o Desfazer do corte riscado mora num aviso que some sozinho. Com o
// foco nele, o aviso sumia no meio da escolha e o foco caía no <body>. O relógio
// para enquanto o foco ou o mouse estão no aviso, e segue depois.

const DURACAO_MS = 800;
const passar = (ms: number) => new Promise((r) => setTimeout(r, ms));

let limpar: () => Promise<void> = async () => undefined;
afterEach(async () => {
  await limpar();
  limpar = async () => undefined;
});

function Avisa() {
  const { notify } = useToast();
  useEffect(() => {
    notify('Corte riscado.', { duracaoMs: DURACAO_MS, conteudo: <button type="button">Desfazer</button> });
  }, [notify]);
  return null;
}

type Ouvintes = Record<'onFocus' | 'onBlur' | 'onMouseEnter' | 'onMouseLeave', (e?: unknown) => void>;

async function abrir() {
  const montada = montarComFoco(
    <ToastProvider>
      <Avisa />
    </ToastProvider>,
  );
  limpar = montada.limpar;
  const aviso = () => montada.documento.body.achar((n: No) => n.getAttribute('role') === 'status');
  await vi.waitFor(() => expect(aviso()).not.toBeNull(), { timeout: 4000, interval: 5 });
  await assentar();
  const no = aviso()!;
  const chave = Object.keys(no).find((k) => k.startsWith('__reactProps$'))!;
  // Lê as props na hora: elas mudam a cada desenho.
  const ouvir = () => (no as unknown as Record<string, Ouvintes>)[chave];
  const disparar = async (nome: keyof Ouvintes, evento?: unknown) => {
    ouvir()[nome]?.(evento);
    await assentar();
  };
  const sumiu = () => vi.waitFor(() => expect(aviso()).toBeNull(), { timeout: 4000, interval: 5 });
  return { aviso, disparar, sumiu };
}

const saiu = { currentTarget: { contains: () => false }, relatedTarget: null };

describe('D-1201 · o aviso espera quem está nele', () => {
  it('sem ninguém nele, o aviso some sozinho', async () => {
    const tela = await abrir();
    await tela.sumiu();
  });

  it.each([
    ['o foco', 'onFocus', 'onBlur'],
    ['o mouse', 'onMouseEnter', 'onMouseLeave'],
  ] as const)('com %s no aviso ele fica; ao sair, volta a contar', async (_nome, entra, sai) => {
    const tela = await abrir();
    await tela.disparar(entra);
    await passar(DURACAO_MS * 2);
    expect(tela.aviso()).not.toBeNull();
    await tela.disparar(sai, saiu);
    await tela.sumiu();
  });

  it('o foco que passa de um botão a outro do aviso não religa o relógio', async () => {
    const tela = await abrir();
    await tela.disparar('onFocus');
    await tela.disparar('onBlur', { currentTarget: { contains: () => true }, relatedTarget: {} });
    await passar(DURACAO_MS * 2);
    expect(tela.aviso()).not.toBeNull();
  });
});
