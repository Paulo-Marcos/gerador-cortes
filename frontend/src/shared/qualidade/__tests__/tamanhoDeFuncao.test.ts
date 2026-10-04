// Nenhuma função do frontend passa de 100 linhas sem estar na lista de
// exceções (D-772). Irmão do portão de tamanho de arquivo (D-771), com as
// mesmas regras de catraca:
//
// - função fora da lista que passa do limite falha;
// - função da lista que cresce além do teto falha;
// - função da lista que encolheu falha até o teto ser baixado — e sai da
//   lista quando voltar ao limite.
//
// O limite é em linhas, não em complexidade: um componente React é uma
// função, e o JSX dele ocupa espaço sem ramificar. 100 linhas cabem numa tela
// e numa leitura do agente sem paginar. Os tetos são do dia 28/09/2026.
//
// A chave é `arquivo::Pai.funcao`. Função sem nome leva o nome de quem a
// recebe (`useEffect`, `map`, `onClick`) e, havendo mais de uma com o mesmo
// nome no mesmo pai, um `#n` pela ordem no arquivo. Renomear ou mover a
// função conta como função nova.

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const LIMITE = 100;
// Gerado a partir do openapi.json; ninguém o edita à mão.
const GERADOS = new Set(['src/shared/api/contract.ts']);
// Um `describe` longo é roteiro de teste, não função a dividir.
const TESTES = /(__tests__\/|\.test\.tsx?$)/;

const EXCECOES: Record<string, number> = {
  "src/components/PromptManualPanel.tsx::PromptManualPanel": 223,
  "src/components/PromptManualPanel.tsx::PromptManualPanel.map": 103,
  "src/components/ui/modal.tsx::Modal": 103,
  "src/features/analises/PropostaFinalTab.tsx::PropostaFinalTab": 102,
  "src/features/analises/YoutubeDesempenhoTab.tsx::YoutubeDesempenhoTab": 122,
  "src/features/atalhos/AtalhosPage.tsx::AtalhosPage": 226,
  "src/features/channels/ChannelCard.tsx::ChannelCard": 144,
  "src/features/channels/ChannelForm.tsx::ChannelForm": 142,
  "src/features/channels/ChannelsPage.tsx::ChannelsPage": 266,
  "src/features/channels/EditorialScaffoldForm.tsx::EditorialScaffoldForm": 106,
  "src/features/channels/EditorialScaffoldsSection.tsx::EditorialScaffoldsSection": 106,
  "src/features/channels/EditorialSkillForm.tsx::EditorialSkillForm": 166,
  "src/features/channels/EditorialSkillsSection.tsx::EditorialSkillsSection": 127,
  "src/features/channels/PromptUtilitarioForm.tsx::PromptUtilitarioForm": 105,
  "src/features/channels/PromptsUtilitariosSection.tsx::PromptsUtilitariosSection": 102,
  "src/features/editor/AdicionarCorteModal.tsx::AdicionarCorteModal": 174,
  "src/features/editor/BancadaChrome.tsx::BancadaChrome": 230,
  "src/features/editor/CommonTopBar.tsx::StatusToggleRow": 127,
  "src/features/editor/EditorPage.tsx::EditorPage": 238,
  "src/features/editor/fase1/AudioSyncControl.tsx::AudioSyncControl": 136,
  "src/features/editor/fase1/BlocosPanel.tsx::BlocosPanel": 175,
  "src/features/editor/fase1/EditorFase1.tsx::EditorFase1": 184,
  "src/features/editor/fase1/PlayerPanel.tsx::forwardRef": 289,
  "src/features/editor/fase1/RightTabsPanel.tsx::RightTabsPanel": 164,
  "src/features/editor/fase1/RightTabsPanel.tsx::TranscriptList": 129,
  "src/features/editor/fase1/RightTabsPanel.tsx::memo": 198,
  "src/features/editor/fase1/TimelinePanel.tsx::AdvancedMenu": 322,
  "src/features/editor/fase1/TimelinePanel.tsx::TimelinePanel": 230,
  "src/features/editor/fase1/TimelinePanel.tsx::Waveform": 485,
  "src/features/editor/fase1/TimelinePanel.tsx::Waveform.useEffect#2": 125,
  "src/features/editor/fase2/CenaItem.tsx::CenaItem": 234,
  "src/features/editor/fase2/CenaPlayerPanel.tsx::forwardRef": 217,
  "src/features/editor/fase2/CenasPanel.tsx::forwardRef": 399,
  "src/features/editor/fase2/CenasRemotionPreview.tsx::CenasRemotionPreview": 159,
  "src/features/editor/fase2/EditorFase2.tsx::EditorFase2": 357,
  "src/features/editor/fase2/PosicionamentoModal.tsx::PosicionamentoModal": 686,
  "src/features/editor/fase2/SceneTimeline.tsx::SceneTimeline": 744,
  "src/features/editor/fase2/YoutubeLayoutPanel.tsx::forwardRef": 301,
  "src/features/editor/fase2/posicionamentoControls.tsx::CropPicker": 129,
  "src/features/editor/fase2/posicionamentoControls.tsx::SharedRectEditor": 138,
  "src/features/editor/fase2/posicionamentoControls.tsx::SlotPreview": 206,
  "src/features/editor/fase2/useEditorFase2.tsx::useEditorFase2": 458,
  "src/features/editor/fase2/useYoutubeLayoutPanel.tsx::useYoutubeLayoutPanel": 648,
  "src/features/editor/fase2/youtubeLayoutPanel/components.tsx::DefinirScopeRow": 103,
  "src/features/editor/fase2/youtubeLayoutPanel/components.tsx::EscopoLadder": 134,
  "src/features/editor/fase2/youtubeLayoutPanel/components.tsx::RegionItem": 194,
  "src/features/editor/useEditorPage.tsx::useEditorPage": 574,
  "src/features/fila/FilaPage.tsx::LinhaJob": 126,
  "src/features/final-review/FinalReviewPage.tsx::FinalReviewPage": 372,
  "src/features/lives/LiveSearchPage.tsx::LiveSearchPage": 224,
  "src/features/lives/RankingEmbasamentoPanel.tsx::RankingEmbasamentoPanel": 152,
  "src/features/lives/RankingLivesPage.tsx::RankingLivesPage": 159,
  "src/features/lives/RankingLivesPage.tsx::RankingRow": 167,
  "src/features/metadata/CapaTikTokSlot.tsx::CapaTikTokSlot": 256,
  "src/features/metadata/MetadadosDoCorteModal.tsx::MetadadosDoCorteModal": 235,
  "src/features/metadata/MetadataCard.tsx::MetadataCard": 612,
  "src/features/metadata/MetadataCard.tsx::PromptImportModal": 129,
  "src/features/metadata/MetadataPage.tsx::MetadataPage": 254,
  "src/features/metadata/ThumbnailAvaliacaoPanel.tsx::ThumbnailAvaliacaoPanel": 164,
  "src/features/metadata/useMetadataCard.tsx::useMetadataCard": 311,
  "src/features/post-production/FiltroTestePanel.tsx::FiltroTestePanel": 221,
  "src/features/post-production/RenderStepsModal.tsx::RenderStepsModal": 162,
  "src/features/post-production/ScenesPostProductionPage.tsx::ScenesPostProductionPage": 462,
  "src/features/projeto-detalhe/AnaliseIaModal.tsx::AnaliseIaModalDaLive": 325,
  "src/features/projeto-detalhe/CorteLinhaAp.tsx::CorteLinhaAp": 272,
  "src/features/projeto-detalhe/DiarizacaoPanel.tsx::DiarizacaoPanel": 121,
  "src/features/projeto-detalhe/PublicarMassaModal.tsx::PublicarMassaModal": 181,
  "src/features/projeto-detalhe/PublicarTiktokModal.tsx::LinhaDoCorte": 227,
  "src/features/projeto-detalhe/WorkspaceProjetoPage.tsx::WorkspaceProjetoPage": 454,
  "src/features/projeto-detalhe/useWorkspaceProjeto.tsx::useWorkspaceProjeto": 323,
  "src/features/projetos/BibliotecaPage.tsx::BibliotecaPage": 208,
  "src/features/projetos/ProjetoCardAp.tsx::ProjetoCardAp": 334,
  "src/features/settings/AppSettingsControls.tsx::AppSettingsControls": 335,
  "src/features/settings/CapaTikTokLayoutEditor.tsx::CapaTikTokLayoutEditor": 142,
  "src/features/shorts/BlocosArrastaveis.tsx::BlocosArrastaveis": 120,
  "src/features/shorts/CabecalhoDoFire.tsx::CabecalhoDoFire": 133,
  "src/features/shorts/CandidatoCard.tsx::CandidatoCard": 437,
  "src/features/shorts/CapaModal.tsx::ArteDaCapa": 139,
  "src/features/shorts/CapaModal.tsx::CapaModal": 264,
  "src/features/shorts/ColunaDeDecisoes.tsx::ColunaDeDecisoes": 210,
  "src/features/shorts/DefinirPalcoModal.tsx::DefinirPalcoModal": 635,
  "src/features/shorts/FireDetalhePage.tsx::FireDetalhePage": 436,
  "src/features/shorts/GanchoModal.tsx::GanchoModal": 583,
  "src/features/shorts/GanchoPrevia.tsx::GanchoPrevia": 158,
  "src/features/shorts/LegendaPrevia.tsx::LegendaPrevia": 162,
  "src/features/shorts/LinhaDeAjuste.tsx::LinhaDeAjuste": 129,
  "src/features/shorts/LinhaDoTempo.tsx::LinhaDoTempo": 167,
  "src/features/shorts/ListaDeSegmentos.tsx::ListaDeSegmentos": 142,
  "src/features/shorts/PainelPublicacao.tsx::PainelPublicacao": 104,
  "src/features/shorts/PalcoPrevia.tsx::PalcoPrevia": 177,
  "src/features/shorts/PostModal.tsx::PostModal": 171,
  "src/features/shorts/PresetDoGanchoModal.tsx::EditorDoPresetDeGancho": 276,
  "src/features/shorts/PresetDoPalcoModal.tsx::EditorDoPresetDePalco": 101,
  "src/features/shorts/PresetsDoPalco.tsx::PresetsDoPalco": 138,
  "src/features/shorts/PublicarEmLoteModal.tsx::PublicarEmLoteModal": 290,
  "src/features/shorts/ReguaDeOnda.tsx::ReguaDeOnda": 367,
  "src/features/shorts/ReguaDeOnda.tsx::ReguaDeOnda.useEffect": 136,
  "src/features/shorts/ShortsPage.tsx::FireCard": 108,
  "src/features/shorts/ShortsPage.tsx::ShortsPage": 137,
  "src/features/shorts/ShortsProntosPage.tsx::CartaoDaCentral": 121,
  "src/features/shorts/ShortsProntosPage.tsx::ShortsProntosPage": 163,
  "src/features/shorts/WorkspaceDoFirePage.tsx::CartaoDoPronto": 143,
  "src/features/shorts/WorkspaceDoFirePage.tsx::WorkspaceDoFirePage": 140,
  "src/features/shorts/useEdicaoDoShort.ts::useEdicaoDoShort": 112,
  "src/features/thumbnail-padroes/ThumbnailPadroesPage.tsx::ThumbnailPadroesPage": 158,
  "src/hooks/useLipSyncPreview.ts::useLipSyncPreview": 130,
  "src/hooks/useLipSyncPreview.ts::useLipSyncPreview.useEffect#2": 102,
  "src/shared/palco/youtubeBackgrounds.tsx::FundoThumb": 110,
  "src/shared/palco/youtubeLayout.ts::normalizeYoutubeLayout": 143,
  "src/upgrade/ActionBar.tsx::ActionBar": 145,
  "src/upgrade/GavetaDaFila.tsx::GavetaDaFila": 136,
  "src/upgrade/GlobalRail.tsx::GlobalRail": 244,
  "src/upgrade/KitScreen.tsx::KitScreen": 208,
  "src/upgrade/KitScreen.tsx::ModalDemo": 146,
  "src/upgrade/PaletaDeComandos.tsx::PaletaDeComandos": 351,
  "src/upgrade/TopBar.tsx::Seletor": 213,
  "src/upgrade/TopBar.tsx::TopBar": 200,
  "src/upgrade/UpgradeModal.tsx::UpgradeModal": 158,
  "src/upgrade/UpgradeShell.tsx::Casca": 201,
};

function nomeDaFuncao(no: ts.SignatureDeclaration): string {
  if ((ts.isFunctionDeclaration(no) || ts.isMethodDeclaration(no)) && no.name) {
    return no.name.getText();
  }
  const pai = no.parent;
  if (ts.isVariableDeclaration(pai) || ts.isPropertyAssignment(pai) || ts.isJsxAttribute(pai)) {
    return pai.name.getText();
  }
  if (ts.isCallExpression(pai)) {
    const chamada = pai.expression;
    return ts.isPropertyAccessExpression(chamada) ? chamada.name.getText() : chamada.getText();
  }
  if (ts.isJsxExpression(pai) && ts.isJsxAttribute(pai.parent)) {
    return pai.parent.name.getText();
  }
  return 'anonima';
}

function medirArquivo(caminho: string, medidas: Record<string, number>): void {
  const texto = readFileSync(caminho, 'utf8');
  const fonte = ts.createSourceFile(caminho, texto, ts.ScriptTarget.Latest, true);
  const linha = (posicao: number) => fonte.getLineAndCharacterOfPosition(posicao).line;
  const vistos = new Map<string, number>();

  const visitar = (no: ts.Node, prefixo: string): void => {
    let proximo = prefixo;
    if (ts.isFunctionLike(no) && 'body' in no && no.body) {
      const base = `${prefixo}${nomeDaFuncao(no)}`;
      const ordem = (vistos.get(base) ?? 0) + 1;
      vistos.set(base, ordem);
      const nome = ordem === 1 ? base : `${base}#${ordem}`;
      const linhas = linha(no.end) - linha(no.getStart(fonte)) + 1;
      if (linhas > LIMITE) medidas[`${caminho}::${nome}`] = linhas;
      proximo = `${nome}.`;
    }
    ts.forEachChild(no, (filho) => visitar(filho, proximo));
  };
  visitar(fonte, '');
}

function medirFuncoes(): Record<string, number> {
  const arquivos = execFileSync('git', ['ls-files', 'src'], { encoding: 'utf8', timeout: 60_000 })
    .split('\n')
    .filter((caminho) => /\.tsx?$/.test(caminho) && !GERADOS.has(caminho) && !TESTES.test(caminho));
  const medidas: Record<string, number> = {};
  for (const caminho of arquivos) medirArquivo(caminho, medidas);
  return medidas;
}

describe('tamanho de função (D-772)', () => {
  const medidas = medirFuncoes();

  it('função nova não passa do limite', () => {
    const novas = Object.fromEntries(
      Object.entries(medidas).filter(([chave]) => !(chave in EXCECOES)),
    );
    expect(novas, `Divida a função (não a acrescente a EXCECOES); limite ${LIMITE}`).toEqual({});
  });

  it('exceção não cresce', () => {
    const cresceram = Object.entries(EXCECOES)
      .filter(([chave, teto]) => (medidas[chave] ?? 0) > teto)
      .map(([chave, teto]) => `${chave}: ${medidas[chave]} > teto ${teto}`);
    expect(cresceram).toEqual([]);
  });

  it('lista de exceções só diminui', () => {
    const desatualizadas = Object.entries(EXCECOES).flatMap(([chave, teto]) => {
      const atual = medidas[chave];
      if (atual === undefined) return [`${chave}: voltou ao limite, mudou de nome ou sumiu — remova`];
      if (atual < teto) return [`${chave}: encolheu para ${atual} — baixe o teto`];
      return [];
    });
    expect(desatualizadas).toEqual([]);
  });
});
