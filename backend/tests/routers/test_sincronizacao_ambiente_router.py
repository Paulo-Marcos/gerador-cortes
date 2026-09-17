"""GET /api/sincronizacao/ambiente (D-627)."""

from app.domain.video_encoder import VideoEncoder
from app.routers import sincronizacao
from app.services import ambiente
from fastapi import FastAPI
from fastapi.testclient import TestClient


def test_endpoint_devolve_veredito_e_esconde_como_resolver_do_que_esta_ok(monkeypatch):
    base = ambiente.Sondas(
        achar_binario=lambda nome: None if nome == "ffprobe" else "x",
        existe=lambda _c: True,
        encoder=lambda: VideoEncoder.QSV,
        claude_cli=lambda: "x",
        agy_cli=lambda: "x",
        chrome=lambda: None,
        client_secrets=lambda: ambiente._RAIZ / "client_secrets.json",
        tem_chave_gemini=lambda: True,
    )
    monkeypatch.setattr(ambiente, "sondas_da_maquina", lambda: base)
    app = FastAPI()
    app.include_router(sincronizacao.router, prefix="/api/sincronizacao")

    corpo = TestClient(app).get("/api/sincronizacao/ambiente").json()

    assert corpo["pronto"] is False
    itens = {i["id"]: i for i in corpo["itens"]}
    assert itens["ffprobe"]["estado"] == "erro" and itens["ffprobe"]["como_resolver"]
    assert itens["ffmpeg"]["estado"] == "ok" and itens["ffmpeg"]["como_resolver"] == ""
    assert itens["chrome"]["estado"] == "aviso"
