import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useStatusBruto } from '../useBruto';
import { assentar, montar } from './domMinimo';

// D-1044: medido no navegador: riscar pelo botão usa outra rota que não o PATCH, e o
// aviso de bruto defasado não sumia até recarregar. O status relê quando o corte muda,
// seja qual for a porta da mudança.

const h = vi.hoisted(() => ({
  ler: vi.fn(),
  versao: 1,
  redesenhar: (): void => undefined,
}));

vi.mock('../api/bruto', () => ({ brutoApi: { statusClipBruto: h.ler } }));
vi.mock('../useCortes', async (original) => ({
  ...(await original<typeof import('../useCortes')>()),
  useCorte: () => ({ dataUpdatedAt: h.versao }),
}));

let status: ReturnType<typeof useStatusBruto>;
function Sonda() {
  const [, setVolta] = useState(0);
  h.redesenhar = () => setVolta((n) => n + 1);
  status = useStatusBruto('c1');
  return null;
}

let limpar: () => Promise<void> = async () => undefined;
afterEach(async () => {
  await limpar();
  h.ler.mockReset();
  h.versao = 1;
});

const abrir = async () => {
  ({ limpar } = montar(
    <QueryClientProvider client={new QueryClient()}>
      <Sonda />
    </QueryClientProvider>,
  ));
  await assentar();
};

describe('D-1044 · o status do bruto segue o corte', () => {
  it('o corte mudou por qualquer porta: o aviso de defasado é relido', async () => {
    h.ler.mockResolvedValue({ status: 'pronto', bruto_defasado: true });
    await abrir();
    expect(status.data?.bruto_defasado).toBe(true);

    h.ler.mockResolvedValue({ status: 'pronto', bruto_defasado: false });
    h.versao = 2;
    h.redesenhar();
    await assentar();
    expect(status.data?.bruto_defasado).toBe(false);
  });

  it('sem o corte mudar, não relê à toa', async () => {
    h.ler.mockResolvedValue({ status: 'pronto', bruto_defasado: false });
    await abrir();
    const leituras = h.ler.mock.calls.length;
    h.redesenhar();
    await assentar();
    expect(h.ler.mock.calls.length).toBe(leituras);
  });
});
