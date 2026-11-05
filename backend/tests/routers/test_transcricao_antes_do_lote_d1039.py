"""A transcrição do projeto é gravada antes do lote que a copia para os cortes (D-1039).

O projeto é a fonte e os cortes são as cópias. As rotas deixavam a fonte pendente
na sessão do lote; o primeiro `rollback` (corte com erro ou "database is locked")
a descartava, e os cortes seguintes gravavam um texto que o projeto não tinha. O
mesmo `rollback` expirava o `projeto`, e ler o offset dele na resposta estourava
`MissingGreenlet`.

Pela porta HTTP, com banco em arquivo: `rollback` e sessões são os de verdade.
"""

from __future__ import annotations

import json
import sys

import httpx
import pytest
import pytest_asyncio
from app import database
from app.database import get_db
from app.models import Base, Corte, Projeto
from app.routers import projetos as rota_projetos
from app.routers.errors import registrar_tratadores
from app.services import corte as corte_module
from app.services.ingestao import IngestaoService
from fastapi import FastAPI
from sqlalchemy.exc import OperationalError
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine


def _falas(palavra: str) -> list[dict]:
    return [
        {"inicio": float(i), "fim": float(i) + 1.0, "texto": f"{palavra}{i}"} for i in range(200)
    ]


# Os módulos onde as rotas leem a pasta dos projetos.
_PROJETOS_DIR_LIDO_EM = ["app.routers.projetos", "app.services.projeto", "app.services.ingestao"]


@pytest_asyncio.fixture
async def fabrica(tmp_path, monkeypatch):
    async def sem_espera(_segundos):
        return None

    monkeypatch.setattr(corte_module.asyncio, "sleep", sem_espera)
    engine = create_async_engine(f"sqlite+aiosqlite:///{(tmp_path / 'p.db').as_posix()}")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    f = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    original = database.AsyncSessionLocal
    for modulo in list(sys.modules.values()):
        if getattr(modulo, "AsyncSessionLocal", None) is original:
            monkeypatch.setattr(modulo, "AsyncSessionLocal", f)
    async with f() as db:
        db.add(
            Projeto(
                id="p1",
                youtube_url="https://youtu.be/p1",
                titulo_live="Live",
                arquivo_video_path="video.mkv",
                legenda_offset_ms=0,
                transcricao_raw=json.dumps(_falas("velho")),
            )
        )
        for i in range(3):
            db.add(
                Corte(
                    id=f"c{i}",
                    projeto_id="p1",
                    numero=i + 1,
                    titulo_proposto=f"Corte {i}",
                    inicio_hms="00:00:10",
                    fim_hms="00:01:00",
                    inicio_seg=10.0 + i,
                    fim_seg=60.0 + i,
                    transcricao_final_texto="velho",
                )
            )
        await db.commit()
    yield f
    await engine.dispose()


@pytest_asyncio.fixture
async def cliente(fabrica, monkeypatch, tmp_path):
    (tmp_path / "p1").mkdir()
    for modulo in _PROJETOS_DIR_LIDO_EM:
        monkeypatch.setattr(f"{modulo}.projetos_dir", lambda: tmp_path)

    async def extrair_legenda(_projeto_id, _url, _video="", legenda_offset_ms=0):
        return _falas("novo")

    monkeypatch.setattr(IngestaoService, "_extrair_legenda", staticmethod(extrair_legenda))

    async def sessao():
        # Igual ao `get_db` do app: commit no fim, rollback se a rota levantar.
        async with fabrica() as db:
            try:
                yield db
                await db.commit()
            except Exception:
                await db.rollback()
                raise

    app = FastAPI()
    app.include_router(rota_projetos.router, prefix="/api/projetos")
    app.dependency_overrides[get_db] = sessao
    registrar_tratadores(app)
    # Erro sem tratador vira 500, como o operador o recebe.
    transporte = httpx.ASGITransport(app=app, raise_app_exceptions=False)
    async with httpx.AsyncClient(transport=transporte, base_url="http://teste") as c:
        yield c


async def _invalidar_o_primeiro_corte(fabrica) -> None:
    async with fabrica() as db:
        (await db.get(Corte, "c0")).desvios = "isto não é json"
        await db.commit()


def _falhar_a_gravacao_do_corte(monkeypatch, numero: int, mensagem: str) -> None:
    """Faz falhar uma vez o commit da `numero`-ésima gravação de corte."""
    commit_real = AsyncSession.commit
    contagem = {"gravacoes": 0}

    async def commit(self):
        if any(isinstance(o, Corte) for o in self.sync_session.dirty):
            contagem["gravacoes"] += 1
            if contagem["gravacoes"] == numero:
                raise OperationalError("COMMIT", {}, Exception(mensagem))
        await commit_real(self)

    monkeypatch.setattr(AsyncSession, "commit", commit)


async def _primeira_fala_do_projeto(fabrica) -> str:
    async with fabrica() as db:
        return json.loads((await db.get(Projeto, "p1")).transcricao_raw)[0]["texto"]


async def _offset_do_projeto(fabrica) -> int:
    async with fabrica() as db:
        return (await db.get(Projeto, "p1")).legenda_offset_ms


async def _texto_dos_cortes(fabrica) -> dict[str, str]:
    async with fabrica() as db:
        return {f"c{i}": (await db.get(Corte, f"c{i}")).transcricao_final_texto for i in range(3)}


def _sincronizados(textos: dict[str, str]) -> list[str]:
    """Os cortes que receberam o texto novo (nenhuma palavra do velho restou)."""
    return sorted(c for c, texto in textos.items() if "novo" in texto and "velho" not in texto)


def _patch_transcricao(c: httpx.AsyncClient):
    return c.patch("/api/projetos/p1/transcricao", json={"transcricao": _falas("novo")})


def _put_sincronia(c: httpx.AsyncClient):
    return c.put("/api/projetos/p1/sincronia-legenda", json={"offset_segundos": 1.5})


def _post_refazer(c: httpx.AsyncClient):
    return c.post("/api/projetos/p1/refazer-transcricao")


# ─── Corte que falha de vez: o projeto fica com o texto que os outros cortes receberam ──


@pytest.mark.asyncio
@pytest.mark.parametrize("rota", [_patch_transcricao, _put_sincronia, _post_refazer])
async def test_primeiro_corte_invalido_nao_separa_o_projeto_dos_cortes(cliente, fabrica, rota):
    await _invalidar_o_primeiro_corte(fabrica)

    resposta = await rota(cliente)

    assert resposta.status_code == 500, "a falha não pode passar por sucesso"
    assert await _primeira_fala_do_projeto(fabrica) == "novo0"
    textos = await _texto_dos_cortes(fabrica)
    assert _sincronizados(textos) == ["c1", "c2"], "um corte com falha não derruba os outros"
    assert textos["c0"] == "velho", "o corte que falhou fica como estava"


@pytest.mark.asyncio
async def test_sincronia_com_corte_invalido_grava_o_offset_e_explica_o_erro(cliente, fabrica):
    await _invalidar_o_primeiro_corte(fabrica)

    resposta = await _put_sincronia(cliente)

    assert resposta.json()["detail"].startswith("Erro ao reprocessar legenda:")
    assert await _offset_do_projeto(fabrica) == 1500


@pytest.mark.asyncio
async def test_tentar_de_novo_com_o_corte_corrigido_sincroniza_todos(cliente, fabrica):
    await _invalidar_o_primeiro_corte(fabrica)
    await _patch_transcricao(cliente)
    async with fabrica() as db:
        (await db.get(Corte, "c0")).desvios = "[]"
        await db.commit()

    resposta = await _patch_transcricao(cliente)

    assert resposta.status_code == 200
    assert resposta.json()["total_cortes_sincronizados"] == 3
    assert _sincronizados(await _texto_dos_cortes(fabrica)) == ["c0", "c1", "c2"]


# ─── "database is locked" no lote: o retry não perde nada e a resposta é a certa ──


@pytest.mark.asyncio
@pytest.mark.parametrize("gravacao", [1, 2])
async def test_lock_no_lote_da_transcricao_mantem_o_projeto(
    cliente, fabrica, monkeypatch, gravacao
):
    _falhar_a_gravacao_do_corte(monkeypatch, gravacao, "database is locked")

    resposta = await _patch_transcricao(cliente)

    assert resposta.status_code == 200
    assert resposta.json()["total_cortes_sincronizados"] == 3
    assert await _primeira_fala_do_projeto(fabrica) == "novo0"
    assert _sincronizados(await _texto_dos_cortes(fabrica)) == ["c0", "c1", "c2"]


@pytest.mark.asyncio
@pytest.mark.parametrize("gravacao", [1, 2])
async def test_lock_no_lote_da_sincronia_responde_o_offset_gravado(
    cliente, fabrica, monkeypatch, gravacao
):
    _falhar_a_gravacao_do_corte(monkeypatch, gravacao, "database is locked")

    resposta = await _put_sincronia(cliente)

    assert resposta.status_code == 200, resposta.text
    assert resposta.json() == {
        "message": "Sincronia atualizada e transcrição reprocessada para todo o projeto",
        "offset_ms": 1500,
        "cortes_sincronizados": 3,
    }
    assert await _offset_do_projeto(fabrica) == 1500
    assert await _primeira_fala_do_projeto(fabrica) == "novo0"
    assert _sincronizados(await _texto_dos_cortes(fabrica)) == ["c0", "c1", "c2"]


# ─── O que as rotas já faziam e o movimento não pode perder ──


@pytest.mark.asyncio
async def test_transcricao_sem_o_campo_da_400_e_nao_muda_nada(cliente, fabrica):
    resposta = await cliente.patch("/api/projetos/p1/transcricao", json={})

    assert resposta.status_code == 400
    assert resposta.json()["detail"] == "Campo 'transcricao' é obrigatório"
    assert await _primeira_fala_do_projeto(fabrica) == "velho0"


@pytest.mark.asyncio
async def test_transcricao_de_projeto_inexistente_da_404(cliente):
    resposta = await cliente.patch("/api/projetos/nao-tem/transcricao", json={"transcricao": []})

    assert (resposta.status_code, resposta.json()["detail"]) == (404, "Projeto não encontrado")


@pytest.mark.asyncio
async def test_sincronia_de_projeto_inexistente_da_404(cliente):
    resposta = await cliente.put(
        "/api/projetos/nao-tem/sincronia-legenda", json={"offset_segundos": 1}
    )

    assert (resposta.status_code, resposta.json()["detail"]) == (404, "Projeto não encontrado")


@pytest.mark.asyncio
async def test_sincronia_sem_a_pasta_do_projeto_da_500_e_nao_muda_nada(cliente, fabrica, tmp_path):
    (tmp_path / "p1").rmdir()

    resposta = await _put_sincronia(cliente)

    assert resposta.status_code == 500
    assert "Diretório do projeto não encontrado" in resposta.json()["detail"]
    assert await _offset_do_projeto(fabrica) == 0


@pytest.mark.asyncio
async def test_legenda_que_nao_vem_nao_grava_o_offset_novo(cliente, fabrica, monkeypatch):
    async def extrair_legenda(*_args, **_kwargs):
        raise RuntimeError("yt-dlp falhou")

    monkeypatch.setattr(IngestaoService, "_extrair_legenda", staticmethod(extrair_legenda))

    resposta = await _put_sincronia(cliente)

    assert resposta.status_code == 500
    assert "yt-dlp falhou" in resposta.json()["detail"]
    assert await _offset_do_projeto(fabrica) == 0
    assert await _primeira_fala_do_projeto(fabrica) == "velho0"
    assert _sincronizados(await _texto_dos_cortes(fabrica)) == []


@pytest.mark.asyncio
async def test_legenda_extraida_com_o_offset_pedido(cliente, monkeypatch):
    recebido = {}

    async def extrair_legenda(projeto_id, url, video="", legenda_offset_ms=0):
        recebido.update(projeto=projeto_id, url=url, video=video, offset=legenda_offset_ms)
        return _falas("novo")

    monkeypatch.setattr(IngestaoService, "_extrair_legenda", staticmethod(extrair_legenda))

    await _put_sincronia(cliente)

    assert recebido == {
        "projeto": "p1",
        "url": "https://youtu.be/p1",
        "video": "video.mkv",
        "offset": 1500,
    }
