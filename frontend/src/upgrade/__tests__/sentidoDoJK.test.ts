import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { acaoDaTeclaNaLinha } from '@/features/projeto-detalhe/cortesDoWorkspace';
import { SHORTCUTS_REGISTRY } from '@/shared/atalhos/shortcutsRegistry';
import { acaoDaTecla, type Contexto } from '../teclasDaCasca';

// D-865: J e K trocavam de sentido conforme a tela — no editor J voltava um
// corte; na casca, no seletor do topo e na lista do Workspace, J avançava. E o
// editor mostrava no topo "Próximo item · J" enquanto fazia o contrário.
// Decisão do Paulo: vale o sentido do editor — J anterior, K próximo — e as
// quatro peças têm de concordar.
describe('J e K no mesmo sentido em todo o app', () => {
  const contexto: Contexto = {
    tecla: '',
    meta: false,
    ctrl: false,
    alt: false,
    digitando: false,
    focoEmDecisao: false,
    overlayAberto: false,
    jaTratado: false,
    primarioDisponivel: true,
  };

  it('o editor: J é o corte anterior, K o próximo', () => {
    const tecla = (id: string) => SHORTCUTS_REGISTRY.find((s) => s.id === id)?.key;
    expect(tecla('bruto.corteAnterior')).toBe('j');
    expect(tecla('bruto.proximoCorte')).toBe('k');
  });

  it('a casca: J anterior, K próximo', () => {
    expect(acaoDaTecla({ ...contexto, tecla: 'j' })).toBe('anterior');
    expect(acaoDaTecla({ ...contexto, tecla: 'k' })).toBe('proximo');
  });

  it('a lista do Workspace: J sobe (anterior), K desce (próximo)', () => {
    expect(acaoDaTeclaNaLinha('j', 'proposto')).toBe('subir');
    expect(acaoDaTeclaNaLinha('k', 'proposto')).toBe('descer');
  });

  // Título, atalho anunciado ao leitor de tela e clique moram no mesmo botão:
  // a regex exige os três juntos, para um não virar sem o outro.
  it('o seletor do topo diz o mesmo que a tecla faz', () => {
    const topo = fonte('../TopBar.tsx');
    expect(topo).toMatch(
      /title="Item anterior · J"[^>]*aria-keyshortcuts="J"[^>]*onClick=\{atual\.onAnterior\}/,
    );
    expect(topo).toMatch(
      /title="Próximo item · K"[^>]*aria-keyshortcuts="K"[^>]*onClick=\{atual\.onProximo\}/,
    );
  });

  // A decisão de cada peça é pura e testada acima; aqui se confere que quem
  // executa liga a decisão ao lado certo — trocar um callback passaria verde.
  it('cada peça executa o sentido decidido', () => {
    const casca = fonte('../useAtalhosDaCasca.ts');
    expect(casca).toContain("if (acao === 'anterior') atual?.onAnterior?.();");
    expect(casca).toContain("if (acao === 'proximo') atual?.onProximo?.();");

    const linha = fonte('../../features/projeto-detalhe/CorteLinhaAp.tsx');
    expect(linha).toMatch(
      /acao === 'descer' \? linha\.nextElementSibling : linha\.previousElementSibling/,
    );

    const editor = fonte('../../features/editor/useEditorPage.tsx');
    expect(editor).toContain("'bruto.corteAnterior': () => navegarCorte(-1)");
    expect(editor).toContain("'bruto.proximoCorte': () => navegarCorte(1)");
  });
});

function fonte(caminho: string): string {
  return readFileSync(resolve(__dirname, caminho), 'utf8');
}
