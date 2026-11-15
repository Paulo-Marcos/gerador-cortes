"""Gerar as cenas de novo guarda a rodada anterior, para desfazer e comparar (D-1071, RN-37).

Antes, a geração trocava o plano inteiro e o anterior se perdia. Agora a rodada que sai fica
guardada com quem a gerou, quando e se estava validada; desfazer troca as duas de lugar e
recusa se as cenas mudaram no meio, como as outras gravações das cenas (D-1049, D-1065).

Só a IA é falsa: escolhe a legenda pela frase, como a real, e pode ficar presa até o teste
soltar, para provar o que acontece com uma geração em curso.
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
_FOLGA_SEG = 2.0
_RODADAS = "/api/cortes/c1/cenas-remotion/rodadas"
_DESFAZER = f"{_RODADAS}/desfazer"
_TRECHO = {"inicio_hms": "00:01:50", "fim_hms": "00:02:00", "motivo": "enrolação"}


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
    """A IA das cenas: põe uma cena `texto` na legenda que diz `frase`; presa, espera o teste."""

    def __init__(self):
        self.frase, self.texto = "palavra40", "Tese"
        self.presa = False
        self.comecou = asyncio.Event()
        self.solta = asyncio.Event()

    async def responder(self, prompt: str) -> dict:
        achada = re.search(rf"^\[(\d+)\][^\n]*\b{self.frase}\b", prompt, re.MULTILINE)
        assert achada, f"a frase não está nas legendas do prompt:\n{prompt}"
        self.comecou.set()
        if self.presa:
            await self.solta.wait()
        legenda = int(achada.group(1))
        return {"cenas": [{"tipo": "enfase", "texto": self.texto, "startLeg": legenda}]}


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
    yield falsa
    falsa.solta.set()


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


async def _ler(fabrica) -> Corte:
    async with fabrica() as db:
        return await db.get(Corte, "c1")


def _textos(rodada: dict | None) -> list[str]:
    assert rodada is not None, "não há rodada"
    return [cena["texto"] for cena in rodada["cenas"]]


async def _gerar_pelo_claude(cliente, ia, texto: str) -> None:
    ia.texto = texto
    resposta = await _no_limite(cliente.post("/api/claude/corte/c1/gerar-cenas"))
    assert resposta.status_code == 200, resposta.text


async def _importar(cliente, texto: str) -> None:
    corpo = {"cenas": [{"tipo": "enfase", "texto": texto, "startLeg": 0, "duracao_s": 3}]}
    resposta = await _no_limite(cliente.post("/api/cortes/c1/cenas-remotion/importar", json=corpo))
    assert resposta.status_code == 200, resposta.text


async def _rodadas(cliente) -> dict:
    resposta = await _no_limite(cliente.get(_RODADAS))
    assert resposta.status_code == 200, resposta.text
    return resposta.json()


async def _editar(cliente, texto: str) -> None:
    """O operador reescreve o texto da cena no editor: é a mesma rodada, editada."""
    cena = (await _rodadas(cliente))["atual"]["cenas"][0]
    corpo = {"cenas_remotion": {"formato": "cortes", "cenas": [{**cena, "texto": texto}]}}
    resposta = await _no_limite(cliente.patch("/api/cortes/c1", json=corpo))
    assert resposta.status_code == 200, resposta.text


# ─── guardar a rodada anterior ───────────────────────────────────────────────


@pytest.mark.asyncio
async def test_gerar_de_novo_guarda_a_anterior_com_quem_gerou_e_a_validacao(cliente, ia):
    await _importar(cliente, "Colada")
    validou = await _no_limite(cliente.post("/api/cortes/c1/cenas-remotion/validar"))
    assert validou.status_code == 200, validou.text

    await _gerar_pelo_claude(cliente, ia, "Do Claude")
    rodadas = await _rodadas(cliente)

    assert _textos(rodadas["atual"]) == ["Do Claude"]
    assert rodadas["atual"]["origem"] == "claude"
    assert rodadas["atual"]["gerada_em"] and not rodadas["atual"]["validadas"]
    assert _textos(rodadas["anterior"]) == ["Colada"]
    assert rodadas["anterior"]["origem"] == "manual"
    assert rodadas["anterior"]["validadas"] and rodadas["anterior"]["validadas_em"]


@pytest.mark.asyncio
async def test_o_gemini_fica_registrado_como_quem_gerou(cliente, ia):
    await _gerar_pelo_claude(cliente, ia, "Do Claude")
    ia.texto = "Do Gemini"

    resposta = await _no_limite(cliente.post("/api/cortes/c1/gerar-cenas-remotion"))

    assert resposta.status_code == 200, resposta.text
    rodadas = await _rodadas(cliente)
    assert (rodadas["atual"]["origem"], rodadas["anterior"]["origem"]) == ("gemini", "claude")


@pytest.mark.asyncio
async def test_o_gemini_pelo_agy_fica_registrado_como_quem_gerou(cliente, ia):
    """O Gemini pela assinatura (`agy -p`) entra pela rota do Claude com `provider=gemini`."""
    await _gerar_pelo_claude(cliente, ia, "Do Claude")
    ia.texto = "Do agy"

    resposta = await _no_limite(
        cliente.post("/api/claude/corte/c1/gerar-cenas", params={"provider": "gemini"})
    )

    assert resposta.status_code == 200, resposta.text
    rodadas = await _rodadas(cliente)
    assert _textos(rodadas["atual"]) == ["Do agy"]
    assert (rodadas["atual"]["origem"], rodadas["anterior"]["origem"]) == ("gemini", "claude")


@pytest.mark.asyncio
async def test_guarda_uma_rodada_so(cliente, ia):
    for texto in ("Primeira", "Segunda", "Terceira"):
        await _gerar_pelo_claude(cliente, ia, texto)

    rodadas = await _rodadas(cliente)

    assert _textos(rodadas["atual"]) == ["Terceira"]
    assert _textos(rodadas["anterior"]) == ["Segunda"]


@pytest.mark.asyncio
async def test_a_edicao_gravada_durante_a_geracao_entra_na_anterior(
    cliente, ia, fabrica, monkeypatch
):
    """A rodada que sai é a que está no banco na hora de gravar, não a que a geração leu."""
    await _gerar_pelo_claude(cliente, ia, "Original")
    gravar_se = origem_das_cenas._gravar_se
    editou = False

    async def editar_antes(db, corte_id, condicao, valores):
        nonlocal editou
        if not editou and "cenas_anteriores" in valores:
            editou = True
            await _editar(cliente, "Editada no meio")
        return await gravar_se(db, corte_id, condicao, valores)

    monkeypatch.setattr(origem_das_cenas, "_gravar_se", editar_antes)
    await _gerar_pelo_claude(cliente, ia, "Nova")

    rodadas = await _rodadas(cliente)
    assert editou
    assert _textos(rodadas["atual"]) == ["Nova"]
    assert _textos(rodadas["anterior"]) == ["Editada no meio"]


# ─── comparar ────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_sem_geracao_anterior_nao_ha_rodada_anterior(cliente, ia):
    await _gerar_pelo_claude(cliente, ia, "Única")

    rodadas = await _rodadas(cliente)

    assert rodadas["anterior"] is None
    assert [c["texto"] for c in rodadas["diferencas"]["entraram"]] == ["Única"]


@pytest.mark.asyncio
async def test_comparar_diz_o_que_mudou_na_cena(cliente, ia):
    await _gerar_pelo_claude(cliente, ia, "Antes")
    await _gerar_pelo_claude(cliente, ia, "Depois")

    diferencas = (await _rodadas(cliente))["diferencas"]

    assert diferencas["entraram"] == [] and diferencas["sairam"] == []
    [mudou] = diferencas["mudaram"]
    assert mudou["campos"] == ["texto"]
    assert (mudou["anterior"]["texto"], mudou["atual"]["texto"]) == ("Antes", "Depois")


@pytest.mark.asyncio
async def test_comparar_corte_que_nao_existe_e_404(cliente):
    resposta = await _no_limite(cliente.get("/api/cortes/nao-existe/cenas-remotion/rodadas"))

    assert resposta.status_code == 404
    assert resposta.json()["detail"] == "Corte nao encontrado"


# ─── desfazer ────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_desfazer_volta_a_anterior_e_desfazer_de_novo_refaz(cliente, ia, fabrica):
    await _importar(cliente, "Colada")
    await _no_limite(cliente.post("/api/cortes/c1/cenas-remotion/validar"))
    await _gerar_pelo_claude(cliente, ia, "Do Claude")

    desfeita = await _no_limite(cliente.post(_DESFAZER))

    assert desfeita.status_code == 200, desfeita.text
    rodadas = desfeita.json()
    assert _textos(rodadas["atual"]) == ["Colada"] and rodadas["atual"]["origem"] == "manual"
    assert rodadas["atual"]["validadas"], "a validação da rodada que voltou se perdeu"
    assert _textos(rodadas["anterior"]) == ["Do Claude"]
    corte = await _ler(fabrica)
    assert json.loads(corte.cenas_remotion)["cenas"][0]["texto"] == "Colada"
    assert corte.cenas_validadas == 1

    refeita = (await _no_limite(cliente.post(_DESFAZER))).json()

    assert _textos(refeita["atual"]) == ["Do Claude"] and not refeita["atual"]["validadas"]
    assert _textos(refeita["anterior"]) == ["Colada"] and refeita["anterior"]["validadas"]


@pytest.mark.asyncio
async def test_desfazer_sem_rodada_anterior_recusa(cliente, ia):
    await _gerar_pelo_claude(cliente, ia, "Única")

    resposta = await _no_limite(cliente.post(_DESFAZER))

    assert resposta.status_code == 400
    assert resposta.json()["detail"] == origem_das_cenas.SEM_RODADA_ANTERIOR


@pytest.mark.asyncio
async def test_desfazer_com_a_versao_que_a_tela_viu_passa(cliente, ia):
    await _gerar_pelo_claude(cliente, ia, "Antes")
    await _gerar_pelo_claude(cliente, ia, "Depois")
    versao = (await _rodadas(cliente))["versao"]

    resposta = await _no_limite(cliente.post(_DESFAZER, json={"versao": versao}))

    assert resposta.status_code == 200, resposta.text
    assert _textos(resposta.json()["atual"]) == ["Antes"]


@pytest.mark.asyncio
async def test_desfazer_sobre_a_versao_velha_recusa_e_nao_troca(cliente, ia, fabrica):
    await _gerar_pelo_claude(cliente, ia, "Antes")
    await _gerar_pelo_claude(cliente, ia, "Depois")
    versao = (await _rodadas(cliente))["versao"]
    await _editar(cliente, "Editada depois da comparação")

    resposta = await _no_limite(cliente.post(_DESFAZER, json={"versao": versao}))

    assert resposta.status_code == 400
    assert resposta.json()["detail"] == origem_das_cenas.CENAS_MUDARAM_AO_DESFAZER
    rodadas = await _rodadas(cliente)
    assert _textos(rodadas["atual"]) == ["Editada depois da comparação"]
    assert _textos(rodadas["anterior"]) == ["Antes"]


@pytest.mark.asyncio
async def test_gravacao_concorrente_durante_o_desfazer_recusa_e_nao_grava_por_cima(
    cliente, ia, monkeypatch
):
    """A edição grava entre a leitura e a gravação do desfazer: ela fica, a troca não."""
    await _gerar_pelo_claude(cliente, ia, "Antes")
    await _gerar_pelo_claude(cliente, ia, "Depois")
    gravar_se = origem_das_cenas._gravar_se

    async def editar_no_meio(db, corte_id, condicao, valores):
        await _editar(cliente, "Editada no meio")
        return await gravar_se(db, corte_id, condicao, valores)

    monkeypatch.setattr(origem_das_cenas, "_gravar_se", editar_no_meio)
    resposta = await _no_limite(cliente.post(_DESFAZER))
    monkeypatch.setattr(origem_das_cenas, "_gravar_se", gravar_se)

    assert resposta.status_code == 400
    assert resposta.json()["detail"] == origem_das_cenas.CENAS_MUDARAM_AO_DESFAZER
    rodadas = await _rodadas(cliente)
    assert _textos(rodadas["atual"]) == ["Editada no meio"]
    assert _textos(rodadas["anterior"]) == ["Antes"]


@pytest.mark.asyncio
async def test_desfazer_com_geracao_em_curso_recusa_e_a_geracao_guarda_a_anterior(cliente, ia):
    await _gerar_pelo_claude(cliente, ia, "Primeira")
    await _gerar_pelo_claude(cliente, ia, "Segunda")
    ia.texto, ia.presa = "Terceira", True
    ia.comecou.clear()
    geracao = asyncio.create_task(cliente.post("/api/claude/corte/c1/gerar-cenas"))
    await _no_limite(ia.comecou.wait())

    resposta = await _no_limite(cliente.post(_DESFAZER))

    assert resposta.status_code == 400
    assert "já estão sendo geradas" in resposta.json()["detail"]
    ia.solta.set()
    assert (await _no_limite(geracao)).status_code == 200
    rodadas = await _rodadas(cliente)
    assert _textos(rodadas["atual"]) == ["Terceira"]
    assert _textos(rodadas["anterior"]) == ["Segunda"]


@pytest.mark.asyncio
async def test_desfazer_corte_que_nao_existe_e_404(cliente):
    resposta = await _no_limite(
        cliente.post("/api/cortes/nao-existe/cenas-remotion/rodadas/desfazer")
    )

    assert resposta.status_code == 404
    assert resposta.json()["detail"] == "Corte nao encontrado"


# ─── a sincronia leva a rodada anterior junto ────────────────────────────────


@pytest.mark.asyncio
async def test_desfazer_depois_do_recorte_traz_a_cena_na_fala_de_agora(cliente, ia, fabrica):
    """RN-43: a anterior segue a frase como a atual; desfazer não a traz no lugar velho."""
    await _gerar_pelo_claude(cliente, ia, "Na frase")
    ia.frase = "palavra4"
    await _gerar_pelo_claude(cliente, ia, "Outra")
    tirou = await _no_limite(cliente.post("/api/cortes/c1/adicionar-desvio", json=_TRECHO))
    assert tirou.status_code == 200, tirou.text

    rodadas = (await _no_limite(cliente.post(_DESFAZER))).json()

    corte = await _ler(fabrica)
    frase = next(
        palavra["inicio_seg"]
        for fala in json.loads(corte.transcricao_final)
        for palavra in fala.get("palavras") or []
        if palavra["texto"] == "palavra40"
    )
    [cena] = rodadas["atual"]["cenas"]
    assert cena["texto"] == "Na frase"
    assert abs(cena["inicio"] - frase) <= _FOLGA_SEG, (
        f"a cena voltou em {cena['inicio']}s e a frase está em {frase}s"
    )
