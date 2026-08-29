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


# --- as palavras precisam ser REBASEADAS junto com o segmento ---
#
# Regressao real: propagar `palavras` sem remapear deixou o timing em tempo de
# LIVE dentro de uma transcricao ja rebaseada. A granularizacao corta pelas
# bordas reais das palavras (`_dividir_por_bordas_reais`), entao todo segmento
# longo o bastante para ser dividido saia com a posicao na live — e as cenas
# geradas dali nasciam absolutas. Segmento curto passava intacto, o que produzia
# a MISTURA observada: no corte dda14316 (live 8256->8869, 613s de span), a
# transcricao do banco ia de 0,5 a 505,9 mas apos granularizar ia ate 8866,52, e
# a IA devolveu "cena 11 em 8804s-8810s".


def test_palavras_sao_remapeadas_para_a_timeline_do_corte():
    from app.services.timeline_math import TimelineMath

    # Corte que comeca aos 8256s da live; um unico trecho mantido.
    mantidos = [{"start": 8256.0, "end": 8869.0}]
    transcricao = [
        {
            "start": 8300.0,
            "end": 8306.0,
            "texto": "uma frase qualquer",
            "palavras": [
                {"texto": "uma", "inicio_seg": 8300.0},
                {"texto": "frase", "inicio_seg": 8302.5},
                {"texto": "qualquer", "inicio_seg": 8304.0},
            ],
        }
    ]

    resultado = TimelineMath.recalcular_transcricao(transcricao, mantidos)

    assert len(resultado) == 1
    segmento = resultado[0]
    assert segmento["start"] == 44.0  # 8300 - 8256
    tempos = [p["inicio_seg"] for p in segmento["palavras"]]
    assert tempos == [44.0, 46.5, 48.0], "palavras ficaram em tempo de live"
    assert max(tempos) < 613.0, "palavra alem da duracao do corte"


def test_palavra_dentro_de_trecho_removido_desaparece():
    """Ela nao existe no video final — nao pode virar borda de corte de cena."""
    from app.services.timeline_math import TimelineMath

    # Buraco entre 8302 e 8304 (trecho removido).
    mantidos = [{"start": 8300.0, "end": 8302.0}, {"start": 8304.0, "end": 8310.0}]
    transcricao = [
        {
            "start": 8300.0,
            "end": 8310.0,
            "texto": "antes buraco depois",
            "palavras": [
                {"texto": "antes", "inicio_seg": 8300.5},
                {"texto": "buraco", "inicio_seg": 8303.0},  # cai no removido
                {"texto": "depois", "inicio_seg": 8305.0},
            ],
        }
    ]

    resultado = TimelineMath.recalcular_transcricao(transcricao, mantidos)

    textos = [p["texto"] for p in resultado[0]["palavras"]]
    assert textos == ["antes", "depois"]


def test_segmento_sem_palavras_segue_sem_a_chave():
    from app.services.timeline_math import TimelineMath

    mantidos = [{"start": 100.0, "end": 200.0}]
    resultado = TimelineMath.recalcular_transcricao(
        [{"start": 110.0, "end": 116.0, "texto": "sem timing"}], mantidos
    )
    assert "palavras" not in resultado[0]
