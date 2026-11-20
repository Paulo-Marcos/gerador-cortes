import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { QueryClient, QueryClientProvider, QueryObserver } from '@tanstack/react-query';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { AvisoDeSincronia } from '../AvisoDeSincronia';
import { GlobalRail } from '../GlobalRail';
import { menuDoTrilho, type TelaId } from '../upgradeRoutes';
import { useSincronia, useSincroniaBruta, type Sincronia } from '../useSincronia';

// D-1160 (E-069 H-13; DIRECAO §7.0) · O aviso de sincronização volta ao pé do trilho,
// valendo para o app inteiro. O chip da TopBar sumiu com ela (D-1137) e nenhum teste
// olhava se o status aparecia na tela: este olha, em cada tela e nas duas larguras.

const ESTADOS: Sincronia[] = ['sincronizado', 'atualizando', 'erro'];
const TELAS: TelaId[] = ['biblioteca', 'pos', 'shorts', 'config'];

function trilho(sincronia: Sincronia | undefined, expandido: boolean, tela: TelaId = 'biblioteca') {
  return renderToStaticMarkup(
    <MemoryRouter>
      <GlobalRail expandido={expandido} onAlternar={vi.fn()} telaAtual={tela} menu={menuDoTrilho()} sincronia={sincronia} />
    </MemoryRouter>,
  );
}

describe('o aviso no pé do trilho', () => {
  it.each(ESTADOS)('"%s" aparece com o trilho aberto e fechado, em todas as telas', (estado) => {
    for (const tela of TELAS) {
      for (const expandido of [true, false]) {
        const html = trilho(estado, expandido, tela);
        expect(html).toContain(`data-sincronia="${estado}"`);
        expect(html).toMatch(/role="status"[^>]*>[^<]+</);
      }
    }
  });

  it('fica no pé: depois das ferramentas e antes da marca', () => {
    const html = trilho('sincronizado', true);
    expect(html.indexOf('>Configurações<')).toBeLessThan(html.indexOf('data-sincronia'));
    expect(html.indexOf('data-sincronia')).toBeLessThan(html.indexOf('>CutCut<'));
  });

  it('aberto mostra o rótulo; fechado, só o ícone, com o rótulo para o leitor de tela', () => {
    const aberto = trilho('atualizando', true);
    expect(aberto).toMatch(/data-tom="curso"[^>]*>(<[^>]*>)*Atualizando/);
    const fechado = trilho('atualizando', false);
    expect(fechado).not.toMatch(/data-tom="curso"[^>]*>(<[^>]*>)*Atualizando<\/span><\/span>/);
    expect(fechado).toMatch(/role="status" class="sr-only">Atualizando</);
  });

  it('cada estado tem tom e forma próprios (não só a cor)', () => {
    expect(trilho('sincronizado', true)).toContain('data-marca="visto"');
    expect(trilho('atualizando', true)).toContain('data-marca="giro"');
    expect(trilho('erro', true)).toContain('data-marca="losango"');
    expect(trilho('erro', true)).toContain('Erro de sincronização');
  });

  it('sem o dado, o pé não o desenha', () => {
    expect(trilho(undefined, true)).not.toContain('data-sincronia');
  });

  it('só a região de status fala: o selo é decorativo e a região não é "assertive"', () => {
    const html = renderToStaticMarkup(<AvisoDeSincronia sincronia="sincronizado" expandido />);
    expect(html).toMatch(/<span[^>]*data-tom="ok"[^>]*aria-hidden="true"/);
    expect(html).not.toContain('aria-live');
    expect(html.match(/role="status"/g)).toHaveLength(1);
  });

  it('atualizar sem mudar de estado não muda nada no DOM; trocar de estado muda o texto falado', () => {
    const falado = (e: Sincronia) => /role="status" class="sr-only">([^<]*)</.exec(renderToStaticMarkup(<AvisoDeSincronia sincronia={e} expandido />))?.[1];
    expect(renderToStaticMarkup(<AvisoDeSincronia sincronia="sincronizado" expandido />)).toBe(
      renderToStaticMarkup(<AvisoDeSincronia sincronia="sincronizado" expandido />),
    );
    expect(new Set(ESTADOS.map(falado)).size).toBe(3);
  });

  it('respeita a escala de fonte, sem style inline e sem aria-live no trilho', () => {
    for (const estado of ESTADOS) {
      const aviso = renderToStaticMarkup(<AvisoDeSincronia sincronia={estado} expandido />);
      // O `style` do ícone do Selo é do componente da Sala; o do aviso (o wrapper e a região) não existe.
      expect(aviso.replace(/<svg[^>]*>/g, '')).not.toContain('style=');
      expect(trilho(estado, true)).not.toContain('aria-live');
    }
    const fonte = readFileSync(resolve(__dirname, '../AvisoDeSincronia.tsx'), 'utf-8');
    expect(fonte).not.toMatch(/style=|text-\[\d|text-(xs|sm|base|lg)\b/);
  });
});

function Sonda({ fn }: { fn: () => Sincronia }) {
  return <i>{fn()}</i>;
}
const ler = (qc: QueryClient, fn: () => Sincronia) =>
  /<i>(.*)<\/i>/.exec(renderToStaticMarkup(<QueryClientProvider client={qc}><Sonda fn={fn} /></QueryClientProvider>))?.[1];

describe('de onde vem o dado (cache de consultas, vale em qualquer tela)', () => {
  it('sem consulta em voo: sincronizado', () => {
    expect(ler(new QueryClient(), useSincroniaBruta)).toBe('sincronizado');
  });

  it('uma busca em voo, de qualquer tela: atualizando', () => {
    const qc = new QueryClient();
    void qc.fetchQuery({ queryKey: ['projetos'], queryFn: () => new Promise(() => undefined) });
    expect(ler(qc, useSincroniaBruta)).toBe('atualizando');
  });

  it('uma consulta em uso que falhou: erro', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const obs = new QueryObserver(qc, { queryKey: ['cortes'], queryFn: () => Promise.reject(new Error('x')) });
    const sair = obs.subscribe(() => undefined);
    await vi.waitFor(() => expect(qc.getQueryState(['cortes'])?.status).toBe('error'));
    expect(ler(qc, useSincroniaBruta)).toBe('erro');
    sair();
    expect(ler(qc, useSincroniaBruta)).toBe('sincronizado'); // ninguém mais olha: não é problema da tela
  });

  it('a busca que acabou de começar ainda não vira "atualizando" na tela (a espera evita o pisca da live)', () => {
    const qc = new QueryClient();
    void qc.fetchQuery({ queryKey: ['live'], queryFn: () => new Promise(() => undefined) });
    expect(ler(qc, () => useSincronia())).toBe('sincronizado');
  });
});

describe('a casca liga o dado ao trilho', () => {
  it('o trilho da casca recebe a sincronização, em todas as telas (não só na linha do topo)', () => {
    const fonte = readFileSync(resolve(__dirname, '../UpgradeShell.tsx'), 'utf-8');
    expect(fonte).toMatch(/<GlobalRail[^]*?sincronia=\{useSincronia\(\)\}/);
  });
});
