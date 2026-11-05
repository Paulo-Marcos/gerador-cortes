import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import { corteKey } from '@/shared/chavesDeCache';
import { assentar, montar } from '../../__tests__/domMinimo';
import {
  buscarCenasEmGeracao,
  cenasEmGeracaoKey,
  useCenasEmGeracao,
  useGerarCenasClaude,
} from '../../useGeracoesDaIa';
import { CenasPanel } from '../CenasPanel';

// D-1037: o mesmo corte pagava a geração duas vezes. Com a cadeia do bruto em voo a
// Pós mostrava lista vazia e botão livre, e ao trocar de corte e voltar o estado se
// perdia. A geração é do corte, não da instância da tela (D-420, D-1033).

const h = vi.hoisted(() => ({
  gerar: vi.fn(),
  status: vi.fn(),
  avisos: [] as string[],
}));

vi.mock('@/features/ia', async (original) => ({
  ...(await original<typeof import('@/features/ia')>()),
  geracaoIaApi: { gerarCenasClaude: h.gerar, cenasEmGeracao: h.status },
  useUltimaGeracao: () => ({ data: undefined }),
}));
vi.mock('@/components/ui/toaster', () => ({
  useToast: () => ({ notify: (texto: string) => h.avisos.push(texto) }),
}));
// Salvar pede o roteador (`useBlocker`) e não é o que este teste olha.
vi.mock('../useGravarCenas', () => ({ useGravarCenas: () => () => undefined }));

type Hook = ReturnType<typeof useCenasEmGeracao>;
type Gerar = ReturnType<typeof useGerarCenasClaude>;

let limpar: () => Promise<void> = async () => undefined;
beforeEach(() => {
  h.gerar.mockReset();
  h.status.mockReset().mockResolvedValue({ corte_id: 'a', em_geracao: false });
  h.avisos.length = 0;
});
afterEach(async () => {
  await limpar();
  limpar = async () => undefined;
});

/** Monta a tela de um corte, como a troca de corte faz: instância nova a cada vez. */
function abrir(qc: QueryClient, corteId: string) {
  const sonda: { estado?: Hook; gerar?: Gerar } = {};
  function Sonda() {
    sonda.estado = useCenasEmGeracao(corteId, 'p1');
    sonda.gerar = useGerarCenasClaude(corteId, 'p1');
    return null;
  }
  const tela = montar(
    <QueryClientProvider client={qc}>
      <Sonda />
    </QueryClientProvider>,
  );
  return { sonda, ...tela };
}

function painel(qc: QueryClient, corteId = 'a', cenas: unknown[] = []) {
  return renderToStaticMarkup(
    <QueryClientProvider client={qc}>
      <TooltipProvider>
        <CenasPanel
          corteId={corteId}
          projetoId="p1"
          cenas={cenas as never}
          cenaAtivaIdx={-1}
          onSeek={() => undefined}
          onCenasChange={() => undefined}
        />
      </TooltipProvider>
    </QueryClientProvider>,
  );
}

const servidorDiz = (qc: QueryClient, corteId: string, emGeracao: boolean) =>
  qc.setQueryData(cenasEmGeracaoKey(corteId), { corte_id: corteId, em_geracao: emGeracao });

describe('a Pós com as cenas sendo geradas', () => {
  it('não oferece gerar: diz "gerando cenas" e trava os dois provedores', () => {
    const qc = new QueryClient();
    servidorDiz(qc, 'a', true);

    const html = painel(qc);

    expect(html).toContain('gerando cenas');
    expect(html).toMatch(/<button[^>]*disabled[^>]*aria-label="Gerar cenas com o Claude"/);
    expect(html).toMatch(/<button[^>]*disabled[^>]*aria-label="Gerar cenas com o Gemini"/);
  });

  it('com a lista vazia, não diz "Nenhuma cena gerada" nem manda gerar', () => {
    const qc = new QueryClient();
    servidorDiz(qc, 'a', true);

    const html = painel(qc);

    expect(html).not.toContain('Nenhuma cena gerada');
    expect(html).toContain('As cenas aparecem aqui quando a IA terminar');
  });

  it('o corte ao lado segue livre', () => {
    const qc = new QueryClient();
    servidorDiz(qc, 'a', true);
    servidorDiz(qc, 'b', false);

    const html = painel(qc, 'b');

    expect(html).toContain('Nenhuma cena gerada');
    expect(html).not.toMatch(/<button[^>]*disabled[^>]*aria-label="Gerar cenas com o Claude"/);
  });

  it('sem geração, o painel é o de sempre', () => {
    const qc = new QueryClient();
    servidorDiz(qc, 'a', false);

    const html = painel(qc);

    expect(html).toContain('Gerar cenas');
    expect(html).not.toContain('gerando cenas');
    expect(html).not.toMatch(/<button[^>]*disabled[^>]*aria-label="Gerar cenas com o Claude"/);
  });
});

describe('a geração é do corte, não da tela', () => {
  it('ao trocar de corte e voltar, o clique em voo continua aparecendo', async () => {
    h.gerar.mockReturnValue(new Promise(() => undefined));
    const qc = new QueryClient();

    const ida = abrir(qc, 'a');
    await assentar();
    ida.sonda.gerar!.mutate('gemini');
    await assentar();
    ida.desmontar();

    const outro = abrir(qc, 'b');
    await assentar();
    expect(outro.sonda.estado!.emGeracao).toBe(false);
    outro.desmontar();

    const volta = abrir(qc, 'a');
    limpar = volta.limpar;
    await assentar();
    expect(volta.sonda.estado).toEqual({ emGeracao: true, provider: 'gemini' });
  });

  it('a cadeia do bruto, que nenhuma mutação vê, chega pela API', async () => {
    h.status.mockResolvedValue({ corte_id: 'a', em_geracao: true });
    const qc = new QueryClient();

    const tela = abrir(qc, 'a');
    limpar = tela.limpar;
    await assentar();

    expect(tela.sonda.estado).toEqual({ emGeracao: true, provider: 'claude' });
  });

  it('o clique terminado solta o corte sem esperar o próximo ciclo', async () => {
    let termina: (v: unknown) => void = () => undefined;
    h.gerar.mockReturnValue(new Promise((r) => (termina = r)));
    h.status.mockResolvedValue({ corte_id: 'a', em_geracao: true });
    const qc = new QueryClient();

    const tela = abrir(qc, 'a');
    limpar = tela.limpar;
    await assentar();
    tela.sonda.gerar!.mutate('claude');
    await assentar();

    h.status.mockResolvedValue({ corte_id: 'a', em_geracao: false });
    termina({ total_cenas: 3 });
    await assentar();

    expect(tela.sonda.estado!.emGeracao).toBe(false);
  });

  it('a recusa do servidor chega ao operador com a mensagem dele', async () => {
    h.gerar.mockRejectedValue(new Error('As cenas deste corte já estão sendo geradas.'));
    const qc = new QueryClient();

    const tela = abrir(qc, 'a');
    limpar = tela.limpar;
    await assentar();
    tela.sonda.gerar!.mutate('claude');
    await assentar();

    expect(h.avisos).toEqual(['As cenas deste corte já estão sendo geradas.']);
  });
});

describe('quando a geração de fora termina', () => {
  it('recarrega o corte: as cenas novas aparecem sem o operador pedir', async () => {
    const qc = new QueryClient();
    const invalidar = vi.spyOn(qc, 'invalidateQueries');
    servidorDiz(qc, 'a', true);

    await buscarCenasEmGeracao(qc, 'a', 'p1');

    expect(invalidar).toHaveBeenCalledWith({ queryKey: corteKey('a') });
  });

  it('enquanto segue gerando, ou se nunca gerou, não recarrega nada', async () => {
    const qc = new QueryClient();
    const invalidar = vi.spyOn(qc, 'invalidateQueries');

    servidorDiz(qc, 'a', false);
    await buscarCenasEmGeracao(qc, 'a', 'p1');
    h.status.mockResolvedValue({ corte_id: 'a', em_geracao: true });
    servidorDiz(qc, 'a', true);
    await buscarCenasEmGeracao(qc, 'a', 'p1');

    expect(invalidar).not.toHaveBeenCalled();
  });

  it('a chave própria não vive sob a do corte: recarregar não cancela a própria consulta', () => {
    expect(cenasEmGeracaoKey('a').slice(0, 2)).not.toEqual(corteKey('a'));
  });
});
