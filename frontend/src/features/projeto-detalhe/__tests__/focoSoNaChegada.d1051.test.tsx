import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { assentar, montar } from '@/features/editor/__tests__/domMinimo';
import { useFocoDaLinhaNaUrl } from '../useFocoDaLinhaNaUrl';

// D-1051 · achado da auditoria: o `?corte=` fica na URL, e a busca do Workspace tira a linha
// da lista e a devolve. Remontada, ela pegava o foco de volta no meio da digitação, e a
// letra seguinte caía nela: "A" desfaz a aprovação sem confirmar.

let limpar: () => Promise<void> = async () => undefined;
afterEach(async () => {
  await limpar();
  limpar = async () => undefined;
});

async function montarLinha(chegada: string) {
  await limpar();
  const linha = { scrollIntoView: vi.fn(), focus: vi.fn() };
  function Sonda() {
    const ref = useFocoDaLinhaNaUrl('c9');
    ref.current = linha as unknown as HTMLElement;
    return null;
  }
  ({ limpar } = montar(
    <MemoryRouter initialEntries={[{ pathname: '/projetos/p1', search: '?corte=c9', key: chegada }]}>
      <Sonda />
    </MemoryRouter>,
  ));
  await assentar();
  return linha;
}

describe('D-1051 · o foco é da chegada, não de cada montagem da linha', () => {
  it('a primeira montagem leva o foco; a linha que volta da busca não', async () => {
    const primeira = await montarLinha('chegada-1');
    expect(primeira.focus).toHaveBeenCalledTimes(1);

    const devolvida = await montarLinha('chegada-1');
    expect(devolvida.focus).not.toHaveBeenCalled();
    expect(devolvida.scrollIntoView).not.toHaveBeenCalled();
  });

  it('voltar do Fire outra vez é outra chegada, e leva o foco de novo', async () => {
    const volta = await montarLinha('chegada-2');
    expect(volta.focus).toHaveBeenCalledTimes(1);
  });
});
