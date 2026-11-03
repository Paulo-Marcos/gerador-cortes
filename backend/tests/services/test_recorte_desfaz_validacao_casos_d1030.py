"""D-1030: os casos da auditoria. Quais frases saíram, não quantas; e transcrição refeita não é recorte."""

import json
from datetime import datetime

import pytest
import pytest_asyncio
from app.domain.corte.ancora_da_cena import perdeu_frase, seguir_recorte
from app.models import Base, Corte, Projeto
from app.services import corte as corte_module
from app.services.corte import CorteService
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

_PALAVRAS = [f"palavra{i}" for i in range(60)]
_MARCADA = datetime(2026, 11, 3, 10, 0)


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


def _cena(inicio: float, **campos) -> dict:
    return {"tipo": "enfase", "texto": "Tese", "inicio": inicio, "fim": inicio + 5, **campos}


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
        db.add(
            Projeto(id="p1", youtube_url="u", transcricao_raw=json.dumps(_transcricao(_PALAVRAS)))
        )
        db.add(
            Corte(
                id="c1",
                projeto_id="p1",
                numero=1,
                inicio_seg=100.0,
                fim_seg=160.0,
                status="proposto",
            )
        )
        await db.commit()
    await CorteService.sincronizar_transcricao_corte("c1")
    yield f


async def _gravar(fabrica, **campos) -> None:
    async with fabrica() as db:
        corte = await db.get(Corte, "c1")
        for campo, valor in campos.items():
            setattr(corte, campo, valor)
        await db.commit()


async def _ler(fabrica) -> Corte:
    async with fabrica() as db:
        return await db.get(Corte, "c1")


def test_uma_frase_sai_e_outra_volta_conta_como_perda():
    # Contar cabeças não basta: um sai, outro entra, o número empata e a troca passa.
    antes = json.dumps([_cena(5.0, ancora_perdida=True, frase_ancora="a b c d"), _cena(30.0)])
    depois = json.dumps([_cena(5.0), _cena(30.0, ancora_perdida=True, frase_ancora="e f g h")])
    assert perdeu_frase(antes, depois) is True


def test_duas_voltam_e_uma_sai_conta_como_perda():
    antes = json.dumps(
        [
            _cena(5.0, ancora_perdida=True, frase_ancora="a b c d"),
            _cena(9.0, ancora_perdida=True, frase_ancora="i j k l"),
            _cena(30.0),
        ]
    )
    depois = json.dumps(
        [_cena(5.0), _cena(9.0), _cena(30.0, ancora_perdida=True, frase_ancora="e f g h")]
    )
    assert perdeu_frase(antes, depois) is True


def test_a_mesma_frase_em_duas_cenas_conta_duas_vezes():
    uma = _cena(5.0, ancora_perdida=True, frase_ancora="a b c d")
    outra = _cena(9.0, ancora_perdida=True, frase_ancora="a b c d")
    assert perdeu_frase(json.dumps([uma, _cena(9.0)]), json.dumps([uma, outra])) is True


def test_so_voltar_ou_ficar_igual_nao_e_perda():
    perdida = _cena(5.0, ancora_perdida=True, frase_ancora="a b c d")
    assert perdeu_frase(json.dumps([perdida]), json.dumps([_cena(5.0)])) is False
    assert perdeu_frase(json.dumps([perdida]), json.dumps([perdida])) is False


def test_transcricao_refeita_nao_e_recorte_e_nao_mexe_nas_cenas():
    antiga = _transcricao(_PALAVRAS)
    refeita = _transcricao([f"outra{i}" for i in range(60)])
    gravado = json.dumps([_cena(130.0)])
    saida = json.loads(seguir_recorte(gravado, json.dumps(antiga), refeita, refeita))
    assert saida == [_cena(130.0)]


def test_recorte_que_tira_quase_tudo_continua_sendo_recorte():
    antiga = _transcricao(_PALAVRAS)
    sobrou = _transcricao(_PALAVRAS[:6])
    saida = seguir_recorte(json.dumps([_cena(130.0)]), json.dumps(antiga), sobrou)
    assert json.loads(saida)[0]["ancora_perdida"] is True


@pytest.mark.asyncio
async def test_transcricao_refeita_mantem_a_marca_e_nao_inventa_aviso(fabrica):
    await _gravar(
        fabrica,
        cenas_remotion=json.dumps([_cena(30.0)]),
        cenas_validadas=1,
        cenas_validadas_em=_MARCADA,
    )
    async with fabrica() as db:
        projeto = await db.get(Projeto, "p1")
        projeto.transcricao_raw = json.dumps(_transcricao([f"outra{i}" for i in range(60)]))
        await db.commit()
    await CorteService.sincronizar_transcricao_corte("c1")
    corte = await _ler(fabrica)
    assert corte.cenas_validadas == 1
    assert "ancora_perdida" not in json.loads(corte.cenas_remotion)[0]


@pytest.mark.asyncio
async def test_troca_de_frases_na_sincronia_real_desfaz_a_marca(fabrica):
    # Medido na auditoria: A perdida e revalidada, o trecho muda e A volta enquanto B sai.
    await _gravar(
        fabrica,
        cenas_remotion=json.dumps([_cena(12.0), _cena(45.0)]),
        desvios=json.dumps([_desvio(108.0, 118.0)]),
    )
    await CorteService.sincronizar_transcricao_corte("c1")
    await _gravar(
        fabrica,
        cenas_validadas=1,
        cenas_validadas_em=_MARCADA,
        desvios=json.dumps([_desvio(128.0, 150.0)]),
    )
    await CorteService.sincronizar_transcricao_corte("c1")
    corte = await _ler(fabrica)
    assert sum(1 for c in json.loads(corte.cenas_remotion) if c.get("ancora_perdida")) == 1
    assert corte.cenas_validadas == 0


@pytest.mark.asyncio
async def test_cenas_corrompidas_nao_derrubam_a_sincronia_nem_a_marca(fabrica):
    await _gravar(
        fabrica,
        cenas_remotion="{quebrado",
        cenas_validadas=1,
        desvios=json.dumps([_desvio(110.0, 120.0)]),
    )
    await CorteService.sincronizar_transcricao_corte("c1")
    corte = await _ler(fabrica)
    assert corte.cenas_remotion == "{quebrado"
    assert corte.cenas_validadas == 1
    assert json.loads(corte.transcricao_final)


@pytest.mark.asyncio
async def test_payload_com_chave_cenas_tambem_desfaz(fabrica):
    await _gravar(
        fabrica,
        cenas_remotion=json.dumps({"formato": "cortes", "cenas": [_cena(30.0)]}),
        cenas_validadas=1,
        desvios=json.dumps([_desvio(125.0, 145.0)]),
    )
    await CorteService.sincronizar_transcricao_corte("c1")
    corte = await _ler(fabrica)
    assert corte.cenas_validadas == 0
    assert json.loads(corte.cenas_remotion)["formato"] == "cortes"


@pytest.mark.asyncio
async def test_sincronizar_o_projeto_inteiro_desfaz_so_o_corte_que_perdeu(fabrica):
    await _gravar(
        fabrica,
        cenas_remotion=json.dumps([_cena(30.0)]),
        cenas_validadas=1,
        desvios=json.dumps([_desvio(125.0, 145.0)]),
    )
    async with fabrica() as db:
        db.add(
            Corte(
                id="c2",
                projeto_id="p1",
                numero=2,
                inicio_seg=100.0,
                fim_seg=160.0,
                status="proposto",
                transcricao_final=(await db.get(Corte, "c1")).transcricao_final,
                cenas_remotion=json.dumps([_cena(30.0)]),
                cenas_validadas=1,
            )
        )
        await db.commit()
    async with fabrica() as db:
        await CorteService.sincronizar_transcricao_do_projeto("p1", db)
    async with fabrica() as db:
        cortes = {c.id: c for c in (await db.execute(select(Corte))).scalars()}
    assert cortes["c1"].cenas_validadas == 0
    assert cortes["c2"].cenas_validadas == 1
    # O lote chega ao último corte: os dois têm a transcrição sincronizada de agora.
    assert cortes["c2"].transcricao_final_texto


@pytest.mark.asyncio
async def test_banco_travado_tambem_apaga_a_data_da_marca(fabrica, monkeypatch):
    await _gravar(
        fabrica,
        cenas_remotion=json.dumps([_cena(30.0)]),
        cenas_validadas=1,
        cenas_validadas_em=_MARCADA,
        desvios=json.dumps([_desvio(125.0, 145.0)]),
    )
    original = AsyncSession.commit
    falhas = {"restantes": 1}

    async def commit_travado(sessao):
        if falhas["restantes"]:
            falhas["restantes"] -= 1
            raise RuntimeError("database is locked")
        await original(sessao)

    async def sem_espera(_segundos):
        return None

    monkeypatch.setattr(AsyncSession, "commit", commit_travado)
    monkeypatch.setattr(corte_module.asyncio, "sleep", sem_espera)
    await CorteService.sincronizar_transcricao_corte("c1")
    monkeypatch.setattr(AsyncSession, "commit", original)

    assert falhas["restantes"] == 0
    corte = await _ler(fabrica)
    assert corte.cenas_validadas == 0
    assert corte.cenas_validadas_em is None
