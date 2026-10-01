// Nenhum arquivo do frontend ganha cor solta (D-849). Terceira catraca, irmã
// das de tamanho de arquivo (D-771) e de função (D-772), com as mesmas regras:
//
// - arquivo fora da lista que tenha cor solta falha;
// - arquivo da lista que ganha cor solta além do teto falha;
// - arquivo da lista que perdeu cor solta falha até o teto ser baixado — e sai
//   da lista quando chegar a zero.
//
// "Cor solta" é cor escrita no código em vez de token do tema: classe de paleta
// do Tailwind (`text-red-400`, `bg-black/70`, `text-white`), hex (`#fca5a5`) e
// rgb/hsl/oklch literais, e cor pelo nome num style ou atributo SVG
// (`color: 'white'`). Ela não acompanha os cinco temas nem o contrato de
// cor da casca: foi o `text-white` sobre o acento, o `#fca5a5` ilegível no
// claro e os oito vermelhos de "perigo" da revisão do layout (D-841, D-848).
// O que é estado usa os tokens (`--ok`, `--warn`, `--err`, `--info`, `--sel-*`,
// e no Tailwind `text-success`, `bg-error/10`…).
//
// Os tetos são do dia 01/10/2026. Ficam na lista, e é legítimo que fiquem, o
// que desenha o VÍDEO e não a interface: o palco (`shared/palco`), as prévias
// de legenda e gancho do short, a paleta categórica dos tipos de cena e o que
// vai sobre a arte (vidro escuro, regra `sobreArte` do SeloDeEstado).

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

// Gerado a partir do openapi.json; ninguém o edita à mão.
const GERADOS = new Set(['src/shared/api/contract.ts']);
const TESTES = /(__tests__\/|\.test\.tsx?$)/;

const PALETA =
  '(?:white|black|slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)';
const CORES_SOLTAS = [
  new RegExp(
    String.raw`\b(?:text|bg|border(?:-[xytrblse])?|ring(?:-offset)?|fill|stroke|from|to|via|outline|divide|placeholder|decoration|shadow|accent|caret)-${PALETA}(?:-\d{2,3})?\b`,
    'g',
  ),
  /#[0-9a-fA-F]{3}(?:[0-9a-fA-F]{3}(?:[0-9a-fA-F]{2})?)?\b/g,
  /\b(?:rgba?|hsla?|oklch|oklab)\(\s*[\d.]/g,
  // Cor pelo nome num `style` ou atributo SVG (`color: 'white'`,
  // `stopColor="black"`): o mesmo text-white de antes, por outra porta.
  /\b(?:color|background(?:Color)?|borderColor|outlineColor|fill|stroke|stopColor)\s*[:=]\s*\{?\s*['"](?:white|black|red|green|blue|yellow|orange|gray|grey|purple|pink)['"]/g,
];

const EXCECOES: Record<string, number> = {
  "src/components/ui/claude-button.tsx": 1,
  "src/components/ui/gemini-button.tsx": 1,
  "src/components/ui/imagem-ampliavel.tsx": 4,
  "src/components/ui/modal.tsx": 2,
  "src/components/ui/thumbnail-placeholder.tsx": 9,
  "src/components/ui/toaster.tsx": 1,
  "src/features/channels/ChannelCard.tsx": 1,
  "src/features/channels/ChannelForm.tsx": 3,
  "src/features/channels/ChannelThemeSection.tsx": 1,
  "src/features/editor/CommonTopBar.tsx": 1,
  "src/features/editor/fase1/PlayerPanel.tsx": 10,
  "src/features/editor/fase1/TimelinePanel.tsx": 6,
  "src/features/editor/fase1/trechoBadge.ts": 1,
  "src/features/editor/fase2/CenaItem.tsx": 3,
  "src/features/editor/fase2/CenaPlayerPanel.tsx": 15,
  "src/features/editor/fase2/PosicionamentoModal.tsx": 3,
  "src/features/editor/fase2/SceneTimeline.tsx": 6,
  "src/features/editor/fase2/posicionamentoControls.tsx": 8,
  "src/features/editor/fase2/sceneTypes.ts": 68,
  "src/features/editor/fase2/youtubeLayoutPanel/components.tsx": 1,
  "src/features/final-review/FinalReviewPage.tsx": 6,
  "src/features/lives/RankingEmbasamentoPanel.tsx": 1,
  "src/features/metadata/MetadadosDoCorteModal.tsx": 2,
  "src/features/post-production/FiltroTestePanel.tsx": 3,
  "src/features/projeto-detalhe/CorteLinhaAp.tsx": 4,
  "src/features/projetos/ProjetoCardAp.tsx": 5,
  "src/features/settings/CapaTikTokLayoutEditor.tsx": 1,
  "src/features/shorts/BlocosArrastaveis.tsx": 5,
  "src/features/shorts/CandidatoCard.tsx": 2,
  "src/features/shorts/CapaModal.tsx": 4,
  "src/features/shorts/DefinirPalcoModal.tsx": 1,
  "src/features/shorts/GanchoModal.tsx": 3,
  "src/features/shorts/GanchoPrevia.tsx": 5,
  "src/features/shorts/LegendaPrevia.tsx": 15,
  "src/features/shorts/LinhaDoTempo.tsx": 2,
  "src/features/shorts/MascaraEnquadramento.tsx": 4,
  "src/features/shorts/PalcoPrevia.tsx": 1,
  "src/features/shorts/PlayerDoBruto.tsx": 1,
  "src/features/shorts/PresetDoGanchoModal.tsx": 3,
  "src/features/shorts/ReguaDeOnda.tsx": 2,
  "src/features/shorts/ShortsProntosPage.tsx": 2,
  "src/features/shorts/coresDosShorts.ts": 3,
  "src/features/shorts/ganchoDoShort.ts": 13,
  "src/hooks/usePalette.ts": 5,
  "src/shared/palco/youtubeBackgrounds.tsx": 44,
  "src/shared/palco/youtubeChrome.tsx": 21,
  "src/upgrade/ActionBar.tsx": 1,
  "src/upgrade/ContextColumn.tsx": 2,
  "src/upgrade/GavetaDaFila.tsx": 2,
  "src/upgrade/KitScreen.tsx": 1,
  "src/upgrade/MolduraDeVideo.tsx": 5,
  "src/upgrade/PaletaDeComandos.tsx": 2,
  "src/upgrade/SeloDeEstado.tsx": 3,
  "src/upgrade/TopBar.tsx": 1,
  "src/upgrade/UpgradeModal.tsx": 2,
  "src/upgrade/UpgradeToast.tsx": 1,
};

function contarCoresSoltas(): Record<string, number> {
  const arquivos = execFileSync('git', ['ls-files', 'src'], { encoding: 'utf8', timeout: 60_000 })
    .split('\n')
    .filter((caminho) => /\.tsx?$/.test(caminho) && !GERADOS.has(caminho) && !TESTES.test(caminho));
  const contagem: Record<string, number> = {};
  for (const caminho of arquivos) {
    const texto = readFileSync(caminho, 'utf8');
    const n = CORES_SOLTAS.reduce((soma, rx) => soma + (texto.match(rx)?.length ?? 0), 0);
    if (n > 0) contagem[caminho] = n;
  }
  return contagem;
}

describe('cor solta (D-849)', () => {
  const contagem = contarCoresSoltas();

  it('arquivo novo não tem cor solta', () => {
    const novos = Object.fromEntries(Object.entries(contagem).filter(([caminho]) => !(caminho in EXCECOES)));
    expect(novos, 'Use os tokens do tema (não acrescente a EXCECOES)').toEqual({});
  });

  it('exceção não ganha cor solta', () => {
    const cresceram = Object.entries(EXCECOES)
      .filter(([caminho, teto]) => (contagem[caminho] ?? 0) > teto)
      .map(([caminho, teto]) => `${caminho}: ${contagem[caminho]} > teto ${teto}`);
    expect(cresceram).toEqual([]);
  });

  it('lista de exceções só diminui', () => {
    const desatualizadas = Object.entries(EXCECOES).flatMap(([caminho, teto]) => {
      const atual = contagem[caminho];
      if (atual === undefined) return [`${caminho}: chegou a zero, mudou de nome ou sumiu — remova`];
      if (atual < teto) return [`${caminho}: caiu para ${atual} — baixe o teto`];
      return [];
    });
    expect(desatualizadas).toEqual([]);
  });
});
