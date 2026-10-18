import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { PessoaDaCapa } from '../api';
import { GerarNoChatGPT } from '../GerarNoChatGPT';
import { guardarElencoEditado } from '../useCapaNoChatGPT';

// D-968: o elenco que o operador conferiu (trocou a foto, tirou ou pôs alguém)
// morava no estado do componente. Fechar o modal e reabrir desmontava o botão,
// e a capa voltava ao elenco sugerido — a foto trocada "sumia". Agora a edição
// fica no cache da tela, por capa, e a próxima montagem a encontra.

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

const montar = (qc: QueryClient, alvoId = 'c1', destino: 'youtube' | 'tiktok' = 'youtube') =>
  renderToStaticMarkup(
    <QueryClientProvider client={qc}>
      <GerarNoChatGPT prompt={PROMPT} destino={destino} alvoId={alvoId} />
    </QueryClientProvider>,
  );

describe('elenco conferido ao reabrir (D-968)', () => {
  it('a foto trocada continua na próxima montagem', () => {
    const qc = cliente();
    guardarElencoEditado(qc, 'youtube', 'c1', PROMPT, [
      { nome: 'Lula', slug: 'lula', versao: 42 },
      { nome: 'Bolsonaro', slug: 'bolsonaro' },
    ]);
    expect(montar(qc)).toContain('/api/retratos/lula?v=42');
  });

  it('quem foi tirado continua fora', () => {
    const qc = cliente();
    guardarElencoEditado(qc, 'youtube', 'c1', PROMPT, [{ nome: 'Lula', slug: 'lula' }]);
    const html = montar(qc);
    expect(html).toContain('Foto de Lula');
    expect(html).not.toContain('Bolsonaro');
  });

  it('a edição é desta capa: outra capa segue com o sugerido', () => {
    const qc = cliente();
    guardarElencoEditado(qc, 'youtube', 'c1', PROMPT, [{ nome: 'Lula', slug: 'lula' }]);
    expect(montar(qc, 'c2')).toContain('Bolsonaro');
    expect(montar(qc, 'c1', 'tiktok')).toContain('Bolsonaro');
  });

  it('prompt refeito é outra capa: volta o sugerido', () => {
    const qc = cliente();
    guardarElencoEditado(qc, 'youtube', 'c1', 'um prompt antigo', [{ nome: 'Lula', slug: 'lula' }]);
    expect(montar(qc)).toContain('Bolsonaro');
  });
});
