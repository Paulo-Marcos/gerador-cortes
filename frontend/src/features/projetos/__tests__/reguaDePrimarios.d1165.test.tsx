import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, it } from 'vitest';
import { ToastProvider } from '@/components/ui/toaster';
import { esperarPrimarios } from '@/shared/qualidade/__tests__/primariosDaTela';
import { ConteudoDaBiblioteca, type EstadoDaBiblioteca } from '../BibliotecaPage';
import { cortesDoMapa, diasDaRegua, esperandoVoce, noArHaPouco } from '../regrasDaBiblioteca';
import { corte, projeto } from './fixtures/projetoDaSala';

// D-1165 (E-069 H-06): a Biblioteca passa pela régua `esperarPrimarios` (DIRECAO §5), a
// mesma que vale para todas as telas redesenhadas. O contador próprio do
// `primariaDaBiblioteca.test.tsx` segue ao lado; este é o que a catraca compartilha.

const nada = () => undefined;
const CASA = [
  projeto({ id: 'destaque', titulo_live: 'A live do destaque', data_live: '20261120', total_cortes: 6 }),
  projeto({ id: 'espera', titulo_live: 'Outra live', data_live: '20261118', total_cortes: 2, total_aprovados: 1 }),
];

function montar(estado: EstadoDaBiblioteca) {
  return renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}>
      <ToastProvider>
        <MemoryRouter>
          <ConteudoDaBiblioteca estado={estado} />
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

const cheio: EstadoDaBiblioteca = {
  tipo: 'cheio',
  projetos: CASA,
  verTodas: false,
  onVoltar: nada,
  sala: {
    total: CASA.length,
    destaque: CASA[0],
    cortesDoDestaque: cortesDoMapa([corte({ id: 'c1', status: 'aprovado' })], CASA[0].id),
    destino: '@sapo',
    dias: diasDaRegua(CASA, new Date(2026, 10, 20, 21)),
    esperando: esperandoVoce(CASA, CASA[0].id),
    noAr: noArHaPouco(CASA),
    ir: nada,
    onVerTodas: nada,
  },
};

describe('a Biblioteca na régua umPrimarioPorTela', () => {
  it('cheia: uma primária acesa, a do "Continue"', () => {
    esperarPrimarios(montar(cheio), 'Biblioteca');
  });

  it('canal novo: uma primária acesa, "Baixar a live"', () => {
    esperarPrimarios(montar({ tipo: 'vazio', onBuscarLives: nada, onLigarCanal: nada }), 'BibliotecaVazia');
  });
});
