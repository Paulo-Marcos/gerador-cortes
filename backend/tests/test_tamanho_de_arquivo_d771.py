"""Nenhum arquivo de código passa de 500 linhas sem estar na lista de exceções (D-771).

Um agente lê cerca de 2.000 linhas por leitura e navega por grep: arquivo
grande obriga a paginar e fragmenta o raciocínio. O portão de qualidade do
`guia finish` (D-095) pedia ao próprio agente que avaliasse o tamanho, e o
agente sempre respondia "ok" — 557 fechamentos "checked" e 61 arquivos acima
de 500 linhas. A regra só vale se a máquina a conferir.

Os arquivos que já passavam do limite em 27/09/2026 estão em `EXCECOES`,
cada um com o tamanho daquele dia como teto. A lista é uma catraca, só anda
para um lado:

- arquivo fora da lista que passa de `LIMITE` falha;
- arquivo da lista que cresce além do teto falha;
- arquivo da lista que encolheu falha até o teto ser baixado para o tamanho
  novo — e sai da lista quando chegar a `LIMITE` ou menos.

Para quebrar um arquivo grande, veja o épico E-066.
"""

import subprocess
from pathlib import Path

import pytest

# Sem a marca `integration` de propósito (D-805): varre o repositório, mas
# leva 0,2 s. Marcado, ficava fora do ciclo antes do commit e a D-798 passou
# dois arquivos do limite sem ninguém ver.

RAIZ = Path(__file__).resolve().parents[2]
LIMITE = 500
PASTAS = ("backend/app", "frontend/src", "video-renderer/src")
EXTENSOES = {".py", ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"}
# Gerado a partir do openapi.json; ninguém o edita à mão.
GERADOS = {"frontend/src/shared/api/contract.ts"}

EXCECOES = {
    "backend/app/domain/corte/youtube_layout.py": 920,
    "backend/app/domain/short/gancho_short.py": 561,
    "backend/app/infrastructure/claude_cli_client.py": 693,
    "backend/app/infrastructure/render/ffmpeg_commands.py": 512,
    "backend/app/infrastructure/render/ffmpeg_grade.py": 668,
    "backend/app/infrastructure/settings_store.py": 893,
    "backend/app/models.py": 908,
    "backend/app/routers/cortes.py": 698,
    "backend/app/routers/projetos.py": 823,
    "backend/app/routers/shorts.py": 1363,
    "backend/app/routers/shorts_schemas.py": 558,
    "backend/app/services/analise.py": 881,
    "backend/app/services/canal/editorial_scaffolds.py": 669,
    "backend/app/services/canal/editorial_skills.py": 876,
    "backend/app/services/capa_tiktok.py": 546,
    "backend/app/services/cenas_remotion.py": 936,
    "backend/app/services/claude_ia.py": 519,
    "backend/app/services/corte.py": 1636,
    "backend/app/services/export.py": 555,
    "backend/app/services/ingestao.py": 719,
    "backend/app/services/instagram_reels.py": 679,
    "backend/app/services/metadados.py": 785,
    "backend/app/services/navegador_assistido.py": 598,
    "backend/app/services/palco_shorts.py": 839,
    "backend/app/services/publicacao_lote.py": 596,
    "backend/app/services/ranking_lives.py": 589,
    "backend/app/services/render/pipeline_render.py": 1633,
    "backend/app/services/render/render_short.py": 732,
    "backend/app/services/shorts.py": 1499,
    "backend/app/services/tiktok_studio.py": 766,
    "backend/app/services/youtube.py": 611,
    "frontend/src/features/editor/fase1/RightTabsPanel.tsx": 688,
    "frontend/src/features/editor/fase1/TimelinePanel.tsx": 1423,
    "frontend/src/features/editor/fase2/EditorFase2.tsx": 571,
    "frontend/src/features/editor/fase2/PosicionamentoModal.tsx": 777,
    "frontend/src/features/editor/fase2/SceneTimeline.tsx": 1037,
    "frontend/src/features/editor/fase2/posicionamentoControls.tsx": 762,
    "frontend/src/features/editor/fase2/useYoutubeLayoutPanel.tsx": 717,
    "frontend/src/features/editor/fase2/youtubeLayoutPanel/components.tsx": 752,
    "frontend/src/features/editor/useEditorPage.tsx": 681,
    "frontend/src/features/final-review/FinalReviewPage.tsx": 645,
    "frontend/src/features/metadata/MetadataCard.tsx": 928,
    "frontend/src/features/post-production/ScenesPostProductionPage.tsx": 509,
    "frontend/src/features/projeto-detalhe/WorkspaceProjetoPage.tsx": 568,
    "frontend/src/features/shorts/CandidatoCard.tsx": 541,
    "frontend/src/features/shorts/DefinirPalcoModal.tsx": 795,
    "frontend/src/features/shorts/FireDetalhePage.tsx": 538,
    "frontend/src/features/shorts/GanchoModal.tsx": 680,
    "frontend/src/features/shorts/PublicarEmLoteModal.tsx": 648,
    "frontend/src/features/shorts/ReguaDeOnda.tsx": 582,
    "frontend/src/features/shorts/ShortsPage.tsx": 576,
    "frontend/src/features/shorts/useShortsDoCorte.ts": 658,
    "frontend/src/shared/atalhos/shortcutsRegistry.ts": 775,
    "frontend/src/shared/filaGlobal/useWorkbenchQueue.tsx": 619,
    "frontend/src/shared/palco/youtubeBackgrounds.tsx": 638,
    "frontend/src/shared/palco/youtubeLayout.ts": 784,
    "frontend/src/upgrade/KitScreen.tsx": 602,
    "frontend/src/upgrade/TopBar.tsx": 554,
    "video-renderer/src/cenas-v2/CenaComparativo.tsx": 512,
}


def _tamanhos_dos_arquivos_de_codigo() -> dict[str, int]:
    saida = subprocess.run(
        ["git", "ls-files", *PASTAS],
        cwd=RAIZ,
        capture_output=True,
        text=True,
        check=True,
        timeout=60,
    ).stdout
    tamanhos = {}
    for caminho in saida.splitlines():
        if Path(caminho).suffix not in EXTENSOES or caminho in GERADOS:
            continue
        arquivo = RAIZ / caminho
        if arquivo.exists():
            tamanhos[caminho] = len(arquivo.read_text(encoding="utf-8").splitlines())
    return tamanhos


@pytest.fixture(scope="module")
def tamanhos() -> dict[str, int]:
    return _tamanhos_dos_arquivos_de_codigo()


def test_arquivo_novo_nao_passa_do_limite(tamanhos):
    estourados = {
        caminho: linhas
        for caminho, linhas in tamanhos.items()
        if linhas > LIMITE and caminho not in EXCECOES
    }
    assert not estourados, (
        f"Arquivos acima de {LIMITE} linhas (divida o arquivo; não o acrescente "
        f"a EXCECOES): {estourados}"
    )


def test_excecao_nao_cresce(tamanhos):
    cresceram = {
        caminho: f"{tamanhos[caminho]} > teto {teto}"
        for caminho, teto in EXCECOES.items()
        if tamanhos.get(caminho, 0) > teto
    }
    assert not cresceram, f"Arquivos da lista de exceções cresceram: {cresceram}"


def test_lista_de_excecoes_so_diminui(tamanhos):
    desatualizados = {}
    for caminho, teto in EXCECOES.items():
        atual = tamanhos.get(caminho)
        if atual is None:
            desatualizados[caminho] = "não existe mais: remova da lista"
        elif atual <= LIMITE:
            desatualizados[caminho] = f"tem {atual} linhas: remova da lista"
        elif atual < teto:
            desatualizados[caminho] = f"encolheu para {atual}: baixe o teto"
    assert not desatualizados, f"Atualize EXCECOES: {desatualizados}"
