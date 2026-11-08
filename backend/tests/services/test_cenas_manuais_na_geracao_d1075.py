"""Gerar as cenas de novo mantém as cenas manuais (D-1075, RN-39).

Antes, a geração trocava o plano inteiro e levava junto a cena que o operador fez ou
reescreveu à mão. Agora a manual fica intacta, a cena nova da IA que cai em cima dela é
descartada e a rodada guardada (D-1071) segue com o plano inteiro, manuais incluídas.

Só a IA é falsa: escolhe a legenda pela frase, como a real. Cada caminho de geração tem o
seu teste, porque cada um chega à gravação por uma porta diferente.
"""

from __future__ import annotations

import asyncio
import json
import re

import httpx
import pytest
import pytest_asyncio
from app.database import get_db
from app.infrastructure import gemini_client
from app.models import Base, Corte, Projeto
from app.routers import claude_ia, cortes
from app.routers import origem_das_cenas as rota_das_cenas
from app.routers.errors import registrar_tratadores
from app.services import cenas_remotion as cenas_module
from app.services import corte as corte_module
from app.services import desvios as desvios_module
from app.services import origem_das_cenas
from app.services.canal import editorial_scaffolds, editorial_skills, modelos_ia
from app.services.corte import CorteService
from fastapi import FastAPI
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

_PALAVRAS = [f"palavra{i}" for i in range(60)]
_LIMITE_SEG = 5
_RODADAS = "/api/cortes/c1/cenas-remotion/rodadas"

# A cena manual fica em 20-24 s do corte. A IA põe as dela pela frase: a "palavra20" cai em
# cima da manual; a "palavra40" e a "palavra4", longe dela.
_MANUAL = {
    "tipo": "barra_inferior",
    "texto": "Escrita à mão",
    "inicio": 20.0,
    "fim": 24.0,
    "inicio_seg": 20.0,
    "fim_seg": 24.0,
    "manual": True,
}


def _transcricao_da_live() -> list[dict]:
    segmentos = []
    for i in range(0, len(_PALAVRAS), 4):
        inicio = 100.0 + i
        segmentos.append(
            {
                "start": inicio,
                "end": inicio + 4,
                "texto": " ".join(_PALAVRAS[i : i + 4]),
                "palavras": [
                    {"texto": palavra, "inicio_seg": inicio + j, "fim_seg": inicio + j + 1}
                    for j, palavra in enumerate(_PALAVRAS[i : i + 4])
                ],
            }
        )
    return segmentos


class IaFalsa:
    """A IA das cenas: uma cena por (frase, texto), na legenda que diz a frase."""

    def __init__(self):
        self.cenas = [("palavra40", "Da IA")]

    async def responder(self, prompt: str) -> dict:
        cenas = []
        for frase, texto in self.cenas:
            achada = re.search(rf"^\[(\d+)\][^\n]*\b{frase}\b", prompt, re.MULTILINE)
            assert achada, f"a frase não está nas legendas do prompt:\n{prompt}"
            legenda = int(achada.group(1))
            cenas.append({"tipo": "enfase", "texto": texto, "startLeg": legenda, "duracao_s": 3})
        return {"cenas": cenas}


@pytest.fixture
def ia(monkeypatch):
    falsa = IaFalsa()

    async def gerar_json(_provider, prompt, *_a, **_k):
        return await falsa.responder(prompt)

    async def gemini(_modelo, prompt, **_k):
        return await falsa.responder(prompt)

    monkeypatch.setattr(cenas_module, "gerar_json", gerar_json)
    monkeypatch.setattr(cenas_module, "registrar_skill_usada", lambda *_a, **_k: None)
    monkeypatch.setattr(gemini_client, "generate_json", gemini)
    monkeypatch.setattr(
        editorial_skills, "resolver_skill", lambda *_a, **_k: type("S", (), {"lentes": []})()
    )
    monkeypatch.setattr(
        editorial_scaffolds, "resolver_scaffold", lambda *_a, **_k: "{legendas_numeradas}"
    )
    monkeypatch.setattr(cenas_module, "CONTRATO_DA_ORIGEM", "")
    monkeypatch.setattr(
        modelos_ia, "ler_modelos", lambda: type("M", (), {"gemini_api_texto": "falso"})()
    )
    return falsa


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
    for modulo in (corte_module, cenas_module, desvios_module, origem_das_cenas):
        monkeypatch.setattr(modulo, "AsyncSessionLocal", f)
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
                status="aprovado",
                titulo_proposto="Corte",
            )
        )
        await db.commit()
    await CorteService.sincronizar_transcricao_corte("c1")
    yield f
    await engine.dispose()


@pytest_asyncio.fixture
async def cliente(fabrica, ia):
    async def banco():
        async with fabrica() as db:
            yield db

    app = FastAPI()
    registrar_tratadores(app)
    app.include_router(claude_ia.router, prefix="/api/claude")
    app.include_router(cortes.router, prefix="/api/cortes")
    app.include_router(rota_das_cenas.router, prefix="/api/cortes")
    app.dependency_overrides[get_db] = banco
    transporte = httpx.ASGITransport(app=app, raise_app_exceptions=False)
    async with httpx.AsyncClient(transport=transporte, base_url="http://teste") as http:
        yield http


async def _no_limite(aguardavel):
    return await asyncio.wait_for(aguardavel, _LIMITE_SEG)


async def _gravar_plano(cliente, cenas: list[dict]) -> None:
    """O operador salva o plano no editor, como o painel de cenas faz."""
    corpo = {"cenas_remotion": {"formato": "cortes", "cenas": cenas}}
    resposta = await _no_limite(cliente.patch("/api/cortes/c1", json=corpo))
    assert resposta.status_code == 200, resposta.text


async def _gerar_pelo_claude(cliente, provider: str = "claude") -> None:
    resposta = await _no_limite(
        cliente.post("/api/claude/corte/c1/gerar-cenas", params={"provider": provider})
    )
    assert resposta.status_code == 200, resposta.text


async def _gerar_pelo_gemini_da_api(cliente) -> None:
    resposta = await _no_limite(cliente.post("/api/cortes/c1/gerar-cenas-remotion"))
    assert resposta.status_code == 200, resposta.text


async def _importar_do_modal_manual(cliente) -> None:
    """O operador cola a resposta de uma IA de fora: é cena da IA, não dele."""
    corpo = {"cenas": [{"tipo": "enfase", "texto": "Colada", "startLeg": 0, "duracao_s": 3}]}
    resposta = await _no_limite(cliente.post("/api/cortes/c1/cenas-remotion/importar", json=corpo))
    assert resposta.status_code == 200, resposta.text


async def _payload(fabrica) -> dict:
    async with fabrica() as db:
        corte = await db.get(Corte, "c1")
        return json.loads(corte.cenas_remotion)


async def _cenas(fabrica) -> list[dict]:
    return (await _payload(fabrica))["cenas"]


async def _rodadas(cliente) -> dict:
    resposta = await _no_limite(cliente.get(_RODADAS))
    assert resposta.status_code == 200, resposta.text
    return resposta.json()


def _manuais(cenas: list[dict]) -> list[dict]:
    return [cena for cena in cenas if cena.get("manual")]


def _textos(cenas: list[dict]) -> list[str]:
    return [cena["texto"] for cena in cenas]


# ─── a manual fica, em cada caminho de geração ───────────────────────────────


GERACOES = {
    "claude": lambda cliente: _gerar_pelo_claude(cliente, "claude"),
    "gemini pelo agy": lambda cliente: _gerar_pelo_claude(cliente, "gemini"),
    "gemini pela api": _gerar_pelo_gemini_da_api,
    "modal manual": _importar_do_modal_manual,
}


@pytest.mark.asyncio
@pytest.mark.parametrize("caminho", list(GERACOES))
async def test_gerar_de_novo_mantem_a_cena_manual_intacta(cliente, fabrica, caminho):
    await _gravar_plano(cliente, [_MANUAL])

    await GERACOES[caminho](cliente)

    cenas = await _cenas(fabrica)
    assert _manuais(cenas) == [_MANUAL], f"{caminho}: a cena manual sumiu ou mudou"
    assert len(cenas) == 2, f"{caminho}: a cena da IA não entrou junto"


@pytest.mark.asyncio
async def test_a_cena_da_ia_anterior_sai_como_antes(cliente, fabrica, ia):
    """Só a manual fica: a cena da IA da rodada que sai é substituída, como sempre foi."""
    ia.cenas = [("palavra40", "Primeira da IA")]
    await _gerar_pelo_claude(cliente)
    await _gravar_plano(cliente, [*await _cenas(fabrica), _MANUAL])
    ia.cenas = [("palavra4", "Segunda da IA")]

    await _gerar_pelo_claude(cliente)

    assert _textos(await _cenas(fabrica)) == ["Segunda da IA", "Escrita à mão"]


# ─── conflito de tempo ───────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_a_cena_da_ia_em_cima_da_manual_e_descartada(cliente, fabrica, ia):
    await _gravar_plano(cliente, [_MANUAL])
    ia.cenas = [("palavra40", "Longe"), ("palavra20", "Em cima"), ("palavra4", "Antes")]

    await _gerar_pelo_claude(cliente)

    payload = await _payload(fabrica)
    assert _textos(payload["cenas"]) == ["Antes", "Escrita à mão", "Longe"]
    assert payload["descartadas_pelas_manuais"] == 1


@pytest.mark.asyncio
async def test_sem_conflito_o_plano_nao_fala_em_descartadas(cliente, fabrica, ia):
    await _gravar_plano(cliente, [_MANUAL])

    await _gerar_pelo_claude(cliente)

    assert "descartadas_pelas_manuais" not in await _payload(fabrica)


@pytest.mark.asyncio
async def test_o_aviso_das_descartadas_sai_quando_o_operador_salva(cliente, fabrica, ia):
    """O aviso é da geração: o plano salvo pelo operador já é outra conversa."""
    await _gravar_plano(cliente, [_MANUAL])
    ia.cenas = [("palavra20", "Em cima")]
    await _gerar_pelo_claude(cliente)

    await _gravar_plano(cliente, await _cenas(fabrica))

    assert "descartadas_pelas_manuais" not in await _payload(fabrica)


# ─── riscada ─────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_a_manual_riscada_continua_riscada(cliente, fabrica, ia):
    riscada = {**_MANUAL, "riscada": True}
    await _gravar_plano(cliente, [riscada])

    await _gerar_pelo_claude(cliente)

    assert _manuais(await _cenas(fabrica)) == [riscada]


@pytest.mark.asyncio
async def test_a_cena_da_ia_riscada_e_substituida_pela_rodada_nova(cliente, fabrica, ia):
    ia.cenas = [("palavra40", "Riscada da IA")]
    await _gerar_pelo_claude(cliente)
    riscada = {**(await _cenas(fabrica))[0], "riscada": True}
    await _gravar_plano(cliente, [riscada])
    ia.cenas = [("palavra4", "Nova da IA")]

    await _gerar_pelo_claude(cliente)

    cenas = await _cenas(fabrica)
    assert _textos(cenas) == ["Nova da IA"]
    assert not any(cena.get("riscada") for cena in cenas)


# ─── a rodada guardada e o desfazer ──────────────────────────────────────────


@pytest.mark.asyncio
async def test_desfazer_volta_exatamente_ao_plano_com_as_manuais(cliente, fabrica, ia):
    ia.cenas = [("palavra40", "Da IA antes")]
    await _gerar_pelo_claude(cliente)
    antes = [_MANUAL, *await _cenas(fabrica)]
    await _gravar_plano(cliente, antes)
    plano_antes = await _payload(fabrica)
    ia.cenas = [("palavra4", "Da IA depois"), ("palavra20", "Em cima")]
    await _gerar_pelo_claude(cliente)

    rodadas = await _rodadas(cliente)
    assert _textos(rodadas["anterior"]["cenas"]) == ["Escrita à mão", "Da IA antes"]
    desfez = await _no_limite(
        cliente.post(f"{_RODADAS}/desfazer", json={"versao": rodadas["versao"]})
    )

    assert desfez.status_code == 200, desfez.text
    assert await _payload(fabrica) == plano_antes


@pytest.mark.asyncio
async def test_a_manual_salva_durante_a_geracao_tambem_fica(cliente, fabrica, monkeypatch):
    """A manual é lida na hora de gravar, sob o `where` das rodadas (D-1071), e não no começo."""
    gravar_se = origem_das_cenas._gravar_se
    salvou = False

    async def salvar_antes(db, corte_id, condicao, valores):
        nonlocal salvou
        if not salvou and "cenas_anteriores" in valores:
            salvou = True
            await _gravar_plano(cliente, [_MANUAL])
        return await gravar_se(db, corte_id, condicao, valores)

    monkeypatch.setattr(origem_das_cenas, "_gravar_se", salvar_antes)
    await _gerar_pelo_claude(cliente)

    assert salvou
    assert _manuais(await _cenas(fabrica)) == [_MANUAL]


@pytest.mark.asyncio
async def test_a_manual_tirada_durante_a_geracao_nao_volta(cliente, fabrica, monkeypatch):
    """Se a gravação relê, encaixa sobre o plano de agora: a manual da leitura velha não volta."""
    await _gravar_plano(cliente, [_MANUAL])
    gravar_se = origem_das_cenas._gravar_se
    tirou = False

    async def tirar_antes(db, corte_id, condicao, valores):
        nonlocal tirou
        if not tirou and "cenas_anteriores" in valores:
            tirou = True
            await _gravar_plano(cliente, [])
        return await gravar_se(db, corte_id, condicao, valores)

    monkeypatch.setattr(origem_das_cenas, "_gravar_se", tirar_antes)
    await _gerar_pelo_claude(cliente)

    assert tirou
    assert _textos(await _cenas(fabrica)) == ["Da IA"]
