"""D-461: a escolha da fonte das palavras do short.

A regra é uma só, e é ela que o arquivo guarda: **o ASR local tem preferência,
mas nunca é obrigatório**. Sem a lib instalada, sem o bruto em disco, ou com o
modelo estourando, a auto-legenda assume e a geração do short segue. Um erro de
transcrição não pode derrubar a produção de vídeo.
"""

import json

import pytest
import pytest_asyncio
from app.domain.transcricao_fiel import Palavra, normalizar_palavras, recortar
from app.models import Base, Corte, Projeto
from app.services import transcricao_fiel as servico
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

_SEGMENTOS = [
    {
        "palavras": [
            {"texto": "ninguem", "inicio_seg": 10.0},
            {"texto": "te", "inicio_seg": 10.4},
            {"texto": "conta", "inicio_seg": 10.6},
        ]
    }
]


@pytest_asyncio.fixture
async def ambiente(monkeypatch, tmp_path):
    from app import channel_paths

    monkeypatch.setattr(channel_paths, "projetos_dir", lambda: tmp_path)

    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    monkeypatch.setattr(servico, "AsyncSessionLocal", factory)

    corte_dir = tmp_path / "p1" / "cortes" / "c1"
    corte_dir.mkdir(parents=True)
    (corte_dir / "clip_raw_1.mkv").write_bytes(b"x" * 1024)

    async with factory() as db:
        db.add(Projeto(id="p1", youtube_url="u"))
        db.add(
            Corte(
                id="c1",
                projeto_id="p1",
                numero=1,
                inicio_seg=0.0,
                fim_seg=100.0,
                inicio_hms="00:00:00.000",
                fim_hms="00:01:40.000",
                arquivo_clip_path="cortes/c1/clip_raw_1.mkv",
                transcricao_final=json.dumps(_SEGMENTOS),
            )
        )
        await db.commit()

    yield factory
    await engine.dispose()


@pytest.mark.asyncio
async def test_usa_o_asr_local_quando_ele_responde(ambiente, monkeypatch):
    async def _fake(video_path):
        return [
            {"texto": "Ninguém", "inicio_seg": 10.0, "fim_seg": 10.35},
            {"texto": "te", "inicio_seg": 10.4, "fim_seg": 10.55},
        ]

    monkeypatch.setattr(servico.asr_local, "transcrever_palavras", _fake)

    resultado = await servico.obter_do_corte("c1")

    assert resultado.fonte == servico.FONTE_ASR
    # A grafia do ASR e o ganho: a auto-legenda escreve "ninguem".
    assert resultado.palavras[0].texto == "Ninguém"


@pytest.mark.asyncio
async def test_cai_na_auto_legenda_quando_o_asr_nao_roda(ambiente, monkeypatch):
    async def _sem_asr(video_path):
        return None

    monkeypatch.setattr(servico.asr_local, "transcrever_palavras", _sem_asr)

    resultado = await servico.obter_do_corte("c1")

    assert resultado.fonte == servico.FONTE_AUTO_LEGENDA
    assert [p.texto for p in resultado.palavras] == ["ninguem", "te", "conta"]


@pytest.mark.asyncio
async def test_asr_vazio_tambem_cai_na_auto_legenda(ambiente, monkeypatch):
    """Modelo que roda mas nao entende nada nao pode zerar a legenda."""

    async def _vazio(video_path):
        return []

    monkeypatch.setattr(servico.asr_local, "transcrever_palavras", _vazio)

    assert (await servico.obter_do_corte("c1")).fonte == servico.FONTE_AUTO_LEGENDA


@pytest.mark.asyncio
async def test_sem_bruto_em_disco_nem_tenta_o_asr(ambiente, monkeypatch):
    chamou = []

    async def _espia(video_path):
        chamou.append(video_path)
        return None

    monkeypatch.setattr(servico.asr_local, "transcrever_palavras", _espia)
    async with ambiente() as db:
        (await db.get(Corte, "c1")).arquivo_clip_path = ""
        await db.commit()

    resultado = await servico.obter_do_corte("c1")

    assert chamou == []
    assert resultado.fonte == servico.FONTE_AUTO_LEGENDA


@pytest.mark.asyncio
async def test_corte_inexistente_levanta_lookup(ambiente):
    with pytest.raises(LookupError):
        await servico.obter_do_corte("nao-existe")


def test_fim_da_palavra_encosta_na_seguinte():
    """Sem isso o realce deixa buraco entre uma palavra e outra."""
    palavras = normalizar_palavras(
        [{"texto": "a", "inicio_seg": 1.0}, {"texto": "b", "inicio_seg": 1.5}]
    )

    assert palavras[0].fim_seg == 1.5


def test_ultima_palavra_ganha_folego_padrao():
    palavras = normalizar_palavras([{"texto": "fim", "inicio_seg": 2.0}])

    assert palavras[0].fim_seg == 2.4


def test_palavras_fora_de_ordem_sao_ordenadas():
    palavras = normalizar_palavras(
        [{"texto": "b", "inicio_seg": 2.0}, {"texto": "a", "inicio_seg": 1.0}]
    )

    assert [p.texto for p in palavras] == ["a", "b"]


def test_lixo_na_fonte_e_ignorado_sem_explodir():
    palavras = normalizar_palavras(
        ["nao e dict", {"texto": "", "inicio_seg": 1.0}, {"texto": "ok", "inicio_seg": "x"}]
    )

    assert palavras == []


def test_recorte_rebaseia_para_o_zero_do_short():
    """O short vira arquivo proprio; legenda em tempo de bruto apareceria tarde."""
    palavras = [Palavra("antes", 5.0, 5.4), Palavra("dentro", 12.0, 12.5)]

    assert [(p.texto, p.inicio_seg) for p in recortar(palavras, 10.0, 20.0)] == [("dentro", 2.0)]


@pytest.mark.asyncio
async def test_permitir_asr_falso_nem_toca_no_modelo(ambiente, monkeypatch):
    """D-479: a previa da legenda precisa de resposta AGORA, nao da melhor.

    O ASR roda o modelo sobre o audio inteiro do bruto e leva minutos. Isso
    serve a um render, mas congelaria a tela de curadoria enquanto o operador
    espera para ver uma legenda. `permitir_asr=False` e o que garante que a
    chamada volte na hora — e este teste e o que garante que ela nem TENTA.
    """
    chamou = []

    async def _espia(video_path):
        chamou.append(video_path)
        return [{"texto": "Ninguém", "inicio_seg": 10.0, "fim_seg": 10.35}]

    monkeypatch.setattr(servico.asr_local, "transcrever_palavras", _espia)

    resultado = await servico.obter_do_corte("c1", permitir_asr=False)

    assert chamou == [], "o ASR foi chamado mesmo com permitir_asr=False"
    assert resultado.fonte == servico.FONTE_AUTO_LEGENDA
    assert [p.texto for p in resultado.palavras] == ["ninguem", "te", "conta"]
