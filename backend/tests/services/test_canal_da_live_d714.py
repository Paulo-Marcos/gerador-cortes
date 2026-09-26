"""O canal da live é o de onde ela veio, não o nosso (D-714).

Sem canal informado, o projeto nascia com o handle do canal que PUBLICA os
cortes, e a live ficava creditada a quem a recortou. Agora o canal vem do
formulário ou do ranking, e, na falta dos dois, do `info.json` que o yt-dlp
grava no download.
"""

import json

import pytest
import pytest_asyncio
from app.models import Base, Projeto
from app.services import ingestao as modulo
from app.services.ingestao import IngestaoService, _canal_da_live
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool


@pytest.mark.parametrize(
    ("info", "canal"),
    [
        ({"uploader_id": "@fonte", "channel": "Fonte"}, "@fonte"),
        ({"uploader_id": "UC123", "channel": "Fonte"}, "Fonte"),
        ({"uploader": "Só o uploader"}, "Só o uploader"),
        ({}, ""),
    ],
    ids=["handle", "id-sem-arroba-usa-o-nome", "so-uploader", "nada"],
)
def test_o_canal_prefere_o_handle_e_cai_no_nome(info, canal):
    assert _canal_da_live(info) == canal


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
    monkeypatch.setattr(modulo, "AsyncSessionLocal", f)
    yield f
    await engine.dispose()


async def _baixar(fabrica, tmp_path, *, canal_informado: str) -> Projeto:
    async with fabrica() as db:
        db.add(Projeto(id="p1", youtube_url="u", canal_origem=canal_informado))
        await db.commit()
    (tmp_path / "live.info.json").write_text(
        json.dumps({"title": "Live", "duration": 60, "uploader_id": "@fonte"}), encoding="utf-8"
    )
    await IngestaoService._salvar_transcricao("p1", [], str(tmp_path / "live.mp4"))
    async with fabrica() as db:
        return await db.get(Projeto, "p1")


@pytest.mark.asyncio
async def test_sem_canal_informado_o_download_diz_de_onde_a_live_veio(fabrica, tmp_path):
    projeto = await _baixar(fabrica, tmp_path, canal_informado="")

    assert projeto.canal_origem == "@fonte"


@pytest.mark.asyncio
async def test_canal_informado_nao_e_trocado_pelo_download(fabrica, tmp_path):
    projeto = await _baixar(fabrica, tmp_path, canal_informado="@quem-o-operador-disse")

    assert projeto.canal_origem == "@quem-o-operador-disse"
