"""A sincronia da transcrição do corte (D-716).

Teste de caracterização, antes de fatiar `CorteService._exec_sincronia`
(complexidade 21). A suíte a exercitava pelo caminho feliz e deixava sem teste
o corte que sumiu, a live sem transcrição, os desvios, o tempo que chega como
texto, o item malformado e o corte sem fala nenhuma. Fixa o que a sincronia
grava: a bruta é o trecho com 60 s de folga de cada lado; a final é o que sobra
fora dos desvios, com o tempo contado a partir do início do corte.
"""

import json

import pytest
import pytest_asyncio
from app.models import Base, Corte, Projeto
from app.services import corte as corte_module
from app.services.corte import CorteService
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

sincronizar = CorteService._exec_sincronia

FALAS = [{"inicio": float(i), "fim": float(i) + 1.0, "texto": f"fala {i}"} for i in range(200)]


@pytest_asyncio.fixture
async def fabrica(tmp_path, monkeypatch):
    engine = create_async_engine(f"sqlite+aiosqlite:///{(tmp_path / 'p.db').as_posix()}")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    f = async_sessionmaker(engine, expire_on_commit=False)
    monkeypatch.setattr(corte_module, "AsyncSessionLocal", f)
    yield f
    await engine.dispose()


async def _semear(fabrica, *, transcricao=FALAS, inicio=100.0, fim=110.0, desvios=None):
    async with fabrica() as db:
        db.add(
            Projeto(
                id="p1",
                youtube_url="u",
                transcricao_raw=json.dumps(transcricao) if transcricao is not None else None,
            )
        )
        db.add(
            Corte(
                id="c1",
                projeto_id="p1",
                numero=1,
                inicio_seg=inicio,
                fim_seg=fim,
                desvios=json.dumps(desvios or []),
            )
        )
        await db.commit()


async def _sincronizar(fabrica, **kwargs) -> Corte:
    async with fabrica() as db:
        await sincronizar("c1", db, **kwargs)
    async with fabrica() as db:
        return await db.get(Corte, "c1")


def _textos(campo: str) -> list[str]:
    return [item["texto"] for item in json.loads(campo)]


@pytest.mark.asyncio
async def test_bruta_com_folga_e_final_com_tempo_do_corte(fabrica):
    await _semear(fabrica)

    corte = await _sincronizar(fabrica)

    bruta = _textos(corte.transcricao_corte)
    assert (bruta[0], bruta[-1]) == ("fala 40", "fala 170")
    final = json.loads(corte.transcricao_final)
    assert [s["texto"] for s in final] == [f"fala {i}" for i in range(100, 110)]
    assert (final[0]["start"], final[1]["start"]) == (0.0, 1.0)
    assert corte.transcricao_final_texto == " ".join(f"fala {i}" for i in range(100, 110))


@pytest.mark.asyncio
async def test_o_desvio_sai_da_final_e_fica_na_bruta(fabrica):
    await _semear(fabrica, desvios=[{"inicio_seg": 103.0, "fim_seg": 106.0, "motivo": "x"}])

    corte = await _sincronizar(fabrica)

    final = _textos(corte.transcricao_final)
    assert "fala 104" not in final and "fala 102" in final and "fala 107" in final
    assert "fala 104" in _textos(corte.transcricao_corte)


@pytest.mark.asyncio
async def test_tempo_em_texto_e_item_malformado(fabrica):
    falas = [
        {"start": "100.5", "end": "101.5", "texto": "decimal em texto"},
        {"start": "00:01:42", "end": "00:01:43", "texto": "hms"},
        None,
        {"start": 104.0, "end": 105.0, "texto": "numero"},
    ]
    await _semear(fabrica, transcricao=falas)

    corte = await _sincronizar(fabrica)

    assert _textos(corte.transcricao_final) == ["decimal em texto", "hms", "numero"]


@pytest.mark.asyncio
async def test_a_transcricao_passada_dispensa_a_da_live(fabrica):
    await _semear(fabrica, transcricao=None)

    corte = await _sincronizar(
        fabrica, trans_raw=[{"inicio": 101.0, "fim": 102.0, "texto": "do lote"}]
    )

    assert corte.transcricao_final_texto == "do lote"


@pytest.mark.asyncio
async def test_live_sem_transcricao_nao_grava_nada(fabrica):
    await _semear(fabrica, transcricao=None)

    corte = await _sincronizar(fabrica)

    assert (corte.transcricao_final, corte.transcricao_final_texto) == ("[]", "")


@pytest.mark.asyncio
async def test_corte_sem_fala_grava_final_vazia(fabrica):
    await _semear(fabrica, transcricao=[{"inicio": 500.0, "fim": 501.0, "texto": "longe"}])

    corte = await _sincronizar(fabrica)

    assert (corte.transcricao_final, corte.transcricao_final_texto) == ("[]", "")


@pytest.mark.asyncio
async def test_corte_que_sumiu_so_registra(fabrica):
    async with fabrica() as db:
        assert await sincronizar("nao-existe", db) is None


@pytest.mark.asyncio
async def test_erro_que_nao_e_trava_do_banco_sobe_sem_nova_tentativa(fabrica):
    await _semear(fabrica)
    tentativas = 0

    async with fabrica() as db:

        async def commit_quebrado():
            nonlocal tentativas
            tentativas += 1
            raise RuntimeError("disco cheio")

        db.commit = commit_quebrado
        with pytest.raises(RuntimeError, match="disco cheio"):
            await sincronizar("c1", db)

    assert tentativas == 1
