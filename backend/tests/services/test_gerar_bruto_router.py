"""Testes para o endpoint POST /cortes/{corte_id}/gerar-bruto.

Garantem o contrato assíncrono do endpoint:
- responde imediatamente (não bloqueia)
- marca o corte como "cortando" no dicionário ExportService._tarefas_corte
- ao final do worker, atualiza o status para "pronto" ou "erro: ..."
- chamada duplicada enquanto está cortando é idempotente
"""

import asyncio
from unittest.mock import AsyncMock, MagicMock

import pytest
from app.domain.compartilhado.erros import ErroDeDominio
from app.models import Corte
from app.routers import cortes as cortes_router
from app.routers.errors import responder_erro_de_dominio
from app.services import bruto_do_corte
from app.services.export import ExportService


@pytest.fixture(autouse=True)
def _limpar_tarefas_corte():
    """Garante isolamento entre testes — limpa o dict in-memory antes e depois."""
    ExportService._tarefas_corte.clear()
    yield
    ExportService._tarefas_corte.clear()


# Capturado antes do autouse abaixo trocar a função por um stub — os testes de
# `TestCenasGeradas` exercem a implementação real.
_JA_GEROU_BRUTO_REAL = bruto_do_corte._corte_ja_gerou_bruto


@pytest.fixture(autouse=True)
def _corte_sem_bruto(monkeypatch):
    """Default: corte SEM bruto (1ª geração) — evita I/O de disco nos testes de contrato.

    Os testes que exercem a regeração (D-160) sobrescrevem via monkeypatch.
    """
    monkeypatch.setattr(bruto_do_corte, "_corte_ja_gerou_bruto", lambda corte: False)


_SESSAO: dict = {}


@pytest.fixture(autouse=True)
def _sessao_do_service(monkeypatch):
    """A geração abre a própria sessão no service (D-705): ela devolve o `db` do teste."""
    monkeypatch.setattr(
        bruto_do_corte,
        "AsyncSessionLocal",
        lambda: MagicMock(
            __aenter__=AsyncMock(side_effect=lambda: _SESSAO["db"]),
            __aexit__=AsyncMock(return_value=False),
        ),
    )


def _registrar(db):
    # __aexit__ que devolve algo verdadeiro engoliria a exceção do bloco.
    db.begin = MagicMock(
        return_value=MagicMock(__aenter__=AsyncMock(), __aexit__=AsyncMock(return_value=False))
    )
    _SESSAO["db"] = db
    return db


def _db_com_corte(corte=None):
    db = AsyncMock()
    db.get = AsyncMock(
        return_value=corte
        if corte is not None
        else MagicMock(id="corte-1", projeto_id="proj-1", arquivo_clip_path="")
    )
    return _registrar(db)


@pytest.mark.asyncio
async def test_gerar_bruto_responde_imediatamente_e_marca_cortando(monkeypatch):
    """O endpoint dispara o worker como task e retorna sem esperar."""
    worker_chamado = asyncio.Event()
    pode_terminar = asyncio.Event()

    async def worker_lento(corte_id: str, **kwargs):
        worker_chamado.set()
        await pode_terminar.wait()
        return {"status": "pronto"}

    monkeypatch.setattr(ExportService, "gerar_bruto_via_worker", worker_lento)

    _db_com_corte()
    resposta = await cortes_router.gerar_bruto("corte-1")

    assert resposta["message"] == "Geração de bruto iniciada"
    assert resposta["corte_id"] == "corte-1"
    assert ExportService.get_tarefa_corte_status("corte-1") == "cortando"

    # Confirma que a task foi de fato disparada — o worker já está rodando
    await asyncio.wait_for(worker_chamado.wait(), timeout=1.0)

    # Libera o worker para terminar e dá um ciclo de event loop para o status atualizar
    pode_terminar.set()
    await asyncio.sleep(0)
    await asyncio.sleep(0)
    assert ExportService.get_tarefa_corte_status("corte-1") == "pronto"


@pytest.mark.asyncio
async def test_gerar_bruto_marca_erro_quando_worker_retorna_erro(monkeypatch):
    async def worker_falho(corte_id: str, **kwargs):
        return {"status": "erro", "mensagem": "ffmpeg morreu"}

    monkeypatch.setattr(ExportService, "gerar_bruto_via_worker", worker_falho)

    _db_com_corte()
    await cortes_router.gerar_bruto("corte-2")

    # Cede ao loop para a task interna completar
    for _ in range(5):
        await asyncio.sleep(0)

    status = ExportService.get_tarefa_corte_status("corte-2")
    assert status.startswith("erro:")
    assert "ffmpeg morreu" in status


@pytest.mark.asyncio
async def test_gerar_bruto_marca_erro_quando_worker_levanta_excecao(monkeypatch):
    async def worker_explode(corte_id: str, **kwargs):
        raise RuntimeError("disco cheio")

    monkeypatch.setattr(ExportService, "gerar_bruto_via_worker", worker_explode)

    _db_com_corte()
    await cortes_router.gerar_bruto("corte-3")

    for _ in range(5):
        await asyncio.sleep(0)

    status = ExportService.get_tarefa_corte_status("corte-3")
    assert status.startswith("erro:")
    assert "disco cheio" in status


@pytest.mark.asyncio
async def test_gerar_bruto_idempotente_quando_ja_cortando(monkeypatch):
    """Segundo POST enquanto já está cortando não dispara worker duplicado."""
    chamadas: list = []

    async def worker_lento(corte_id: str, **kwargs):
        chamadas.append(corte_id)
        await asyncio.sleep(0.05)
        return {"status": "pronto"}

    monkeypatch.setattr(ExportService, "gerar_bruto_via_worker", worker_lento)

    _db_com_corte()
    primeira = await cortes_router.gerar_bruto("corte-4")
    # Antes do worker terminar, faz nova chamada
    segunda = await cortes_router.gerar_bruto("corte-4")

    assert primeira["message"] == "Geração de bruto iniciada"
    assert segunda["message"] == "Geração de bruto já em andamento"

    # Espera a task original completar
    for _ in range(20):
        if ExportService.get_tarefa_corte_status("corte-4") == "pronto":
            break
        await asyncio.sleep(0.01)

    assert chamadas == ["corte-4"], "worker deve ter sido chamado uma única vez"


@pytest.mark.asyncio
async def test_gerar_bruto_404_quando_corte_inexistente(monkeypatch):
    db = AsyncMock()
    db.get = AsyncMock(return_value=None)
    _registrar(db)

    with pytest.raises(ErroDeDominio) as exc:
        await cortes_router.gerar_bruto("inexistente")
    resposta = await responder_erro_de_dominio(None, exc.value)
    assert resposta.status_code == 404


# ─── D-160: default de regeração = só o bruto (transcrição/cenas opt-in) ──────


async def _capturar_flags_do_worker(monkeypatch) -> dict:
    """Instrumenta o worker para capturar os flags recebidos e roda o endpoint."""
    capturado: dict = {}

    async def worker_espiao(corte_id: str, **kwargs):
        capturado.update(kwargs)
        return {"status": "pronto"}

    monkeypatch.setattr(ExportService, "gerar_bruto_via_worker", worker_espiao)
    return capturado


@pytest.mark.asyncio
async def test_primeira_geracao_forca_cadeia_completa(monkeypatch):
    """Corte SEM bruto: transcrição + cenas rodam, ignorando o body (não regride)."""
    monkeypatch.setattr(bruto_do_corte, "_corte_ja_gerou_bruto", lambda corte: False)
    capturado = await _capturar_flags_do_worker(monkeypatch)

    _db_com_corte()
    # Mesmo pedindo tudo desmarcado, a 1ª geração força a cadeia completa.
    body = cortes_router.GerarBrutoRequest(refazer_transcricao=False, refazer_cenas=False)
    await cortes_router.gerar_bruto("corte-1", body=body)
    for _ in range(5):
        await asyncio.sleep(0)

    assert capturado == {"refazer_transcricao": True, "refazer_cenas": True}


@pytest.mark.asyncio
async def test_regeracao_sem_opt_in_roda_so_o_bruto(monkeypatch):
    """Corte COM bruto e body default: transcrição e cenas NÃO rodam."""
    monkeypatch.setattr(bruto_do_corte, "_corte_ja_gerou_bruto", lambda corte: True)
    capturado = await _capturar_flags_do_worker(monkeypatch)

    _db_com_corte()
    await cortes_router.gerar_bruto("corte-1", body=None)
    for _ in range(5):
        await asyncio.sleep(0)

    assert capturado == {"refazer_transcricao": False, "refazer_cenas": False}


@pytest.mark.asyncio
async def test_regeracao_honra_opt_in_selecionado(monkeypatch):
    """Corte COM bruto: só o opt-in marcado (cenas) roda além do bruto."""
    monkeypatch.setattr(bruto_do_corte, "_corte_ja_gerou_bruto", lambda corte: True)
    capturado = await _capturar_flags_do_worker(monkeypatch)

    _db_com_corte()
    body = cortes_router.GerarBrutoRequest(refazer_transcricao=False, refazer_cenas=True)
    await cortes_router.gerar_bruto("corte-1", body=body)
    for _ in range(5):
        await asyncio.sleep(0)

    assert capturado == {"refazer_transcricao": False, "refazer_cenas": True}


def _corte_com(**campos) -> Corte:
    base = {"transcricao_final_texto": "", "cenas_remotion": "[]"}
    return Corte(id="corte-1", projeto_id="proj-1", numero=1, **{**base, **campos})


class TestCenasGeradas:
    """D-430: bruto apagado na limpeza NÃO pode ser lido como 1ª geração.

    Se fosse, o botão "Regerar bruto" do Pós re-rodaria as cenas por IA e
    sobrescreveria o pós já editado.
    """

    def test_corte_zerado_nao_tem_cenas(self):
        assert bruto_do_corte._corte_tem_cenas_geradas(_corte_com()) is False

    def test_transcricao_sincronizada_nao_conta_como_cenas(self):
        """D-446: a transcrição é sincronizada na fase 1, muito antes do bruto.

        Contá-la fazia o 1º "Gerar bruto" virar regeração — e a regeração pula
        as cenas por design (D-160).
        """
        corte = _corte_com(transcricao_final_texto="texto ja sincronizado")
        assert bruto_do_corte._corte_tem_cenas_geradas(corte) is False

    def test_cenas_em_lista_contam(self):
        corte = _corte_com(cenas_remotion='[{"tipo": "tela_cheia", "inicio": 0, "fim": 5}]')
        assert bruto_do_corte._corte_tem_cenas_geradas(corte) is True

    def test_cenas_no_payload_com_formato_contam(self):
        corte = _corte_com(
            cenas_remotion='{"formato": "9:16", "cenas": [{"tipo": "t", "inicio": 0, "fim": 1}]}'
        )
        assert bruto_do_corte._corte_tem_cenas_geradas(corte) is True

    def test_payload_com_cenas_vazias_nao_conta(self):
        corte = _corte_com(cenas_remotion='{"formato": "9:16", "cenas": []}')
        assert bruto_do_corte._corte_tem_cenas_geradas(corte) is False

    def test_cenas_corrompidas_nao_derrubam_a_checagem(self):
        corte = _corte_com(cenas_remotion="{nao é json")
        assert bruto_do_corte._corte_tem_cenas_geradas(corte) is False

    def test_bruto_apagado_com_pos_feito_ainda_e_regeracao(self, monkeypatch, tmp_path):
        """Sem arquivo em disco, mas com cenas editadas → regeração, não 1ª vez."""
        monkeypatch.setattr(bruto_do_corte, "projetos_dir", lambda: tmp_path)
        corte = _corte_com(cenas_remotion='[{"tipo": "tela_cheia", "inicio": 0, "fim": 5}]')

        assert _JA_GEROU_BRUTO_REAL(corte) is True

    def test_corte_novo_sem_nada_continua_sendo_primeira_geracao(self, monkeypatch, tmp_path):
        monkeypatch.setattr(bruto_do_corte, "projetos_dir", lambda: tmp_path)

        assert _JA_GEROU_BRUTO_REAL(_corte_com()) is False

    def test_corte_editado_na_fase_1_ainda_e_primeira_geracao(self, monkeypatch, tmp_path):
        """D-446: ajustar o recorte/gerar trechos sincroniza a transcrição.

        Sem bruto e sem cenas, o próximo "Gerar bruto" é a 1ª geração — é ele
        que precisa encadear transcrição + cenas.
        """
        monkeypatch.setattr(bruto_do_corte, "projetos_dir", lambda: tmp_path)
        corte = _corte_com(transcricao_final_texto="texto ja sincronizado")

        assert _JA_GEROU_BRUTO_REAL(corte) is False
