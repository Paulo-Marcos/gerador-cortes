"""Rodada 2 da auditoria da D-1130: guarda de caminho provada, luz à prova de capa quebrada.

Pedido → teste:
- miniatura de 64 px, até 4 KB, croma 4:4:4 → test_miniatura_*
- a rota responde com CORS para o front → test_rota_da_miniatura_responde_com_cors
- `luz` vazia sem capa → test_luz_vazia_sem_capa / test_canais_trazem_luz_vazia_sem_capa
- duas cores com capa → test_luz_com_capa_tem_duas_cores / test_canais_trazem_a_luz_das_capas
"""

from __future__ import annotations

import io
from pathlib import Path

from app.infrastructure.imagem.miniatura import (
    LARGURA_DA_MINIATURA,
    miniatura_jpeg,
)
from app.main import app
from app.services.canal import luz_do_canal as servico
from fastapi.testclient import TestClient
from PIL import Image, ImageDraw


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


def test_rota_da_miniatura_recusa_arquivo_inexistente(tmp_path, monkeypatch):
    (tmp_path / "p1").mkdir()
    monkeypatch.setattr("app.routers.miniaturas.projetos_dir", lambda: tmp_path)
    assert TestClient(app).get("/miniaturas/p1/nao-existe.png").status_code == 404


def test_rota_da_miniatura_recusa_arquivo_real_fora_da_pasta_do_projeto(tmp_path, monkeypatch):
    # O arquivo EXISTE: só a guarda de caminho (403) o separa de uma resposta 200.
    _capa(tmp_path / "segredo.png")
    (tmp_path / "p1").mkdir()
    monkeypatch.setattr("app.routers.miniaturas.projetos_dir", lambda: tmp_path)
    cliente = TestClient(app)
    assert cliente.get("/miniaturas/p1/..%2Fsegredo.png").status_code == 403
    assert cliente.get("/miniaturas/../segredo.png").status_code in (403, 404)
    assert cliente.get("/miniaturas/p1/thumbnails%2F..%2F..%2Fsegredo.png").status_code == 403


def test_miniatura_de_imagem_muito_comprida_tem_altura_limitada(tmp_path):
    comprida = tmp_path / "comprida.png"
    Image.new("RGB", (4, 4000), (200, 30, 30)).save(comprida)
    img = Image.open(io.BytesIO(miniatura_jpeg(comprida)))
    assert img.width == LARGURA_DA_MINIATURA and img.height <= 144


def test_luz_ignora_so_arte_e_capa_quebrada(tmp_path):
    pasta = tmp_path / "p1" / "thumbnails"
    _capa(pasta / "thumb_a_arte.png", (0, 255, 0), (0, 255, 0))
    pasta.joinpath("thumb_b.png").write_bytes(b"isto nao e uma imagem")
    assert servico.luz_da_pasta(tmp_path) == []  # nada vazou nem derrubou


def test_luz_do_canal_fica_em_cache_por_alguns_minutos(tmp_path, monkeypatch):
    monkeypatch.setattr("app.services.canal.luz_do_canal.instance_root", lambda: tmp_path)
    servico._cache.clear()
    pasta = tmp_path / "channels" / "c9" / "projetos" / "p1" / "thumbnails"
    assert servico.luz_do_canal("c9") == []
    _capa(pasta / "thumb_a.png")
    assert servico.luz_do_canal("c9") == []  # ainda do cache
    servico._cache.clear()
    assert len(servico.luz_do_canal("c9")) == 2
