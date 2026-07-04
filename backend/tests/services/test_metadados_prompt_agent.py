"""Testes para MetadadosService e templates de prompt.

canal_config.py e gitignored (conteudo editorial especifico do canal).
Estes testes verificam apenas propriedades estruturais e comportamentais
do servico -- sem assertar strings literais do canal.
"""

import sys
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

# ---------------------------------------------------------------------------
# canal_config stub -- injetado quando o arquivo real esta ausente (clone limpo).
# Garante que os imports do servico funcionem; testes ficam verdes sem o
# conteudo editorial do canal.
# ---------------------------------------------------------------------------
try:
    import app.canal_config as _cc

    _ = _cc.PROMPT_GERAR_THUMBNAIL_AGENTE  # sondagem -- atributo deve existir
except (ImportError, AttributeError):
    _stub = MagicMock()
    _stub.CREDITOS_TEMPLATE = "{link_live}"
    _stub.PROMPT_GERAR_METADADOS = (
        "{titulo} {resumo} {tema} {numero} {transcricao} {historico_titulos}"
    )
    _stub.PROMPT_GERAR_THUMBNAIL = (
        "{titulo} {tema} {resumo} {transcricao} {texto_capa} {historico_visual}"
    )
    _stub.PROMPT_GERAR_THUMBNAIL_AGENTE = (
        "AGENTE-STUB tema:{tema} titulo_youtube:{titulo_youtube} "
        "texto_capa:{texto_capa} {resumo} {transcricao} {historico_visual}"
    )
    _stub.PROMPT_GERAR_THUMBNAIL_AGENTE_LIVRE = (
        "AGENTE-LIVRE-STUB tema:{tema} titulo_youtube:{titulo_youtube} "
        "texto_capa:{texto_capa} {resumo} {transcricao} {historico_visual}"
    )
    sys.modules["app.canal_config"] = _stub

from app.domain.manual_prompt import JSON_CODE_BLOCK_INSTRUCTION  # noqa: E402
from app.editorial_identity import Mascote  # noqa: E402
from app.services.metadados import (  # noqa: E402
    PROMPT_GERAR_THUMBNAIL_AGENTE,
    PROMPT_GERAR_THUMBNAIL_AGENTE_LIVRE,
    MetadadosService,
    formatar_bloco_hints_thumbnail,
)


class AsyncContextManagerMock:
    def __init__(self, db_mock):
        self.db_mock = db_mock

    async def __aenter__(self):
        return self.db_mock

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        pass


def test_prompt_thumbnail_agente_aceita_campos_do_corte():
    """Template AGENTE aceita todos os campos do corte sem erro de formatacao."""
    prompt = PROMPT_GERAR_THUMBNAIL_AGENTE.format(
        tema="filosofia politica",
        titulo_youtube="Titulo escolhido no YouTube",
        texto_capa="TESE CENTRAL",
        resumo="Resumo do corte.",
        transcricao="Trecho falado no corte.",
        historico_visual="Corte #1 - texto capa: EXEMPLO",
    )

    assert len(prompt) > 0
    assert "filosofia politica" in prompt
    assert "Titulo escolhido no YouTube" in prompt
    assert "TESE CENTRAL" in prompt
    assert "Resumo do corte." in prompt
    assert "Trecho falado no corte." in prompt
    # Prompt de agente (geracao direta de imagem), nao prompt JSON estruturado
    assert "prompt_thumbnail" not in prompt
    assert "Return ONLY" not in prompt


def test_prompt_thumbnail_agente_livre_diferente_do_padrao():
    """AGENTE e AGENTE_LIVRE sao templates distintos que produzem prompts diferentes."""
    kwargs = dict(
        tema="filosofia politica",
        titulo_youtube="Titulo escolhido no YouTube",
        texto_capa="TESE CENTRAL",
        resumo="Resumo do corte.",
        transcricao="Trecho falado no corte.",
        historico_visual="Corte #1 - texto capa: EXEMPLO",
    )
    prompt_padrao = PROMPT_GERAR_THUMBNAIL_AGENTE.format(**kwargs)
    prompt_livre = PROMPT_GERAR_THUMBNAIL_AGENTE_LIVRE.format(**kwargs)

    assert len(prompt_livre) > 0
    assert "TESE CENTRAL" in prompt_livre
    assert "Titulo escolhido no YouTube" in prompt_livre
    assert "Resumo do corte." in prompt_livre
    # Os dois templates produzem conteudo distinto
    assert prompt_padrao != prompt_livre
    # Tambem nao e um prompt JSON estruturado
    assert "prompt_thumbnail" not in prompt_livre
    assert "Return ONLY" not in prompt_livre


@pytest.mark.asyncio
async def test_montar_prompt_meta_inclui_instrucao_json():
    corte = MagicMock()
    corte.titulo_proposto = "Titulo Teste"
    corte.resumo = "Resumo Teste"
    corte.tema_central = "Tema Teste"
    corte.numero = 1

    mock_db = AsyncMock()
    mock_db.get = AsyncMock(return_value=corte)
    mock_ctx = AsyncContextManagerMock(mock_db)

    with (
        patch("app.services.metadados.AsyncSessionLocal", return_value=mock_ctx),
        patch(
            "app.services.metadados.MetadadosService._obter_transcricao_final",
            return_value="Transcricao Teste",
        ),
        patch("app.services.metadados.MetadadosService._obter_historico_titulos", return_value=[]),
    ):
        res = await MetadadosService.montar_prompt_meta("corte-id")

    assert JSON_CODE_BLOCK_INSTRUCTION.strip() in res["prompt"]


@pytest.mark.asyncio
async def test_montar_prompt_meta_injeta_historico_titulos():
    """Os titulos anteriores sao injetados no placeholder do prompt via servico."""
    corte = MagicMock()
    corte.titulo_proposto = "Titulo Teste"
    corte.resumo = "Resumo Teste"
    corte.tema_central = "Tema Teste"
    corte.numero = 1

    mock_db = AsyncMock()
    mock_db.get = AsyncMock(return_value=corte)
    mock_ctx = AsyncContextManagerMock(mock_db)

    with (
        patch("app.services.metadados.AsyncSessionLocal", return_value=mock_ctx),
        patch(
            "app.services.metadados.MetadadosService._obter_transcricao_final",
            return_value="Transcricao Teste",
        ),
        patch(
            "app.services.metadados.MetadadosService._obter_historico_titulos",
            return_value=["Titulo A", "Titulo B"],
        ),
    ):
        res = await MetadadosService.montar_prompt_meta("corte-id")

    prompt = res["prompt"]
    assert "Titulo A" in prompt
    assert "Titulo B" in prompt
    assert JSON_CODE_BLOCK_INSTRUCTION.strip() in prompt


@pytest.mark.asyncio
async def test_montar_contexto_meta_retorna_dados_puros():
    """O novo contexto nao carrega template -- apenas dados pra skill consumir."""
    corte = MagicMock()
    corte.titulo_proposto = "Titulo Teste"
    corte.resumo = "Resumo Teste"
    corte.tema_central = "Tema Teste"
    corte.numero = 3

    mock_db = AsyncMock()
    mock_db.get = AsyncMock(return_value=corte)
    mock_ctx = AsyncContextManagerMock(mock_db)

    with (
        patch("app.services.metadados.AsyncSessionLocal", return_value=mock_ctx),
        patch(
            "app.services.metadados.MetadadosService._obter_transcricao_final",
            return_value="Transcricao Teste",
        ),
        patch(
            "app.services.metadados.MetadadosService._obter_historico_titulos",
            return_value=["Anterior 1", "Anterior 2"],
        ),
    ):
        ctx = await MetadadosService.montar_contexto_meta("corte-id")

    assert ctx["titulo_proposto"] == "Titulo Teste"
    assert ctx["tema"] == "Tema Teste"
    assert ctx["resumo"] == "Resumo Teste"
    assert ctx["numero_corte"] == 3
    assert ctx["transcricao"] == "Transcricao Teste"
    assert "Anterior 1" in ctx["historico_titulos"]
    assert "Anterior 2" in ctx["historico_titulos"]


@pytest.mark.asyncio
async def test_montar_contexto_meta_sem_historico_avisa_primeira_da_serie():
    corte = MagicMock()
    corte.titulo_proposto = ""
    corte.resumo = ""
    corte.tema_central = ""
    corte.numero = 1

    mock_db = AsyncMock()
    mock_db.get = AsyncMock(return_value=corte)
    mock_ctx = AsyncContextManagerMock(mock_db)

    with (
        patch("app.services.metadados.AsyncSessionLocal", return_value=mock_ctx),
        patch("app.services.metadados.MetadadosService._obter_transcricao_final", return_value=""),
        patch("app.services.metadados.MetadadosService._obter_historico_titulos", return_value=[]),
    ):
        ctx = await MetadadosService.montar_contexto_meta("corte-id")

    assert "primeira da série" in ctx["historico_titulos"]
    assert "transcrição indisponível" in ctx["transcricao"]


@pytest.mark.asyncio
async def test_montar_prompt_thumbnail_externo_inclui_instrucao_json():
    corte = MagicMock()
    corte.titulo_proposto = "Titulo Teste"
    corte.resumo = "Resumo Teste"
    corte.tema_central = "Tema Teste"
    corte.projeto_id = "proj-id"

    meta = MagicMock()
    meta.texto_capa = "Texto Capa Teste"
    meta.is_fire = True

    mock_db = AsyncMock()
    mock_db.get = AsyncMock(return_value=corte)

    mock_result = MagicMock()
    mock_result.scalar_one_or_none = MagicMock(return_value=meta)
    mock_db.execute = AsyncMock(return_value=mock_result)

    mock_ctx = AsyncContextManagerMock(mock_db)

    with (
        patch("app.services.metadados.AsyncSessionLocal", return_value=mock_ctx),
        patch(
            "app.services.metadados.MetadadosService._obter_transcricao_final",
            return_value="Transcricao Teste",
        ),
        patch(
            "app.services.metadados.MetadadosService._obter_historico_thumbnails", return_value=[]
        ),
    ):
        res = await MetadadosService.montar_prompt_thumbnail_externo("corte-id")

    assert JSON_CODE_BLOCK_INSTRUCTION.strip() in res["prompt"]


# ---------------------------------------------------------------------------
# E-010 (D-222): identidade do mascote vem do instance/editorial, não do código.
# ---------------------------------------------------------------------------


def test_bloco_hints_usa_nome_do_mascote_do_instance():
    """Não-regressão PROD: com nome='Sapo' o bloco reproduz 'identidade do Sapo'."""
    with patch(
        "app.services.metadados.identidade_do_mascote",
        return_value=Mascote(nome="Sapo"),
    ):
        bloco = formatar_bloco_hints_thumbnail("clima soturno")

    assert "mantendo a identidade do Sapo" in bloco
    assert "clima soturno" in bloco


def test_bloco_hints_fallback_neutro():
    """Sem instance/editorial, o bloco fala de um 'mascote' genérico."""
    with patch(
        "app.services.metadados.identidade_do_mascote",
        return_value=Mascote(nome="mascote"),
    ):
        bloco = formatar_bloco_hints_thumbnail("clima soturno")

    assert "mantendo a identidade do mascote" in bloco


def test_bloco_hints_vazio_nao_le_identidade():
    """Hints vazio retorna '' sem tocar na identidade (comportamento anterior)."""
    assert formatar_bloco_hints_thumbnail("") == ""
    assert formatar_bloco_hints_thumbnail(None) == ""
