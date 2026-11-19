import { renderToStaticMarkup } from 'react-dom/server';
import { ToastProvider } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { describe, expect, it } from 'vitest';
import UpgradeKitPage from '../UpgradeKitPage';

// D-1132 (E-069 H-12): a página /upgrade/kit é a vitrine do sistema novo e só dele.
// "Antigo", aqui, é o critério da D-1124: peça focável sem `data-sala` (a casca antiga a
// reconhece por esse atributo) ou classe da casca antiga (`.ap`, `.btn`, `.chip`, `.card`...).
// O vitest roda em `node`, sem DOM: a prova é o HTML de `renderToStaticMarkup`.

const html = renderToStaticMarkup(
  <ToastProvider>
    <TooltipProvider>
      <UpgradeKitPage />
    </TooltipProvider>
  </ToastProvider>,
);

const SECOES = [
  'kit-acao', // KitAcao
  'kit-entrada', // KitEntrada
  'Estado e navegação', // KitEstado
  'Listas e dados', // KitListas
  'Flutua', // KitFlutua
  '>Luz<', // KitLuz
  'Mapa da live', // KitTempo
];

function tagsAbertas(nome: string): string[] {
  return html.match(new RegExp(`<${nome}\\b[^>]*>`, 'g')) ?? [];
}

describe('página Kit', () => {
  it.each(SECOES)('mostra a seção %s', (marca) => {
    expect(html).toContain(marca);
  });

  it('não monta nenhuma peça da casca antiga', () => {
    // Variáveis curtas da casca antiga (e as `--wb-`); as locais de geometria (`--x`, `--c`) valem.
    expect(html).not.toMatch(/var\(--(wb-|accent|line|mute|dim|ink|inset|ok|warn|err|info|panel|bg|r1|r2)\b/);
    expect(html).not.toContain('role="dialog"');
  });

  it('todo botão e campo da página é da Sala (data-sala)', () => {
    const focaveis = ['button', 'input', 'select', 'textarea'].flatMap(tagsAbertas);
    expect(focaveis.length).toBeGreaterThan(20);
    // O <select> nativo escondido do Radix (aria-hidden) não é peça: é o espelho do formulário.
    const antigos = focaveis.filter((t) => !t.includes('data-sala') && !t.includes('aria-hidden'));
    expect(antigos).toEqual([]);
  });

  it('não usa fonte arbitrária nem estilo inline de página', () => {
    expect(html).not.toMatch(/text-\[\d+(\.\d+)?px\]/);
    expect(html).not.toContain('data-screen-label="Componentes" style=');
  });
});
