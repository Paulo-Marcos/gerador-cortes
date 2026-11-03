"""D-1030: recorte misto (tira uma parte, devolve outra) continua sendo recorte.

Sobra pouco em comum entre a transcrição antiga e a nova, igual a uma transcrição refeita. O
que separa os dois é a live: recorte nunca tira palavra dela; transcrição refeita tira.
"""

import json

import pytest
import pytest_asyncio
from app.models import Base, Corte, Projeto
from app.services import corte as corte_module
from app.services.corte import CorteService
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

_LIVE = [f"palavra{i}" for i in range(140)]


def _transcricao(palavras: list[str], inicio: float = 100.0) -> list[dict]:
    return [
        {
            "start": inicio + i,
            "end": inicio + i + 4,
            "texto": " ".join(palavras[i : i + 4]),
            "palavras": [
                {"texto": palavra, "inicio_seg": inicio + i + j}
                for j, palavra in enumerate(palavras[i : i + 4])
            ],
        }
        for i in range(0, len(palavras), 4)
    ]


def _cena(inicio: float) -> dict:
    return {"tipo": "enfase", "texto": f"cena{inicio}", "inicio": inicio, "fim": inicio + 3}


def _desvio(inicio: float, fim: float) -> dict:
    return {"inicio_seg": inicio, "fim_seg": fim, "tipo": "desvio"}


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
    monkeypatch.setattr(corte_module, "AsyncSessionLocal", f)
    async with f() as db:
        db.add(Projeto(id="p1", youtube_url="u", transcricao_raw=json.dumps(_transcricao(_LIVE))))
        await db.commit()
    yield f


async def _preparar(fabrica, inicio: float, fim: float, desvios: list[dict], cenas: list[dict]):
    async with fabrica() as db:
        db.add(
            Corte(
                id="c1",
                projeto_id="p1",
                numero=1,
                inicio_seg=inicio,
                fim_seg=fim,
                status="proposto",
                desvios=json.dumps(desvios),
            )
        )
        await db.commit()
    await CorteService.sincronizar_transcricao_corte("c1")
    async with fabrica() as db:
        corte = await db.get(Corte, "c1")
        corte.cenas_remotion = json.dumps(cenas)
        corte.cenas_validadas = 1
        await db.commit()


async def _recortar(fabrica, *, inicio=None, fim=None, desvios=None) -> tuple[list[dict], int]:
    async with fabrica() as db:
        corte = await db.get(Corte, "c1")
        if inicio is not None:
            corte.inicio_seg, corte.fim_seg = inicio, fim
        if desvios is not None:
            corte.desvios = json.dumps(desvios)
        await db.commit()
    await CorteService.sincronizar_transcricao_corte("c1")
    async with fabrica() as db:
        corte = await db.get(Corte, "c1")
        return json.loads(corte.cenas_remotion), corte.cenas_validadas


def _por_texto(cenas: list[dict]) -> dict:
    return {cena["texto"]: cena for cena in cenas}


@pytest.mark.asyncio
async def test_janela_que_desliza_segue_a_frase_e_desfaz(fabrica):
    await _preparar(fabrica, 100.0, 160.0, [], [_cena(10.0), _cena(45.0)])
    cenas, marca = await _recortar(fabrica, inicio=140.0, fim=200.0)
    assert marca == 0
    assert _por_texto(cenas)["cena10.0"]["ancora_perdida"] is True
    assert _por_texto(cenas)["cena45.0"]["inicio"] == 5.0


@pytest.mark.asyncio
async def test_trocar_o_trecho_removido_segue_a_frase_e_desfaz(fabrica):
    await _preparar(fabrica, 100.0, 160.0, [_desvio(130.0, 160.0)], [_cena(10.0), _cena(25.0)])
    cenas, marca = await _recortar(fabrica, desvios=[_desvio(100.0, 120.0)])
    assert marca == 0
    assert _por_texto(cenas)["cena10.0"]["ancora_perdida"] is True
    assert _por_texto(cenas)["cena25.0"]["inicio"] == 5.0


@pytest.mark.asyncio
async def test_corte_pequeno_que_troca_o_comeco_pelo_resto_segue_e_desfaz(fabrica):
    await _preparar(fabrica, 100.0, 120.0, [], [_cena(5.0), _cena(15.0)])
    cenas, marca = await _recortar(fabrica, inicio=112.0, fim=160.0)
    assert marca == 0
    assert _por_texto(cenas)["cena5.0"]["ancora_perdida"] is True
    assert _por_texto(cenas)["cena15.0"]["inicio"] == 3.0


@pytest.mark.asyncio
async def test_transcricao_refeita_inteira_nao_mexe_em_nada(fabrica):
    await _preparar(fabrica, 100.0, 160.0, [], [_cena(10.0), _cena(45.0)])
    async with fabrica() as db:
        projeto = await db.get(Projeto, "p1")
        projeto.transcricao_raw = json.dumps(_transcricao([f"outra{i}" for i in range(140)]))
        await db.commit()
    cenas, marca = await _recortar(fabrica)
    assert marca == 1
    assert [cena["inicio"] for cena in cenas] == [10.0, 45.0]
    assert not any(cena.get("ancora_perdida") for cena in cenas)


@pytest.mark.asyncio
async def test_trecho_retranscrito_nao_acusa_a_cena_que_esta_nele(fabrica):
    # Só as palavras 20 a 39 foram refeitas: a cena em 30 s não "saiu do corte".
    await _preparar(fabrica, 100.0, 160.0, [], [_cena(30.0), _cena(50.0)])
    refeita = _LIVE[:20] + [f"outra{i}" for i in range(20)] + _LIVE[40:]
    async with fabrica() as db:
        projeto = await db.get(Projeto, "p1")
        projeto.transcricao_raw = json.dumps(_transcricao(refeita))
        await db.commit()
    cenas, marca = await _recortar(fabrica)
    assert marca == 1
    assert not any(cena.get("ancora_perdida") for cena in cenas)
    assert [cena["inicio"] for cena in cenas] == [30.0, 50.0]
