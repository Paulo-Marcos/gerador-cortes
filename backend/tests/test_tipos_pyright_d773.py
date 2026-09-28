"""Nenhum erro de tipo novo no backend (D-773).

O TypeScript do frontend roda em modo strict; as anotações de tipo do Python
não eram conferidas por ninguém. O pyright (o mesmo motor do Pylance no VS
Code) em modo basic, configurado em `[tool.pyright]` no `pyproject.toml`,
passa a conferir `backend/app`.

Os 175 erros que já existiam em 28/09/2026 estão em `EXCECOES`, contados por
arquivo e regra, com as mesmas regras de catraca dos portões de tamanho
(D-771, D-772):

- erro numa combinação arquivo/regra fora da lista falha;
- combinação da lista com mais erros que o teto falha;
- combinação da lista com menos erros falha até o teto ser baixado — e sai da
  lista quando chegar a zero.

O pyright recebe o Python que roda o teste (`--pythonpath`): sem isso ele usa
o do PATH, e um pacote instalado só no venv vira "import não resolvido".
"""

import json
import subprocess
import sys
from collections import Counter
from pathlib import Path

import pytest

pytestmark = pytest.mark.integration  # checa o backend inteiro; ~90 s (D-751)

BACKEND = Path(__file__).resolve().parents[1]
# Import não resolvido depende do que está instalado, não do código: a
# diarização usa torch e pyannote, opcionais (requirements.txt). Um import
# quebrado de verdade o próprio pytest já derruba.
REGRAS_DE_AMBIENTE = {"reportMissingImports", "reportMissingModuleSource"}

EXCECOES = {
    "app/domain/canal/variacao_prompt.py::reportArgumentType": 1,
    "app/domain/corte/corte_mapper.py::reportArgumentType": 1,
    "app/domain/corte/ordem_cortes.py::reportArgumentType": 2,
    "app/domain/corte/padroes_thumbnail.py::reportArgumentType": 1,
    "app/domain/corte/padroes_thumbnail.py::reportCallIssue": 1,
    "app/domain/corte/render_etapas.py::reportArgumentType": 1,
    "app/domain/corte/render_etapas.py::reportCallIssue": 1,
    "app/domain/projeto/json3_parser.py::reportArgumentType": 1,
    "app/domain/projeto/transcricao_utils.py::reportArgumentType": 1,
    "app/domain/short/formato_video.py::reportArgumentType": 1,
    "app/domain/short/metadados_short.py::reportAssignmentType": 1,
    "app/domain/short/palco_short.py::reportArgumentType": 2,
    "app/domain/short/palco_short.py::reportCallIssue": 1,
    "app/domain/short/palco_short.py::reportOptionalMemberAccess": 2,
    "app/domain/short/palco_short.py::reportOptionalSubscript": 1,
    "app/infrastructure/claude_cli_client.py::reportGeneralTypeIssues": 1,
    "app/infrastructure/detector_rosto.py::reportAttributeAccessIssue": 1,
    "app/infrastructure/gemini_client.py::reportArgumentType": 1,
    "app/infrastructure/gemini_client.py::reportOptionalIterable": 1,
    "app/infrastructure/gemini_client.py::reportOptionalMemberAccess": 2,
    "app/infrastructure/gemini_client.py::reportReturnType": 1,
    "app/infrastructure/imagem/moldura.py::reportAttributeAccessIssue": 5,
    "app/infrastructure/imagem/moldura.py::reportOperatorIssue": 2,
    "app/infrastructure/render/ffmpeg_grade.py::reportAssignmentType": 1,
    "app/infrastructure/web_imagens.py::reportOptionalMemberAccess": 1,
    "app/infrastructure/youtube_api.py::reportReturnType": 1,
    "app/main.py::reportArgumentType": 2,
    "app/migrations/reconciliacao.py::reportAttributeAccessIssue": 1,
    "app/routers/analises_schemas.py::reportInvalidTypeForm": 6,
    "app/routers/avaliacao_bruto.py::reportInvalidTypeForm": 4,
    "app/routers/cortes.py::reportArgumentType": 3,
    "app/routers/errors.py::reportArgumentType": 1,
    "app/routers/export.py::reportArgumentType": 2,
    "app/routers/metadados.py::reportArgumentType": 1,
    "app/routers/presets.py::reportInvalidTypeForm": 2,
    "app/routers/presets.py::reportOptionalMemberAccess": 5,
    "app/routers/projetos.py::reportAttributeAccessIssue": 2,
    "app/routers/projetos.py::reportInvalidTypeForm": 8,
    "app/routers/projetos.py::reportOptionalMemberAccess": 1,
    "app/routers/ranking_lives.py::reportInvalidTypeForm": 2,
    "app/services/analise.py::reportArgumentType": 1,
    "app/services/analise.py::reportAttributeAccessIssue": 1,
    "app/services/canal/prompts_utilitarios.py::reportArgumentType": 1,
    "app/services/cenas_remotion.py::reportArgumentType": 2,
    "app/services/cenas_remotion.py::reportOptionalMemberAccess": 1,
    "app/services/cenas_remotion.py::reportReturnType": 1,
    "app/services/claude_ia.py::reportArgumentType": 1,
    "app/services/corte.py::reportArgumentType": 4,
    "app/services/corte.py::reportOptionalMemberAccess": 14,
    "app/services/desvios.py::reportArgumentType": 1,
    "app/services/desvios.py::reportReturnType": 1,
    "app/services/deteccao_segmentos.py::reportReturnType": 1,
    "app/services/enquadramento_shorts.py::reportArgumentType": 4,
    "app/services/enquadramento_shorts.py::reportOptionalMemberAccess": 1,
    "app/services/export_bulk_queue.py::reportAttributeAccessIssue": 10,
    "app/services/ingestao.py::reportAttributeAccessIssue": 3,
    "app/services/ingestao.py::reportOptionalContextManager": 1,
    "app/services/ingestao.py::reportOptionalIterable": 1,
    "app/services/ingestao.py::reportOptionalMemberAccess": 1,
    "app/services/listagem_de_projetos.py::reportReturnType": 1,
    "app/services/metadados.py::reportArgumentType": 2,
    "app/services/metadados.py::reportOptionalMemberAccess": 4,
    "app/services/palco_shorts.py::reportArgumentType": 4,
    "app/services/publicacao_destinos.py::reportCallIssue": 1,
    "app/services/publicacao_no_tiktok.py::reportReturnType": 1,
    "app/services/render/pipeline_render.py::reportArgumentType": 1,
    "app/services/render/pipeline_render.py::reportAttributeAccessIssue": 1,
    "app/services/render/pipeline_render.py::reportGeneralTypeIssues": 1,
    "app/services/render/pipeline_render.py::reportOptionalMemberAccess": 1,
    "app/services/render/render_short.py::reportArgumentType": 6,
    "app/services/render/render_short.py::reportAttributeAccessIssue": 2,
    "app/services/render/render_short.py::reportOptionalMemberAccess": 13,
    "app/services/shorts_prontos.py::reportOptionalMemberAccess": 1,
    "app/services/timeline_math.py::reportArgumentType": 2,
    "app/services/timeline_math.py::reportCallIssue": 2,
    "app/services/timeline_math.py::reportOperatorIssue": 1,
    "app/services/validacao_publicacao.py::reportArgumentType": 4,
    "app/services/youtube.py::reportArgumentType": 1,
    "app/services/youtube.py::reportOptionalMemberAccess": 1,
}


def _contar_erros() -> dict[str, int]:
    saida = subprocess.run(
        [sys.executable, "-m", "pyright", "--outputjson", "--pythonpath", sys.executable],
        cwd=BACKEND,
        capture_output=True,
        text=True,
        encoding="utf-8",
        check=False,  # sai com 1 sempre que há erro; o JSON é que diz quais
        timeout=600,
    ).stdout
    erros = Counter()
    for diagnostico in json.loads(saida)["generalDiagnostics"]:
        if diagnostico["severity"] != "error" or diagnostico.get("rule") in REGRAS_DE_AMBIENTE:
            continue
        caminho = Path(diagnostico["file"]).resolve().relative_to(BACKEND).as_posix()
        erros[f"{caminho}::{diagnostico.get('rule', 'sem-regra')}"] += 1
    return dict(erros)


@pytest.fixture(scope="module")
def erros() -> dict[str, int]:
    return _contar_erros()


def test_nenhum_erro_de_tipo_novo(erros):
    novos = {chave: total for chave, total in erros.items() if chave not in EXCECOES}
    assert not novos, (
        "Erros de tipo novos (corrija; não os acrescente a EXCECOES). "
        f"Detalhe com `python -m pyright`: {novos}"
    )


def test_excecao_nao_piora(erros):
    pioraram = {
        chave: f"{erros[chave]} > teto {teto}"
        for chave, teto in EXCECOES.items()
        if erros.get(chave, 0) > teto
    }
    assert not pioraram, f"Arquivos da lista ganharam erros de tipo: {pioraram}"


def test_lista_de_excecoes_so_diminui(erros):
    desatualizadas = {}
    for chave, teto in EXCECOES.items():
        atual = erros.get(chave, 0)
        if atual == 0:
            desatualizadas[chave] = "sem erros: remova da lista"
        elif atual < teto:
            desatualizadas[chave] = f"caiu para {atual}: baixe o teto"
    assert not desatualizadas, f"Atualize EXCECOES: {desatualizadas}"
