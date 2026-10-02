// Nenhum texto novo abaixo de 11 px (D-859). Sétima catraca, irmã das de
// tamanho (D-771, D-772), cor solta (D-849), ícone pelo Icon (D-853), um
// conceito um desenho e emoji fora (D-858), com as regras da de cor:
//
// - arquivo fora da lista que tenha texto abaixo de 11 px falha;
// - arquivo da lista que ganha texto pequeno além do teto falha;
// - arquivo da lista que perdeu texto pequeno falha até o teto ser baixado — e
//   sai da lista quando chegar a zero.
//
// A escala de texto da revisão do layout tem quatro degraus — 20, 15, 13 e
// 11 px — e 11 é o piso (decisão do Paulo, 01/10/2026; antes o piso era 9 px,
// D-746). O app tinha 288 textos abaixo disso em 89 arquivos, como os 9,5 px
// em mono e caixa alta de "PRONTO PARA LIMPAR". Os tetos são de 02/10/2026,
// depois da primeira leva (selos e legendas da Biblioteca): 279 em 85.
//
// Conta as três portas por onde o tamanho entra: a classe do Tailwind
// (`text-[9.5px]`), o estilo inline e o atributo SVG (`fontSize: 9`,
// `fontSize={9}`) e o CSS (`font-size: 10.5px`). Ficam na lista, e é
// legítimo, os textos que desenham o VÍDEO em escala (as prévias do palco).
//
// Não vê, e não há hoje no app fora das prévias de vídeo: tamanho calculado
// (template `${n}px`, ternário, `clamp(9px, …)`), o shorthand `font: … 9px`,
// `text-[length:…]` e unidades relativas (`rem`, `em`, `cqw`) — essas não são
// px e ficam fora da conta de propósito.

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const PISO = 11;
const GERADOS = new Set(['src/shared/api/contract.ts']);
const TESTES = /(__tests__\/|\.test\.tsx?$)/;
const TAMANHOS = [
  /\btext-\[(\d+(?:\.\d+)?)px\]/g,
  // `(?![\w.%])`: o número inteiro, em px ou sem unidade — `'4.2cqw'` não é 4 px.
  /\bfontSize\s*[:=]\s*\{?\s*['"]?(\d+(?:\.\d+)?)(?:px)?(?![\w.%])/g,
  /\bfont-size:\s*(\d+(?:\.\d+)?)px/g,
];

// A primeira leva: os selos e as legendas da Biblioteca já estão no piso.
const PRIMEIRA_LEVA = [
  'src/upgrade/SeloDeEstado.tsx',
  'src/upgrade/TiraDoCorteAp.tsx',
  'src/components/ui/selo-provider.tsx',
  'src/features/projetos/BibliotecaPage.tsx',
];

const EXCECOES: Record<string, number> = {
  "src/components/PromptManualPanel.tsx": 2,
  "src/components/ThumbnailHintsEditor.tsx": 1,
  "src/components/ui/acao-de-ia.tsx": 1,
  "src/components/ui/button.tsx": 1,
  "src/components/ui/overflow-menu.tsx": 1,
  "src/components/workbench/PanelShell.tsx": 3,
  "src/features/analises/AnalisesPage.tsx": 1,
  "src/features/analises/LlmCallsTab.tsx": 3,
  "src/features/analises/PropostaFinalTab.tsx": 6,
  "src/features/analises/YoutubeDesempenhoTab.tsx": 3,
  "src/features/atalhos/AtalhosPage.tsx": 5,
  "src/features/capa-chatgpt/CapaChatgptSection.tsx": 1,
  "src/features/capa-chatgpt/GerarNoChatGPT.tsx": 4,
  "src/features/channels/ChannelCard.tsx": 1,
  "src/features/channels/ChannelThemeSection.tsx": 1,
  "src/features/channels/ChannelsPage.tsx": 1,
  "src/features/channels/EditorialSkillHistory.tsx": 1,
  "src/features/channels/RankingPesosForm.tsx": 1,
  "src/features/editor/CommonTopBar.tsx": 2,
  "src/features/editor/ShortcutsHelpModal.tsx": 1,
  "src/features/editor/avaliacao/AvaliacaoBrutoPanel.tsx": 7,
  "src/features/editor/avaliacao/AvaliacaoCorteForm.tsx": 4,
  "src/features/editor/fase1/AudioSyncControl.tsx": 7,
  "src/features/editor/fase1/BlocosPanel.tsx": 2,
  "src/features/editor/fase1/BrutoContextStrip.tsx": 4,
  "src/features/editor/fase1/PlayerPanel.tsx": 1,
  "src/features/editor/fase1/RightTabsPanel.tsx": 9,
  "src/features/editor/fase1/TimelinePanel.tsx": 10,
  "src/features/editor/fase2/CenaItem.tsx": 4,
  "src/features/editor/fase2/CenaPlayerPanel.tsx": 8,
  "src/features/editor/fase2/CenasPanel.tsx": 6,
  "src/features/editor/fase2/DefinirSplitButton.tsx": 3,
  "src/features/editor/fase2/EditorFase2.tsx": 6,
  "src/features/editor/fase2/PosicionamentoModal.tsx": 11,
  "src/features/editor/fase2/RendererConfigControls.tsx": 1,
  "src/features/editor/fase2/SceneTimeline.tsx": 13,
  "src/features/editor/fase2/SegmentoDetectadoPopover.tsx": 3,
  "src/features/editor/fase2/YoutubeLayoutPanel.tsx": 4,
  "src/features/editor/fase2/posicionamentoControls.tsx": 8,
  "src/features/editor/fase2/youtubeLayoutPanel/components.tsx": 19,
  "src/features/final-review/FinalReviewPage.tsx": 7,
  "src/features/lives/RankingEmbasamentoPanel.tsx": 4,
  "src/features/lives/RankingLivesPage.tsx": 2,
  "src/features/metadata/CapaTikTokSlot.tsx": 7,
  "src/features/metadata/MetadataCard.tsx": 5,
  "src/features/metadata/ThumbnailAvaliacaoPanel.tsx": 4,
  "src/features/post-production/FiltroTestePanel.tsx": 5,
  "src/features/post-production/RenderStepsModal.tsx": 2,
  "src/features/projeto-detalhe/AuditoriaAnaliseModal.tsx": 2,
  "src/features/projeto-detalhe/CorteLinhaAp.tsx": 2,
  "src/features/projeto-detalhe/WorkspaceProjetoPage.tsx": 1,
  "src/features/shorts/BlocosArrastaveis.tsx": 1,
  "src/features/shorts/CabecalhoDoFire.tsx": 2,
  "src/features/shorts/CandidatoCard.tsx": 5,
  "src/features/shorts/CapaModal.tsx": 1,
  "src/features/shorts/ColunaDeDecisoes.tsx": 1,
  "src/features/shorts/DefinirPalcoModal.tsx": 7,
  "src/features/shorts/EditorDePalco.tsx": 4,
  "src/features/shorts/EditorDeRecorte.tsx": 1,
  "src/features/shorts/GanchoModal.tsx": 1,
  "src/features/shorts/GanchoPadraoDoCorte.tsx": 1,
  "src/features/shorts/LinhaDeAjuste.tsx": 2,
  "src/features/shorts/LinhaDoTempo.tsx": 1,
  "src/features/shorts/ListaDeSegmentos.tsx": 2,
  "src/features/shorts/MascaraEnquadramento.tsx": 1,
  "src/features/shorts/NavegacaoDoPlayer.tsx": 1,
  "src/features/shorts/PainelDaRegua.tsx": 1,
  "src/features/shorts/PalcoDoCorte.tsx": 1,
  "src/features/shorts/PalcoPadraoDoCorte.tsx": 1,
  "src/features/shorts/PlayerDoBruto.tsx": 1,
  "src/features/shorts/PostModal.tsx": 1,
  "src/features/shorts/PresetDoGanchoModal.tsx": 1,
  "src/features/shorts/PresetsDoPalco.tsx": 1,
  "src/features/shorts/ProgressoRenderPanel.tsx": 5,
  "src/features/shorts/PublicarEmLoteModal.tsx": 2,
  "src/features/shorts/ReguaDeOnda.tsx": 1,
  "src/features/shorts/ShortsPage.tsx": 3,
  "src/features/shorts/ShortsProntosPage.tsx": 2,
  "src/features/shorts/WorkspaceDoFirePage.tsx": 4,
  "src/features/thumbnail-padroes/ThumbnailPadroesPage.tsx": 2,
  "src/upgrade/ContextColumn.tsx": 1,
  "src/upgrade/GavetaDaFila.tsx": 4,
  "src/upgrade/PaletaDeComandos.tsx": 1,
  "src/upgrade/UpgradeModal.tsx": 3,
  "src/upgrade/upgrade.css": 2,
};

/** Quantos textos abaixo do piso um conteúdo tem. */
function contarAbaixoDoPiso(texto: string): number {
  return TAMANHOS.reduce(
    (total, padrao) =>
      total + [...texto.matchAll(padrao)].filter((m) => Number(m[1]) < PISO).length,
    0,
  );
}

function contarPorArquivo(): Record<string, number> {
  const arquivos = execFileSync('git', ['ls-files', 'src'], { encoding: 'utf8', timeout: 60_000 })
    .split('\n')
    .filter((c) => /\.(tsx?|css)$/.test(c) && !GERADOS.has(c) && !TESTES.test(c));
  const contagem: Record<string, number> = {};
  for (const caminho of arquivos) {
    const n = contarAbaixoDoPiso(readFileSync(caminho, 'utf8'));
    if (n > 0) contagem[caminho] = n;
  }
  return contagem;
}

describe('piso de 11 px (D-859)', () => {
  const contagem = contarPorArquivo();

  it('conta as três portas e só o que está abaixo do piso', () => {
    expect(contarAbaixoDoPiso('className="text-[9.5px] text-[11px] text-[13px]"')).toBe(1);
    expect(contarAbaixoDoPiso('style={{ fontSize: 10.5 }} <text fontSize={9}> fontSize: 11')).toBe(2);
    expect(contarAbaixoDoPiso('.x { font-size: 10px } .y { font-size: 11px }')).toBe(1);
    // px em string conta; unidade relativa não é px e fica fora (achado da auditoria do #108)
    expect(contarAbaixoDoPiso("fontSize: '10px' fontSize: '4.2cqw' fontSize: '1.2em'")).toBe(1);
  });

  it('arquivo novo não tem texto abaixo de 11 px', () => {
    const novos = Object.fromEntries(Object.entries(contagem).filter(([caminho]) => !(caminho in EXCECOES)));
    expect(novos, 'Use 11, 13, 15 ou 20 px (não acrescente a EXCECOES)').toEqual({});
  });

  it('exceção não ganha texto pequeno', () => {
    const cresceram = Object.entries(EXCECOES)
      .filter(([caminho, teto]) => (contagem[caminho] ?? 0) > teto)
      .map(([caminho, teto]) => `${caminho}: ${contagem[caminho]} > teto ${teto}`);
    expect(cresceram).toEqual([]);
  });

  it('lista de exceções só diminui', () => {
    const desatualizadas = Object.entries(EXCECOES).flatMap(([caminho, teto]) => {
      const atual = contagem[caminho];
      if (atual === undefined) return [`${caminho}: chegou ao piso, mudou de nome ou sumiu — remova`];
      if (atual < teto) return [`${caminho}: caiu para ${atual} — baixe o teto`];
      return [];
    });
    expect(desatualizadas).toEqual([]);
  });

  it.each(PRIMEIRA_LEVA)('primeira leva no piso: %s', (caminho) => {
    expect(contagem[caminho] ?? 0).toBe(0);
    expect(caminho in EXCECOES).toBe(false);
  });
});
