"""D-962: as fotos do apresentador salvas no canal vão em toda capa, junto dos quadros.

Os quadros da live dão o momento; as fotos do banco, o rosto bem iluminado e de
vários ângulos. Antes os quadros entravam NO LUGAR das fotos, e a identidade
dependia de três quadros de webcam.
"""

from __future__ import annotations

import asyncio
from pathlib import Path
from types import SimpleNamespace

import pytest
from app.core import channel_paths
from app.services import capa_no_chatgpt
from app.services.canal import capa_do_canal

PROJETO = "https://chatgpt.com/g/g-p-6aa2f1d08414819192ac821e77ded48e/project"
PNG = bytes.fromhex("89504e470d0a1a0a") + b"resto-da-imagem"
PROMPT = '[APRESENTADOR="grade"]\nEXPRESSION (host): both eyebrows arched high.'


@pytest.fixture
def robo(monkeypatch, tmp_path):
    raiz = tmp_path / "channels" / "meucanal"
    monkeypatch.setattr(channel_paths, "active_channel_root", lambda: raiz)
    monkeypatch.setattr(channel_paths, "settings_db_path", lambda: tmp_path / "settings.db")
    monkeypatch.setattr(
        channel_paths, "fotos_do_apresentador_dir", lambda: raiz / "assets" / "apresentador"
    )
    for modulo in (capa_do_canal, capa_no_chatgpt):
        monkeypatch.setattr(modulo, "identidade_do_mascote", lambda: SimpleNamespace(nome="Sapo"))
    capa_no_chatgpt.gravar_projeto(PROJETO)
    capa_do_canal.salvar_foto("grade.png", PNG)
    capa_do_canal.gravar_estilo("apresentador", 95, 40)
    chamadas: list[tuple[str, list[Path]]] = []

    def gerar(_projeto, pedido, anexos, _anunciar):
        chamadas.append((pedido, anexos))
        return PNG

    monkeypatch.setattr(capa_no_chatgpt, "_gerar_no_navegador", gerar)
    return chamadas


def test_quadros_e_fotos_do_banco_vao_juntos(robo, tmp_path):
    quadro = tmp_path / "quadro-da-live-1.jpg"
    quadro.write_bytes(b"jpg")

    asyncio.run(
        capa_no_chatgpt.gerar_imagem_com_quadros(PROMPT, "16:9", [], lambda _e: None, [quadro])
    )

    pedido, anexos = robo[0]
    assert [a.name for a in anexos] == ["quadro-da-live-1.jpg", "grade.png"]
    assert "grade.png" in pedido
    assert "EXPRESSION (host): both eyebrows arched high." not in pedido
