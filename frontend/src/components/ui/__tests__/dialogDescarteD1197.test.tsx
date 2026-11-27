import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Dialog, useAlteracaoPendente } from '../dialog';
import { assentar, montarComElementos } from './domDeElementos';

// D-1197 (DIRECAO §8.2 Formulário): "sair com alteração pendente pede confirmação".
// Em Configurações › Editar identidade, digitar e apertar Esc fechava o diálogo e
// perdia o texto. Com alteração pendente, Esc, o clique fora e o X perguntam antes.

vi.mock('@radix-ui/react-dialog', () => import('./radixDeMentira'));

const fechou = vi.fn();

/** Um formulário que declara ao diálogo que tem texto não salvo. */
function Campo() {
  const [texto, setTexto] = useState('');
  useAlteracaoPendente(texto !== '');
  return <input id="campo" value={texto} onChange={(e) => setTexto(e.target.value)} />;
}

function Tela() {
  const [aberto, setAberto] = useState(true);
  const fechar = () => {
    fechou();
    setAberto(false);
  };
  return (
    <Dialog open={aberto} onClose={fechar} title="Editar identidade">
      <Campo />
    </Dialog>
  );
}

let tela: ReturnType<typeof montarComElementos>;
const abrir = async () => {
  tela = montarComElementos(<Tela />);
  await assentar();
};
const caixa = () => tela.achar((n) => n.props.role === 'dialog')[0];
const SAIDAS = {
  'o Esc': () => tela.disparar(caixa(), 'onKeyDown', { key: 'Escape' }),
  'o clique fora': () => tela.disparar(tela.achar((n) => 'data-veu' in n.props)[0], 'onPointerDown'),
  'o X': () => tela.disparar(tela.achar((n) => n.props['aria-label'] === 'Fechar')[0], 'onClick'),
};

afterEach(async () => {
  await tela.limpar();
  fechou.mockReset();
});

describe.each(Object.entries(SAIDAS))('Dialog: sair por %s (D-1197)', (_, sair) => {
  it('sem alteração, fecha direto', async () => {
    await abrir();
    await sair();
    expect(fechou).toHaveBeenCalledOnce();
    expect(tela.texto()).not.toContain('Descartar alterações?');
  });

  it('com alteração pendente, pergunta antes e não fecha', async () => {
    await abrir();
    await tela.digitar(tela.porId('campo'), 'novo nome');
    await sair();
    expect(fechou).not.toHaveBeenCalled();
    expect(tela.texto()).toContain('Descartar alterações?');
  });
});

describe('a confirmação de descarte (D-1197)', () => {
  const perguntar = async () => {
    await abrir();
    await tela.digitar(tela.porId('campo'), 'novo nome');
    await SAIDAS['o Esc']();
  };

  it('"Continuar editando" volta ao diálogo com o texto intacto', async () => {
    await perguntar();
    await tela.disparar(tela.botao('Continuar editando'), 'onClick');

    expect(fechou).not.toHaveBeenCalled();
    expect(tela.texto()).not.toContain('Descartar alterações?');
    expect(tela.porId('campo').props.value).toBe('novo nome');
  });

  it('"Descartar" fecha o diálogo', async () => {
    await perguntar();
    await tela.disparar(tela.botao('Descartar'), 'onClick');

    expect(fechou).toHaveBeenCalledOnce();
    expect(tela.texto()).toBe('');
  });

  it('desfeita a alteração, volta a fechar direto', async () => {
    await abrir();
    await tela.digitar(tela.porId('campo'), 'x');
    await tela.digitar(tela.porId('campo'), '');
    await SAIDAS['o Esc']();

    expect(fechou).toHaveBeenCalledOnce();
  });
});
