"""Miniatura de 64 px da capa e luz do canal (D-1130, E-069 B-3).

Pedido → teste:
- miniatura de 64 px, até 4 KB, croma 4:4:4 → test_miniatura_*
- a rota responde com CORS para o front → test_rota_da_miniatura_responde_com_cors
- `luz` vazia sem capa → test_luz_vazia_sem_capa / test_canais_trazem_luz_vazia_sem_capa
- duas cores com capa → test_luz_com_capa_tem_duas_cores / test_canais_trazem_a_luz_das_capas
"""

from __future__ import annotations

import io
from pathlib import Path

import pytest
from app.domain.canal.luz_do_canal import luz_das_amostras
from app.infrastructure.imagem.miniatura import (
    LARGURA_DA_MINIATURA,
    LIMITE_DA_MINIATURA_BYTES,
    miniatura_jpeg,
)
from app.main import app
from app.services.canal import luz_do_canal as servico
from fastapi.testclient import TestClient
from PIL import Image, ImageDraw, JpegImagePlugin


def _capa(caminho: Path, esquerda=(255, 40, 40), direita=(40, 80, 255)) -> Path:
    """Capa 1672x941 com duas metades vivas, ruído e um texto amarelo."""
    img = Image.new("RGB", (1672, 941), esquerda)
    d = ImageDraw.Draw(img)
    d.rectangle((836, 0, 1672, 941), fill=direita)
    for i in range(0, 1672, 7):
        d.line((i, 0, 1672 - i, 941), fill=(i % 255, 200, (i * 3) % 255), width=2)
    caminho.parent.mkdir(parents=True, exist_ok=True)
    img.save(caminho)
    return caminho


def test_miniatura_tem_64px_ate_4kb_e_croma_444(tmp_path):
    capa = _capa(tmp_path / "thumb_a.png")
    dados = miniatura_jpeg(capa)
    assert len(dados) <= LIMITE_DA_MINIATURA_BYTES
    img = Image.open(io.BytesIO(dados))
    assert img.width == LARGURA_DA_MINIATURA
    assert img.height == 36  # 16:9 mantém a proporção
    # 4:4:4 = croma com a amostragem do brilho (o padrão 4:2:0 do PIL perde cor).
    assert JpegImagePlugin.get_sampling(img) == 0


def test_rota_da_miniatura_responde_com_cors(tmp_path, monkeypatch):
    _capa(tmp_path / "p1" / "thumbnails" / "thumb_a.png")
    monkeypatch.setattr("app.routers.miniaturas.projetos_dir", lambda: tmp_path)
    cliente = TestClient(app)
    r = cliente.get(
        "/miniaturas/p1/thumbnails/thumb_a.png",
        headers={"Origin": "http://localhost:4300"},
    )
    assert r.status_code == 200
    assert r.headers["content-type"] == "image/jpeg"
    assert len(r.content) <= LIMITE_DA_MINIATURA_BYTES
    assert r.headers["access-control-allow-origin"] == "http://localhost:4300"


def test_rota_da_miniatura_recusa_fuga_de_pasta_e_arquivo_inexistente(tmp_path, monkeypatch):
    (tmp_path / "p1").mkdir()
    monkeypatch.setattr("app.routers.miniaturas.projetos_dir", lambda: tmp_path)
    cliente = TestClient(app)
    assert cliente.get("/miniaturas/p1/nao-existe.png").status_code == 404
    assert cliente.get("/miniaturas/p1/..%2F..%2Fsegredo.png").status_code in (403, 404)


def test_luz_das_amostras_cinza_nao_tem_luz():
    assert luz_das_amostras([(30, 30, 30)] * 10 + [(200, 200, 200)] * 10) == []


def test_luz_das_amostras_traz_as_duas_cores_mais_vivas():
    pixels = [(255, 40, 40)] * 50 + [(40, 80, 255)] * 30 + [(0, 0, 0)] * 100
    assert luz_das_amostras(pixels) == ["#ff2828", "#2850ff"]


def test_luz_de_capa_de_uma_cor_so_vira_par_claro_e_escuro():
    pixels = [(255, 40, 40)] * 20 + [(150, 30, 30)] * 20
    luz = luz_das_amostras(pixels)
    assert len(luz) == 2 and luz[0] != luz[1]


def test_luz_vazia_sem_capa(tmp_path):
    assert servico.luz_da_pasta(tmp_path / "nao-existe") == []
    assert servico.luz_da_pasta(tmp_path) == []


def test_luz_com_capa_tem_duas_cores(tmp_path):
    _capa(tmp_path / "p1" / "thumbnails" / "thumb_a.png")
    # a arte sem texto não entra na amostra
    _capa(tmp_path / "p1" / "thumbnails" / "thumb_a_arte.png", (0, 255, 0), (0, 255, 0))
    luz = servico.luz_da_pasta(tmp_path)
    assert len(luz) == 2
    assert all(c.startswith("#") and len(c) == 7 for c in luz)
    assert "#00ff00" not in luz


@pytest.fixture
def canais_falsos(monkeypatch):
    from app.domain.canal.identidade import Canal, Paleta

    canal = Canal(id="c1", handle="@c", nome="C", credito="", paleta=Paleta(), ativo=True)
    monkeypatch.setattr("app.routers.channels.channels_service.listar_canais", lambda: [canal])
    servico._cache.clear()
    return canal


def test_canais_trazem_luz_vazia_sem_capa(canais_falsos, tmp_path, monkeypatch):
    monkeypatch.setattr("app.services.canal.luz_do_canal.instance_root", lambda: tmp_path)
    r = TestClient(app).get("/api/channels")
    assert r.status_code == 200
    assert r.json()["canais"][0]["luz"] == []


def test_canais_trazem_a_luz_das_capas(canais_falsos, tmp_path, monkeypatch):
    monkeypatch.setattr("app.services.canal.luz_do_canal.instance_root", lambda: tmp_path)
    _capa(tmp_path / "channels" / "c1" / "projetos" / "p1" / "thumbnails" / "thumb_a.png")
    r = TestClient(app).get("/api/channels")
    assert len(r.json()["canais"][0]["luz"]) == 2
