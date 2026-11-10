"""D-1093 (P9): o silêncio do app decidido de uma vez, e o silêncio riscado que fica riscado.

A salvaguarda do bruto procura os silêncios de novo a cada geração
(`detectar_silencios_tecnico(limpar_anteriores=True)`). Antes desta demanda ela lia só
os trechos do corte: o silêncio riscado voltava no bruto seguinte e ficava nas duas
listas. O FFmpeg é trocado por uma saída fixa; o banco é em memória.
"""

from __future__ import annotations

import json
import sys

import pytest
import pytest_asyncio
from app import database
from app.domain.corte.silencios import manter_silencios, silencios_a_gravar, tirar_silencios
from app.models import Base, Corte, Projeto, StatusCorte
from app.routers import riscados as rota_riscados
from app.routers.errors import registrar_tratadores
from app.services.corte import CorteService
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

# Dois silêncios no áudio: 10 → 12 s e 30 → 33 s (o detector tira 0,1 s de cada borda).
_SAIDA_DO_FFMPEG = (
    "silence_start: 10.0\nsilence_end: 12.0\nsilence_start: 30.0\nsilence_end: 33.0\n"
)
_MOTIVO = "Silêncio Detectado (IA/Técnico)"


def _silencio(inicio: float, fim: float) -> dict:
    return {
        "inicio_hms": f"00:00:{inicio:06.3f}",
        "fim_hms": f"00:00:{fim:06.3f}",
        "inicio_seg": inicio,
        "fim_seg": fim,
        "motivo": _MOTIVO,
        "origem": "tecnico",
        "categoria": "silencio",
    }


_MANUAL = {
    "inicio_hms": "00:00:45.000",
    "fim_hms": "00:00:47.000",
    "inicio_seg": 45.0,
    "fim_seg": 47.0,
    "motivo": "marcada à mão",
    "origem": "manual",
}


@pytest_asyncio.fixture
async def fabrica(monkeypatch):
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    f = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    original = database.AsyncSessionLocal
    for modulo in list(sys.modules.values()):
        if getattr(modulo, "AsyncSessionLocal", None) is original:
            monkeypatch.setattr(modulo, "AsyncSessionLocal", f)
    async with f() as db:
        db.add(Projeto(id="p1", youtube_url="u", arquivo_video_path="video.mkv"))
        db.add(
            Corte(
                id="c1",
                projeto_id="p1",
                numero=1,
                inicio_hms="00:00:00",
                fim_hms="00:01:00",
                inicio_seg=0.0,
                fim_seg=60.0,
                desvios="[]",
                status=StatusCorte.PROPOSTO,
            )
        )
        await db.commit()
    yield f
    await engine.dispose()


@pytest.fixture
def ffmpeg_fixo(monkeypatch):
    """O silencedetect devolve sempre os dois silêncios; a sincronia não roda."""

    async def silencedetect(*_a, **_k):
        return type("R", (), {"stderr": _SAIDA_DO_FFMPEG, "returncode": 0})()

    async def proxy(*_a, **_k):
        return "inexistente.flac"

    async def sem_sincronia(_corte_id, db=None):
        return None

    monkeypatch.setattr("app.infrastructure.ffmpeg_runner.run_ffmpeg_simple", silencedetect)
    monkeypatch.setattr("app.services.media_proxy.MediaProxyService.gerar_audio_proxy", proxy)
    monkeypatch.setattr("app.services.media_proxy.MediaProxyService.contexto_seg", lambda: (0, 0))
    monkeypatch.setattr("app.core.channel_paths.resolver_do_projeto", lambda *_a, **_k: "v.mkv")
    monkeypatch.setattr(CorteService, "sincronizar_transcricao_corte", staticmethod(sem_sincronia))


async def _gravar(fabrica, desvios: list[dict], riscados: list[dict]) -> None:
    async with fabrica() as db:
        corte = await db.get(Corte, "c1")
        corte.desvios = json.dumps(desvios)
        corte.desvios_riscados = json.dumps(riscados)
        await db.commit()


async def _ler(fabrica) -> tuple[list[dict], list[dict]]:
    async with fabrica() as db:
        corte = await db.get(Corte, "c1")
        return json.loads(corte.desvios or "[]"), json.loads(corte.desvios_riscados or "[]")


def _inicios(marcas: list[dict]) -> list[float]:
    return [round(float(m["inicio_seg"]), 1) for m in marcas]


@pytest.mark.asyncio
async def test_a_salvaguarda_nao_recoloca_o_silencio_riscado(fabrica, ffmpeg_fixo):
    """O defeito: riscar o silêncio de 10 s e regerar o bruto o trazia de volta."""
    await _gravar(fabrica, [_silencio(30.1, 32.9)], [_silencio(10.1, 11.9)])

    await CorteService.detectar_silencios_tecnico("c1", limpar_anteriores=True)

    desvios, riscados = await _ler(fabrica)
    assert _inicios(desvios) == [30.1], "o silêncio riscado voltou ao corte"
    assert _inicios(riscados) == [10.1], "não fica duplicado nas duas listas"


@pytest.mark.asyncio
async def test_a_salvaguarda_continua_trazendo_o_silencio_nao_riscado(fabrica, ffmpeg_fixo):
    await _gravar(fabrica, [_MANUAL], [])

    await CorteService.detectar_silencios_tecnico("c1", limpar_anteriores=True)

    desvios, riscados = await _ler(fabrica)
    assert _inicios(desvios) == [10.1, 30.1, 45.0]
    assert riscados == []


@pytest.mark.asyncio
async def test_o_trecho_manual_riscado_nao_segura_o_silencio(fabrica, ffmpeg_fixo):
    """Só o silêncio riscado conta: um trecho seu riscado no mesmo ponto é outra marca."""
    manual_no_silencio = {**_MANUAL, "inicio_seg": 10.0, "fim_seg": 11.0}
    await _gravar(fabrica, [], [manual_no_silencio])

    await CorteService.detectar_silencios_tecnico("c1", limpar_anteriores=True)

    desvios, _ = await _ler(fabrica)
    assert _inicios(desvios) == [10.1, 30.1]


@pytest.fixture
def cliente(fabrica, ffmpeg_fixo):
    app = FastAPI()
    registrar_tratadores(app)
    app.include_router(rota_riscados.router, prefix="/api/cortes")
    return TestClient(app)


@pytest.mark.asyncio
async def test_manter_todos_risca_os_silencios_e_deixa_o_resto(fabrica, cliente):
    await _gravar(fabrica, [_silencio(10.1, 11.9), _MANUAL, _silencio(30.1, 32.9)], [])

    resposta = cliente.post("/api/cortes/c1/manter-silencios")

    assert resposta.status_code == 200, resposta.text
    desvios, riscados = await _ler(fabrica)
    assert _inicios(desvios) == [45.0]
    assert _inicios(riscados) == [10.1, 30.1]
    assert _inicios(resposta.json()["desvios_riscados"]) == [10.1, 30.1]


@pytest.mark.asyncio
async def test_tirar_todos_devolve_os_silencios_riscados(fabrica, cliente):
    await _gravar(fabrica, [_MANUAL], [_silencio(10.1, 11.9), _silencio(30.1, 32.9)])

    resposta = cliente.post("/api/cortes/c1/tirar-silencios")

    assert resposta.status_code == 200, resposta.text
    desvios, riscados = await _ler(fabrica)
    assert _inicios(desvios) == [10.1, 30.1, 45.0]
    assert riscados == []


@pytest.mark.asyncio
async def test_manter_todos_sobrevive_ao_bruto_seguinte(fabrica, cliente):
    """A decisão vale no vídeo: depois do Manter todos, a salvaguarda não traz nenhum."""
    await _gravar(fabrica, [_silencio(10.1, 11.9), _silencio(30.1, 32.9)], [])
    assert cliente.post("/api/cortes/c1/manter-silencios").status_code == 200

    await CorteService.detectar_silencios_tecnico("c1", limpar_anteriores=True)

    desvios, riscados = await _ler(fabrica)
    assert desvios == []
    assert _inicios(riscados) == [10.1, 30.1]


@pytest.mark.asyncio
async def test_rota_de_corte_que_nao_existe_e_404(cliente):
    assert cliente.post("/api/cortes/nao-existe/manter-silencios").status_code == 404
    assert cliente.post("/api/cortes/nao-existe/tirar-silencios").status_code == 404


@pytest.mark.asyncio
async def test_a_deteccao_de_corte_que_nao_existe_falha_logo(fabrica, ffmpeg_fixo):
    """O corte lido é garantido (o riscado é lido dele): sem corte, NoResultFound."""
    from sqlalchemy.exc import NoResultFound

    with pytest.raises(NoResultFound):
        await CorteService.detectar_silencios_tecnico("nao-existe", limpar_anteriores=True)


# ── domínio ──


def test_silencios_a_gravar_deduplica_a_meio_segundo_contra_o_corte_e_a_propria_leva():
    novos = [_silencio(10.0, 11.0), _silencio(10.3, 11.0), _silencio(20.0, 21.0)]
    existentes = [{**_MANUAL, "inicio_seg": 19.6}]

    assert _inicios(silencios_a_gravar(novos, existentes, [])) == [10.0]


def test_silencios_a_gravar_pula_o_silencio_riscado_a_meio_segundo():
    novos = [_silencio(10.0, 11.0), _silencio(20.0, 21.0)]

    assert _inicios(silencios_a_gravar(novos, [], [_silencio(10.4, 11.0)])) == [20.0]
    assert _inicios(silencios_a_gravar(novos, [], [_silencio(10.6, 11.0)])) == [10.0, 20.0]


def test_tirar_silencios_nao_duplica_o_que_ja_esta_no_corte():
    desvios, riscados = tirar_silencios([_silencio(10.1, 11.9)], [_silencio(10.1, 11.9), _MANUAL])

    assert _inicios(desvios) == [10.1]
    assert riscados == [_MANUAL]


def test_manter_silencios_sem_silencio_nao_muda_nada():
    assert manter_silencios([_MANUAL], []) == ([_MANUAL], [])
