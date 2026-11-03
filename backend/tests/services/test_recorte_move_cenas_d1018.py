"""D-1018 (RN-36): a sincronia real leva as cenas junto com a frase quando o corte muda."""

import json
from types import SimpleNamespace

import pytest
import pytest_asyncio
from app.domain.corte import origem_da_cena
from app.models import Base, Corte, Projeto
from app.services import cenas_remotion
from app.services import corte as corte_module
from app.services.canal import editorial_scaffolds
from app.services.corte import CorteService
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

_PALAVRAS = [f"palavra{i}" for i in range(60)]


def _transcricao_da_live() -> list[dict]:
    """Uma palavra por segundo, a partir de 100 s da live, em segmentos de 4 palavras."""
    segmentos = []
    for i in range(0, len(_PALAVRAS), 4):
        pedaco = _PALAVRAS[i : i + 4]
        inicio = 100.0 + i
        segmentos.append(
            {
                "start": inicio,
                "end": inicio + len(pedaco),
                "texto": " ".join(pedaco),
                "palavras": [
                    {"texto": palavra, "inicio_seg": inicio + j} for j, palavra in enumerate(pedaco)
                ],
            }
        )
    return segmentos


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
            Projeto(id="p1", youtube_url="u", transcricao_raw=json.dumps(_transcricao_da_live()))
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
    yield f


async def _ler(fabrica) -> Corte:
    async with fabrica() as db:
        return await db.get(Corte, "c1")


async def _gravar(fabrica, **campos) -> None:
    async with fabrica() as db:
        corte = await db.get(Corte, "c1")
        for campo, valor in campos.items():
            setattr(corte, campo, valor)
        await db.commit()


def _cena(inicio: float) -> dict:
    return {"tipo": "enfase", "texto": "Tese", "inicio": inicio, "fim": inicio + 5}


@pytest.mark.asyncio
async def test_remover_trecho_antes_da_cena_leva_a_cena_junto(fabrica):
    await CorteService.sincronizar_transcricao_corte("c1")
    await _gravar(fabrica, cenas_remotion=json.dumps({"cenas": [_cena(30.0)]}))

    desvios = [{"inicio_seg": 110.0, "fim_seg": 120.0, "tipo": "desvio"}]
    await _gravar(fabrica, desvios=json.dumps(desvios))
    await CorteService.sincronizar_transcricao_corte("c1")

    cena = json.loads((await _ler(fabrica)).cenas_remotion)["cenas"][0]
    assert cena["inicio"] == 20.0
    assert cena["fim"] == 25.0


@pytest.mark.asyncio
async def test_remover_o_trecho_da_cena_avisa_e_nao_apaga(fabrica):
    await CorteService.sincronizar_transcricao_corte("c1")
    await _gravar(fabrica, cenas_remotion=json.dumps([_cena(30.0)]))

    desvios = [{"inicio_seg": 125.0, "fim_seg": 145.0, "tipo": "desvio"}]
    await _gravar(fabrica, desvios=json.dumps(desvios))
    await CorteService.sincronizar_transcricao_corte("c1")

    cena = json.loads((await _ler(fabrica)).cenas_remotion)[0]
    assert cena["inicio"] == 30.0
    assert cena["ancora_perdida"] is True


@pytest.mark.asyncio
async def test_sincronizar_sem_mudar_a_fala_nao_toca_nas_cenas(fabrica):
    await CorteService.sincronizar_transcricao_corte("c1")
    gravado = json.dumps({"formato": "cortes", "cenas": [_cena(30.0)]})
    await _gravar(fabrica, cenas_remotion=gravado)
    await CorteService.sincronizar_transcricao_corte("c1")
    assert (await _ler(fabrica)).cenas_remotion == gravado


@pytest.mark.asyncio
async def test_banco_travado_na_primeira_tentativa_nao_perde_o_movimento(fabrica, monkeypatch):
    await CorteService.sincronizar_transcricao_corte("c1")
    await _gravar(
        fabrica,
        cenas_remotion=json.dumps([_cena(30.0)]),
        desvios=json.dumps([{"inicio_seg": 110.0, "fim_seg": 120.0, "tipo": "desvio"}]),
    )
    original = AsyncSession.commit
    falhas = {"restantes": 1}

    async def commit_travado(sessao):
        if falhas["restantes"]:
            falhas["restantes"] -= 1
            raise RuntimeError("database is locked")
        await original(sessao)

    monkeypatch.setattr(AsyncSession, "commit", commit_travado)
    await CorteService.sincronizar_transcricao_corte("c1")
    monkeypatch.setattr(AsyncSession, "commit", original)

    assert json.loads((await _ler(fabrica)).cenas_remotion)[0]["inicio"] == 20.0


def test_o_prompt_das_cenas_leva_o_contrato_da_origem(monkeypatch):
    monkeypatch.setattr(editorial_scaffolds, "resolver_scaffold", lambda chave: "{titulo}")
    corte = SimpleNamespace(
        titulo_proposto="T", tema_central="", resumo="", contextualizacao="", frase_gancho_texto=""
    )
    texto = cenas_remotion._texto_da_parte(corte, [{"start": 0, "end": 1, "texto": "x"}], 0, 1)
    assert origem_da_cena.CONTRATO_DA_ORIGEM in texto


def test_o_contrato_da_origem_vem_depois_do_formato_do_scaffold(monkeypatch):
    # Medido numa geração real: no topo do prompt, 0 frases em 11 cenas. O "FORMATO
    # FINAL" do scaffold vinha depois, sem os campos, e era o que a IA seguia.
    monkeypatch.setattr(
        editorial_scaffolds, "resolver_scaffold", lambda chave: "{titulo}\nFORMATO FINAL"
    )
    corte = SimpleNamespace(
        titulo_proposto="T", tema_central="", resumo="", contextualizacao="", frase_gancho_texto=""
    )
    texto = cenas_remotion._texto_da_parte(corte, [{"start": 0, "end": 1, "texto": "x"}], 0, 1)
    assert texto.index("FORMATO FINAL") < texto.index(origem_da_cena.CONTRATO_DA_ORIGEM)
    assert texto.rstrip().endswith(origem_da_cena.CONTRATO_DA_ORIGEM.rstrip())


def test_a_cena_gravada_guarda_a_frase_e_quem_disse():
    gravada = cenas_remotion._converter_cena(
        {
            "tipo": "enfase",
            "texto": "T",
            "frase_da_fala": "a frase",
            "quem_disse": "apresentador",
            "fonte": "IBGE",
        },
        3.0,
    )
    assert gravada["frase_da_fala"] == "a frase"
    assert gravada["quem_disse"] == "apresentador"
    assert gravada["fonte"] == "IBGE"
