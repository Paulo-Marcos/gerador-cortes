import { readFileSync } from 'node:fs';
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

  it('o seletor do topo diz o mesmo que a tecla faz', () => {
    const topo = readFileSync('src/upgrade/TopBar.tsx', 'utf8');
    expect(topo).toContain('title="Item anterior · J"');
    expect(topo).toContain('title="Próximo item · K"');
  });
});
