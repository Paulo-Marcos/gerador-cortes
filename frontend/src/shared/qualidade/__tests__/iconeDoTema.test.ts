// Todo ícone passa pelo upgrade/Icon (D-853). Quarta catraca, irmã das de
// tamanho (D-771, D-772) e de cor solta (D-849):
//
// - arquivo fora da lista que importa o lucide-react falha;
// - arquivo da lista que parou de importar falha até sair da lista.
//
// O Icon é onde mora a escala (14 px junto de texto, 16 em botão e barra, 20
// no trilho, `ilustracao` para figura grande) e o traço único de 1,75. Ícone
// importado direto do lucide escapa dos dois: foi assim que o app chegou a 24
// tamanhos e a traços de 0,3 a 3. A lista é de 01/10/2026 e cai a cada PR de
// área da Onda 2 (editor, shorts, metadados/pós/revisão, demais telas) até
// ficar vazia.

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

// O próprio Icon é a única porta para o lucide.
const PORTA = 'src/upgrade/Icon.tsx';
const TESTES = /(__tests__\/|\.test\.tsx?$)/;
// Qualquer referência ao pacote, não só o import estático da raiz: caminho
// interno (`lucide-react/dist/...`), `import()` e `require` também furam a
// escala (achado da auditoria do #99).
const IMPORTA_LUCIDE = /['"]lucide-react(?:\/[^'"]*)?['"]/;

const AINDA_IMPORTAM = new Set([
  "src/components/ui/acao-de-ia.tsx",
  "src/components/ui/overflow-menu.tsx",
  "src/features/analises/AnalisesPage.tsx",
  "src/features/analises/LlmCallsTab.tsx",
  "src/features/analises/PropostaFinalTab.tsx",
  "src/features/analises/YoutubeDesempenhoTab.tsx",
  "src/features/atalhos/AtalhosPage.tsx",
  "src/features/capa-chatgpt/CapaChatgptSection.tsx",
  "src/features/capa-chatgpt/GerarNoChatGPT.tsx",
  "src/features/channels/ChannelCard.tsx",
  "src/features/channels/ChannelForm.tsx",
  "src/features/channels/ChannelThemeSection.tsx",
  "src/features/channels/ChannelsPage.tsx",
  "src/features/channels/ConectarYoutubeTutorial.tsx",
  "src/features/channels/EditorialScaffoldCard.tsx",
  "src/features/channels/EditorialScaffoldForm.tsx",
  "src/features/channels/EditorialScaffoldsSection.tsx",
  "src/features/channels/EditorialSkillCard.tsx",
  "src/features/channels/EditorialSkillForm.tsx",
  "src/features/channels/EditorialSkillHistory.tsx",
  "src/features/channels/EditorialSkillsSection.tsx",
  "src/features/channels/PreRequisitosSection.tsx",
  "src/features/channels/PromptUtilitarioCard.tsx",
  "src/features/channels/PromptUtilitarioForm.tsx",
  "src/features/channels/PromptsUtilitariosSection.tsx",
  "src/features/channels/RankingPesosForm.tsx",
  "src/features/channels/RankingPesosSection.tsx",
  "src/features/channels/SituacaoDosCanais.tsx",
  "src/features/editor/fase2/CenasPanel.tsx",
  "src/features/final-review/FinalReviewPage.tsx",
  "src/features/lives/LiveSearchPage.tsx",
  "src/features/lives/RankingEmbasamentoPanel.tsx",
  "src/features/lives/RankingLivesPage.tsx",
  "src/features/metadata/AcoesDoPromptDaCapa.tsx",
  "src/features/metadata/CapaTikTokSlot.tsx",
  "src/features/metadata/CapaYoutubeDoModal.tsx",
  "src/features/metadata/MetadataCard.tsx",
  "src/features/metadata/MetadataPage.tsx",
  "src/features/metadata/ThumbnailAvaliacaoPanel.tsx",
  "src/features/metadata/modalPecas.tsx",
  "src/features/post-production/FiltroTestePanel.tsx",
  "src/features/post-production/RenderStepsModal.tsx",
  "src/features/post-production/ScenesPostProductionPage.tsx",
  "src/features/projeto-detalhe/AnaliseIaModal.tsx",
  "src/features/projeto-detalhe/AuditoriaAnaliseModal.tsx",
  "src/features/projeto-detalhe/DiarizacaoPanel.tsx",
  "src/features/projeto-detalhe/LoteDoTiktokHorizontal.tsx",
  "src/features/projeto-detalhe/PublicarMassaModal.tsx",
  "src/features/projeto-detalhe/PublicarTiktokModal.tsx",
  "src/features/projeto-detalhe/StatusPills.tsx",
  "src/features/projeto-detalhe/WorkspaceProjetoPage.tsx",
  "src/features/projetos/NovoProjetoForm.tsx",
  "src/features/settings/AppSettingsControls.tsx",
  "src/features/settings/CapaTikTokLayoutEditor.tsx",
  "src/features/shorts/CabecalhoDoFire.tsx",
  "src/features/shorts/CandidatoCard.tsx",
  "src/features/shorts/CapaModal.tsx",
  "src/features/shorts/ColunaDeDecisoes.tsx",
  "src/features/shorts/DefinirPalcoModal.tsx",
  "src/features/shorts/EditorDePalco.tsx",
  "src/features/shorts/EditorDeRecorte.tsx",
  "src/features/shorts/GanchoModal.tsx",
  "src/features/shorts/GanchoPadraoDoCorte.tsx",
  "src/features/shorts/KitDoShortModal.tsx",
  "src/features/shorts/LinhaDeAjuste.tsx",
  "src/features/shorts/ListaDeSegmentos.tsx",
  "src/features/shorts/NavegacaoDoPlayer.tsx",
  "src/features/shorts/PainelPublicacao.tsx",
  "src/features/shorts/PalcoDoCorte.tsx",
  "src/features/shorts/PalcoPadraoDoCorte.tsx",
  "src/features/shorts/PresetDoGanchoModal.tsx",
  "src/features/shorts/PresetDoPalcoModal.tsx",
  "src/features/shorts/PresetsDoPalco.tsx",
  "src/features/shorts/ProgressoRenderPanel.tsx",
  "src/features/shorts/PublicarEmLoteModal.tsx",
  "src/features/shorts/ReguaDeOnda.tsx",
  "src/features/shorts/ShortsPage.tsx",
  "src/features/shorts/ShortsProntosPage.tsx",
  "src/features/shorts/WorkspaceDoFirePage.tsx",
  "src/features/sincronizacao/AvisoSincronizacao.tsx",
  "src/features/thumbnail-padroes/ThumbnailPadroesPage.tsx",
]);

function quemImportaLucide(): Set<string> {
  const arquivos = execFileSync('git', ['ls-files', 'src'], { encoding: 'utf8', timeout: 60_000 })
    .split('\n')
    .filter((caminho) => /\.tsx?$/.test(caminho) && caminho !== PORTA && !TESTES.test(caminho));
  return new Set(arquivos.filter((caminho) => IMPORTA_LUCIDE.test(readFileSync(caminho, 'utf8'))));
}

describe('ícone pelo Icon (D-853)', () => {
  const importam = quemImportaLucide();

  it('arquivo novo usa o Icon, não o lucide', () => {
    const novos = [...importam].filter((caminho) => !AINDA_IMPORTAM.has(caminho));
    expect(novos, 'Use <Icon name=...> (não acrescente à lista)').toEqual([]);
  });

  it('a lista só diminui', () => {
    const migrados = [...AINDA_IMPORTAM].filter((caminho) => !importam.has(caminho));
    expect(migrados, 'Já não importam o lucide: tire da lista').toEqual([]);
  });
});
