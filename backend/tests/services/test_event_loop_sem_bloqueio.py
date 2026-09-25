"""As faxinas pesadas não podem rodar no event loop (D-645).

O backend é um garçom só: enquanto ele apaga uma pasta de dezenas de GB ou
espera o Google renovar um token, NENHUMA outra tela é atendida. O sintoma
aparece longe da causa — a tela que congela não é a que mandou apagar.

A prova aqui é direta: cada dublê falha se for chamado na thread PRINCIPAL.
Se alguém devolver a chamada para o event loop, o teste acusa na hora.
"""

import shutil
import threading
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock

import pytest
from app.routers import cortes
from app.services import corte as corte_service
from app.services import finalizacao_do_corte
from app.services import projeto as projeto_service


def _espiao(registro: list[str], nome: str):
    """Dublê que exige estar fora da thread principal."""

    def fake(*args, **kwargs):
        atual = threading.current_thread()
        assert atual is not threading.main_thread(), (
            f"{nome} rodou na thread principal: o event loop ficou bloqueado"
        )
        registro.append(nome)
        return MagicMock()

    return fake


@pytest.fixture
def db():
    sessao = AsyncMock()
    sessao.get = AsyncMock(return_value=MagicMock())
    return sessao


@pytest.mark.asyncio
async def test_deletar_projeto_apaga_a_pasta_fora_do_loop(tmp_path, monkeypatch, db):
    chamadas: list[str] = []
    (tmp_path / "p1").mkdir()
    monkeypatch.setattr(projeto_service, "projetos_dir", lambda: tmp_path)
    monkeypatch.setattr(projeto_service.shutil, "rmtree", _espiao(chamadas, "rmtree"))

    assert await projeto_service.ProjetoService.deletar_projeto("p1", db) is True
    assert chamadas == ["rmtree"]


@pytest.mark.asyncio
async def test_limpeza_de_midia_varre_o_disco_fora_do_loop(tmp_path, monkeypatch, db):
    chamadas: list[str] = []
    (tmp_path / "p1").mkdir()
    monkeypatch.setattr(projeto_service, "projetos_dir", lambda: tmp_path)
    monkeypatch.setattr(
        projeto_service.MediaRetentionService,
        "limpar_projeto",
        _espiao(chamadas, "limpar_projeto"),
    )
    db.execute = AsyncMock(return_value=MagicMock(scalars=lambda: MagicMock(all=list)))

    await projeto_service.ProjetoService.limpar_arquivos_projeto("p1", db)
    assert chamadas == ["limpar_projeto"]


@pytest.mark.asyncio
async def test_deletar_corte_apaga_a_pasta_fora_do_loop(tmp_path, monkeypatch, db):
    chamadas: list[str] = []
    (tmp_path / "p1" / "cortes" / "c1").mkdir(parents=True)
    monkeypatch.setattr(corte_service, "projetos_dir", lambda: tmp_path)
    monkeypatch.setattr(corte_service.shutil, "rmtree", _espiao(chamadas, "rmtree"))
    db.get = AsyncMock(return_value=MagicMock(projeto_id="p1"))
    # __aexit__ que devolve algo verdadeiro engoliria a exceção do bloco.
    db.begin = MagicMock(
        return_value=MagicMock(__aenter__=AsyncMock(), __aexit__=AsyncMock(return_value=False))
    )
    monkeypatch.setattr(
        corte_service,
        "AsyncSessionLocal",
        lambda: MagicMock(
            __aenter__=AsyncMock(return_value=db), __aexit__=AsyncMock(return_value=False)
        ),
    )

    await cortes.deletar_corte("c1")
    assert chamadas == ["rmtree"]


@pytest.mark.asyncio
async def test_limpeza_pos_sincronizacao_apaga_fora_do_loop(tmp_path, monkeypatch):
    """Aqui o disco é de verdade: só o veredito da thread vem do dublê."""
    chamadas: list[str] = []
    (tmp_path / "clip_filtered.mp4").write_text("fica")
    (tmp_path / "clip_raw.mkv").write_text("sai")
    (tmp_path / "graded").mkdir()

    def apagar(entry: Path) -> None:
        assert threading.current_thread() is not threading.main_thread(), (
            "a limpeza da pasta do corte voltou para o event loop"
        )
        chamadas.append(entry.name)
        shutil.rmtree(entry) if entry.is_dir() else entry.unlink()

    monkeypatch.setattr(finalizacao_do_corte, "_apagar_do_disco", apagar)

    await finalizacao_do_corte._limpar_pasta_corte_pos_sync(tmp_path)

    assert sorted(chamadas) == ["clip_raw.mkv", "graded"]
    assert (tmp_path / "clip_filtered.mp4").exists(), "o clipe final não pode ser apagado"


@pytest.mark.asyncio
async def test_o_app_continua_respondendo_enquanto_o_disco_apaga(tmp_path, monkeypatch, db):
    """A prova que interessa ao operador: a tela ao lado não congela.

    Um "batimento" corre no event loop enquanto a faxina demora. Se a faxina
    voltasse para o loop, o batimento pararia — e o app com ele.
    """
    import asyncio
    import time

    (tmp_path / "p1").mkdir()
    monkeypatch.setattr(projeto_service, "projetos_dir", lambda: tmp_path)
    monkeypatch.setattr(projeto_service.shutil, "rmtree", lambda *a, **kw: time.sleep(0.3))

    batimentos = 0

    async def bater():
        nonlocal batimentos
        while True:
            await asyncio.sleep(0.01)
            batimentos += 1

    pulso = asyncio.create_task(bater())
    await projeto_service.ProjetoService.deletar_projeto("p1", db)
    pulso.cancel()

    assert batimentos >= 10, f"o loop ficou preso: só {batimentos} batimentos em 0,3s"
