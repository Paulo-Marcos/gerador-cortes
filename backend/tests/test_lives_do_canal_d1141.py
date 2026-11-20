"""Contagem de lives por canal no payload de /api/channels (D-1141, E-069 §7.9).

Pedido → teste:
- contagem certa com 0, 1 e N lives → test_conta_zero_uma_e_varias_lives
- canal sem banco (ou banco sem a tabela / ilegível) → test_canal_sem_banco_conta_zero,
  test_banco_sem_a_tabela_conta_zero, test_banco_ilegivel_conta_zero
- contar não cria banco onde não há → test_contar_nao_cria_banco
- o payload da lista traz `lives` de cada canal → test_lista_de_canais_traz_as_lives
- a leitura do banco sai do event loop (to_thread) → test_a_leitura_vai_para_uma_thread
"""

from __future__ import annotations

import sqlite3
from pathlib import Path

from app.services.canal import lives_do_canal as servico


def _banco(projetos: Path, lives: int, tabela: str = "projetos") -> None:
    projetos.mkdir(parents=True, exist_ok=True)
    con = sqlite3.connect(projetos / "projetos.db")
    con.execute(f"CREATE TABLE {tabela} (id TEXT PRIMARY KEY)")
    con.executemany(f"INSERT INTO {tabela} VALUES (?)", [(f"p{i}",) for i in range(lives)])
    con.commit()
    con.close()


def test_conta_zero_uma_e_varias_lives(tmp_path):
    for n in (0, 1, 7):
        _banco(tmp_path / f"c{n}", n)
        assert servico.lives_da_pasta(tmp_path / f"c{n}") == n


def test_canal_sem_banco_conta_zero(tmp_path):
    assert servico.lives_da_pasta(tmp_path / "nao-existe") == 0


def test_contar_nao_cria_banco(tmp_path):
    (tmp_path / "vazio").mkdir()
    servico.lives_da_pasta(tmp_path / "vazio")
    assert not (tmp_path / "vazio" / "projetos.db").exists()


def test_banco_sem_a_tabela_conta_zero(tmp_path):
    _banco(tmp_path, 3, tabela="outra")
    assert servico.lives_da_pasta(tmp_path) == 0


def test_banco_ilegivel_conta_zero(tmp_path):
    (tmp_path / "projetos.db").write_bytes(b"isto nao e um sqlite" * 50)
    assert servico.lives_da_pasta(tmp_path) == 0


def test_lista_de_canais_traz_as_lives(tmp_path, monkeypatch):
    from app.main import app
    from fastapi.testclient import TestClient

    _banco(tmp_path / "channels" / "a" / "projetos", 2)
    _banco(tmp_path / "channels" / "b" / "projetos", 0)
    (tmp_path / "channels" / "c").mkdir(parents=True)  # sem banco
    monkeypatch.setattr("app.services.canal.lives_do_canal.instance_root", lambda: tmp_path)
    monkeypatch.setattr("app.services.canal.luz_do_canal.instance_root", lambda: tmp_path)

    from app.domain.canal.identidade import Canal, Paleta
    from app.services import channels as channels_service

    def _canal(i: str, ativo: bool) -> Canal:
        return Canal(id=i, handle=f"@{i}", nome=i, credito="", paleta=Paleta(), ativo=ativo)

    monkeypatch.setattr(
        channels_service,
        "listar_canais",
        lambda *a, **k: [_canal("a", True), _canal("b", False), _canal("c", False)],
    )
    r = TestClient(app).get("/api/channels")
    assert r.status_code == 200
    assert {c["id"]: c["lives"] for c in r.json()["canais"]} == {"a": 2, "b": 0, "c": 0}


def test_a_leitura_vai_para_uma_thread(tmp_path, monkeypatch):
    """SQLite é síncrono: a rota não pode contar no event loop (D-1136)."""
    import asyncio

    from app.domain.canal.identidade import Canal, Paleta
    from app.main import app
    from app.services import channels as channels_service
    from app.services.canal import ficha_do_canal as ficha
    from fastapi.testclient import TestClient

    chamadas: list[object] = []
    real = asyncio.to_thread

    async def espia(fn, *a, **k):
        chamadas.append(fn)
        return await real(fn, *a, **k)

    monkeypatch.setattr("app.routers.channels.asyncio.to_thread", espia)
    monkeypatch.setattr("app.services.canal.lives_do_canal.instance_root", lambda: tmp_path)
    monkeypatch.setattr("app.services.canal.luz_do_canal.instance_root", lambda: tmp_path)
    canal = Canal(id="a", handle="@a", nome="a", credito="", paleta=Paleta(), ativo=True)
    monkeypatch.setattr(channels_service, "listar_canais", lambda *a, **k: [canal])
    assert TestClient(app).get("/api/channels").status_code == 200
    assert ficha.ficha_do_canal in chamadas
