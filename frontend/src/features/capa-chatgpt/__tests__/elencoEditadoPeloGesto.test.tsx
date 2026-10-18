import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { PessoaDaCapa } from '../api';
import { comPessoa, GerarNoChatGPT, semPessoa, useElencoConferido } from '../GerarNoChatGPT';

// D-968 (pr-audit do #235): a edição tem de sobreviver pelo GESTO do operador —
// o `editar` do elenco, o mesmo que trocar a foto, tirar e pôr alguém usam —,
// e não só quando o teste grava direto no cache. E a foto nova, que relê os
// elencos sugeridos, não pode apagar o que o operador conferiu.

const PROMPT = 'Lula e Bolsonaro discutem';
const SUGERIDO: PessoaDaCapa[] = [
  { nome: 'Lula', slug: 'lula' },
  { nome: 'Bolsonaro', slug: 'bolsonaro' },
];

function cliente() {
  const qc = new QueryClient();
  qc.setQueryData(['capa-chatgpt', 'configuracao'], {
    projeto_url: 'https://chatgpt.com/g/g-p-6aa2f1d08414819192ac821e77ded48e/project',
    fichas: [],
    maximo_de_fichas: 10,
  });
  qc.setQueryData(['capa-chatgpt', 'elenco', PROMPT], SUGERIDO);
  return qc;
}

/** Monta o elenco desta capa uma vez e devolve o que a tela recebeu dele. */
function elencoMontado(qc: QueryClient) {
  let elenco: ReturnType<typeof useElencoConferido> | undefined;
  function Sonda() {
    elenco = useElencoConferido('youtube', 'c1', PROMPT, true);
    return null;
  }
  renderToStaticMarkup(
    <QueryClientProvider client={qc}>
      <Sonda />
    </QueryClientProvider>,
  );
  if (!elenco) throw new Error('a sonda não montou');
  return elenco;
}

const botao = (qc: QueryClient) =>
  renderToStaticMarkup(
    <QueryClientProvider client={qc}>
      <GerarNoChatGPT prompt={PROMPT} destino="youtube" alvoId="c1" />
    </QueryClientProvider>,
  );

describe('elenco editado pelo gesto (D-968)', () => {
  it('quem o operador tirou continua fora depois de desmontar e remontar', () => {
    const qc = cliente();
    elencoMontado(qc).editar((lista) => semPessoa(lista, 'Bolsonaro'));
    const html = botao(qc);
    expect(html).toContain('Foto de Lula');
    expect(html).not.toContain('Bolsonaro');
  });

  it('a foto trocada continua depois de remontar', () => {
    const qc = cliente();
    elencoMontado(qc).editar((lista) => comPessoa(lista, { nome: 'Lula', slug: 'lula', versao: 77 }));
    expect(botao(qc)).toContain('/api/retratos/lula?v=77');
  });

  it('a releitura dos elencos sugeridos (foto nova) não apaga a edição', async () => {
    const qc = cliente();
    elencoMontado(qc).editar((lista) => semPessoa(lista, 'Bolsonaro'));
    await qc.invalidateQueries({ queryKey: ['capa-chatgpt', 'elenco'] });
    expect(elencoMontado(qc).pessoas?.map((p) => p.nome)).toEqual(['Lula']);
  });
});
