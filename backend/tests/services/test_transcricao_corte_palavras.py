"""A transcrição do corte preserva o timing por palavra da live.

O `json3` do YouTube entrega `palavras = [{"texto", "inicio_seg"}]` por
segmento desde julho/2026, e `limpar_e_ordenar_transcricao` já preservava o
campo (D-337). Mas `sincronizar_transcricao_corte` montava o dicionário do
segmento à mão — com `start`, `end`, `texto` e `speaker` — e o timing morria
ali: nas medições de 27/08, 33 projetos tinham palavras e **nenhum dos 435
cortes**.

Sem este campo no nível do corte, qualquer recurso por palavra (âncora de
citação, detecção de hesitação) fica sem base — e a falha é muda: a
transcrição do corte parece completa, só perdeu a granularidade.
"""

import json

import pytest
import pytest_asyncio
from app.models import Base, Corte, Projeto
from app.services import corte as corte_module
from app.services.corte import CorteService
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool


@pytest_asyncio.fixture
async def session_factory(monkeypatch):
    """Banco em memória real; aponta o AsyncSessionLocal do serviço para ele."""
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    monkeypatch.setattr(corte_module, "AsyncSessionLocal", factory)
    yield factory
    await engine.dispose()


def _segmento(start, texto, palavras=None, speaker=None):
    seg = {"start": start, "end": start + 2.0, "texto": texto}
    if palavras is not None:
        seg["palavras"] = palavras
    if speaker:
        seg["speaker"] = speaker
    return seg


async def _montar(factory, segmentos, inicio=100.0, fim=160.0):
    async with factory() as db:
        db.add(Projeto(id="p1", youtube_url="u", transcricao_raw=json.dumps(segmentos)))
        db.add(
            Corte(
                id="c1",
                projeto_id="p1",
                numero=1,
                inicio_hms="00:01:40",
                fim_hms="00:02:40",
                inicio_seg=inicio,
                fim_seg=fim,
                desvios="[]",
            )
        )
        await db.commit()
    await CorteService.sincronizar_transcricao_corte("c1")
    async with factory() as db:
        return json.loads((await db.get(Corte, "c1")).transcricao_corte or "[]")


@pytest.mark.asyncio
async def test_preserva_o_timing_por_palavra(session_factory):
    palavras = [
        {"texto": "essa", "inicio_seg": 120.0},
        {"texto": "frase", "inicio_seg": 120.4},
        {"texto": "aqui", "inicio_seg": 120.9},
    ]
    segs = await _montar(session_factory, [_segmento(120.0, "essa frase aqui", palavras)])

    assert segs, "a transcrição do corte não deveria sair vazia"
    assert segs[0].get("palavras") == palavras


@pytest.mark.asyncio
async def test_tempo_da_palavra_continua_absoluto(session_factory):
    # `transcricao_corte` guarda tempos ABSOLUTOS da live (como start/end),
    # não rebaseados ao início do corte — as palavras seguem a mesma régua.
    palavras = [{"texto": "ola", "inicio_seg": 130.5}]
    segs = await _montar(session_factory, [_segmento(130.0, "ola", palavras)])

    assert segs[0]["palavras"][0]["inicio_seg"] == 130.5
    assert segs[0]["start"] == 130.0


@pytest.mark.asyncio
async def test_segmento_sem_palavras_nao_ganha_a_chave(session_factory):
    # Projetos anteriores a julho/2026 vieram só do VTT, que não tem timing por
    # palavra. A chave deve simplesmente não existir — nada de lista vazia.
    segs = await _montar(session_factory, [_segmento(120.0, "sem timing")])

    assert segs
    assert "palavras" not in segs[0]


@pytest.mark.asyncio
async def test_convive_com_o_rotulo_de_falante(session_factory):
    # `speaker` (D-286) e `palavras` (D-337) são propagados no mesmo ponto;
    # um não pode apagar o outro.
    palavras = [{"texto": "oi", "inicio_seg": 121.0}]
    segs = await _montar(session_factory, [_segmento(121.0, "oi", palavras, speaker="SPEAKER_00")])

    assert segs[0]["speaker"] == "SPEAKER_00"
    assert segs[0]["palavras"] == palavras
