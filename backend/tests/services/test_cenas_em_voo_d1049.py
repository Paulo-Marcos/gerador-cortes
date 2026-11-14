"""A cena cai na frase que a IA escolheu, mesmo com o corte mudando no meio (D-1049, RN-43).

A IA recebe legendas numeradas e devolve o NÚMERO da legenda. A importação convertia esse
número contra a transcrição do momento: se o operador tirasse um trecho enquanto a IA
pensava, o número apontava outra fala e a cena saía fora do tempo, sem aviso (42 s contra
30 s, medido aqui). Agora ela converte contra o que a IA leu e leva a cena para a de agora.

Só a IA é falsa. Ela escolhe a legenda pela frase, como a real, e fica presa até o teste
soltar: é o que deixa provar o que acontece DURANTE a geração.
"""

from __future__ import annotations

import asyncio
import json
import re

import httpx
import pytest
import pytest_asyncio
from app.database import get_db
from app.domain.corte.ancora_da_cena import levar_cenas_geradas
from app.infrastructure import gemini_client
from app.models import Base, Corte, Projeto
from app.routers import claude_ia, cortes, riscados
from app.routers.errors import registrar_tratadores
from app.services import arranjo as arranjo_module
from app.services import bruto_do_corte, origem_das_cenas
from app.services import cenas_remotion as cenas_module
from app.services import corte as corte_module
from app.services import desvios as desvios_module
from app.services import diarizacao as diarizacao_module
from app.services import riscados as riscados_module
from app.services.canal import editorial_scaffolds, editorial_skills, modelos_ia
from app.services.cenas_em_geracao import esta_gerando, reservar
from app.services.claude_ia import ClaudeIaService
from app.services.corte import CorteService
from app.services.export import ExportService
from fastapi import FastAPI
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

_PALAVRAS = [f"palavra{i}" for i in range(60)]
_FRASE_DA_CENA = "palavra40"
_LIMITE_SEG = 5
_FOLGA_SEG = 2.0
# Trecho de 110 a 120 s da live: 10 s antes da frase da cena, que está em 140 s.
_DESVIO = {"inicio_seg": 110.0, "fim_seg": 120.0, "inicio_hms": "00:01:50", "fim_hms": "00:02:00"}
_TRECHO = {"inicio_hms": "00:01:50", "fim_hms": "00:02:00", "motivo": "enrolação"}
_TRECHO_DA_FRASE = {
    "inicio_hms": "00:02:18",
    "fim_hms": "00:02:26",
    "inicio_seg": 138.0,
    "fim_seg": 146.0,
}


def _transcricao_da_live(*, com_palavras: bool = True, deslocar: float = 0.0) -> list[dict]:
    segmentos = []
    for i in range(0, len(_PALAVRAS), 4):
        inicio = 100.0 + i + deslocar
        segmento = {
            "start": inicio,
            "end": inicio + 4,
            "texto": " ".join(_PALAVRAS[i : i + 4]),
        }
        if com_palavras:
            segmento["palavras"] = [
                {"texto": palavra, "inicio_seg": inicio + j, "fim_seg": inicio + j + 1}
                for j, palavra in enumerate(_PALAVRAS[i : i + 4])
            ]
        segmentos.append(segmento)
    return segmentos


class IaPresa:
    """A IA das cenas: lê as legendas do prompt, escolhe a da frase e espera o teste."""

    def __init__(self):
        self.comecou = asyncio.Event()
        self.solta = asyncio.Event()
        self.chamadas = 0

    async def responder(self, prompt: str) -> dict:
        self.chamadas += 1
        achada = re.search(rf"^\[(\d+)\][^\n]*\b{_FRASE_DA_CENA}\b", prompt, re.MULTILINE)
        assert achada, f"a frase não está nas legendas do prompt:\n{prompt}"
        self.comecou.set()
        await self.solta.wait()
        cena = {"tipo": "enfase", "texto": "Tese", "startLeg": int(achada.group(1)), "duracao_s": 3}
        return {"cenas": [cena]}


@pytest.fixture
def ia(monkeypatch):
    presa = IaPresa()

    async def gerar_json(_provider, prompt, *_a, **_k):
        return await presa.responder(prompt)

    async def gemini(_modelo, prompt, **_k):
        return await presa.responder(prompt)

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
    yield presa
    presa.solta.set()


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
    for modulo in (
        corte_module,
        cenas_module,
        desvios_module,
        arranjo_module,
        riscados_module,
        origem_das_cenas,
        diarizacao_module,
    ):
        monkeypatch.setattr(modulo, "AsyncSessionLocal", f)
    async with f() as db:
        db.add(
            Projeto(id="p1", youtube_url="u", transcricao_raw=json.dumps(_transcricao_da_live()))
        )
        for numero, (corte_id, inicio, fim) in enumerate(
            (("c1", 100.0, 160.0), ("c2", 160.0, 200.0)), 1
        ):
            db.add(
                Corte(
                    id=corte_id,
                    projeto_id="p1",
                    numero=numero,
                    inicio_seg=inicio,
                    fim_seg=fim,
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
    app.include_router(riscados.router, prefix="/api/cortes")
    app.dependency_overrides[get_db] = banco
    transporte = httpx.ASGITransport(app=app, raise_app_exceptions=False)
    async with httpx.AsyncClient(transport=transporte, base_url="http://teste") as http:
        yield http


async def _no_limite(aguardavel):
    return await asyncio.wait_for(aguardavel, _LIMITE_SEG)


async def _gravar(fabrica, **campos) -> None:
    async with fabrica() as db:
        corte = await db.get(Corte, "c1")
        for campo, valor in campos.items():
            setattr(corte, campo, valor)
        await db.commit()


async def _ler(fabrica) -> Corte:
    async with fabrica() as db:
        return await db.get(Corte, "c1")


def _tempo_da_frase(corte: Corte) -> float:
    """Em que segundo do corte, como ele está agora, a frase é dita."""
    for fala in json.loads(corte.transcricao_final):
        for palavra in fala.get("palavras") or []:
            if palavra["texto"] == _FRASE_DA_CENA:
                return float(palavra["inicio_seg"])
    raise AssertionError("a frase saiu do corte")


def _cena_gravada(corte: Corte) -> dict:
    cenas = json.loads(corte.cenas_remotion)["cenas"]
    assert len(cenas) == 1, cenas
    return cenas[0]


async def _conferir_na_frase(fabrica) -> None:
    corte = await _ler(fabrica)
    inicio, frase = float(_cena_gravada(corte)["inicio"]), _tempo_da_frase(corte)
    assert abs(inicio - frase) <= _FOLGA_SEG, (
        f"a cena está em {inicio}s e a frase em {frase}s: fora do tempo, sem aviso"
    )


async def _gerar_presa(cliente, ia, corte_id="c1"):
    geracao = asyncio.create_task(cliente.post(f"/api/claude/corte/{corte_id}/gerar-cenas"))
    await _no_limite(ia.comecou.wait())
    return geracao


async def _terminar(ia, geracao) -> None:
    ia.solta.set()
    resposta = await _no_limite(geracao)
    assert resposta.status_code == 200, resposta.text


async def _ja_com_o_trecho(fabrica) -> None:
    """O corte entra na geração com o trecho já tirado, para as rotas que o devolvem."""
    await _gravar(fabrica, desvios=json.dumps([_DESVIO]))
    await CorteService.sincronizar_transcricao_corte("c1")


# ─── toda rota do editor que reescreve: nada recusa e a cena acompanha ───────


_EDICOES_QUE_TIRAM_O_TRECHO = {
    "adicionar-desvio": ("POST", "/api/cortes/c1/adicionar-desvio", {"json": _TRECHO}),
    "patch-desvios": ("PATCH", "/api/cortes/c1", {"json": {"desvios": [_DESVIO]}}),
    "desvios-importar": (
        "POST",
        "/api/cortes/c1/desvios/importar",
        {"json": {"trechos": [_TRECHO]}},
    ),
    "patch-inicio": ("PATCH", "/api/cortes/c1", {"json": {"inicio_seg": 110.0}}),
}


@pytest.mark.asyncio
@pytest.mark.parametrize("edicao", list(_EDICOES_QUE_TIRAM_O_TRECHO))
async def test_a_edicao_passa_e_a_cena_acompanha(cliente, ia, fabrica, edicao):
    metodo, url, corpo = _EDICOES_QUE_TIRAM_O_TRECHO[edicao]
    antes = (await _ler(fabrica)).transcricao_final
    geracao = await _gerar_presa(cliente, ia)

    resposta = await _no_limite(cliente.request(metodo, url, **corpo))

    assert resposta.status_code == 200, resposta.text
    assert (await _ler(fabrica)).transcricao_final != antes, "a edição não mudou a transcrição"
    await _terminar(ia, geracao)
    await _conferir_na_frase(fabrica)


@pytest.mark.asyncio
@pytest.mark.parametrize("rota", ["remover-desvio", "restaurar", "desfazer"])
async def test_devolver_o_trecho_tambem_leva_a_cena(cliente, ia, fabrica, rota):
    await _ja_com_o_trecho(fabrica)
    if rota == "remover-desvio":
        pedido = ("/api/cortes/c1/remover-desvio", {"desvio_index": 0})
    elif rota == "restaurar":
        await _no_limite(cliente.post("/api/cortes/c1/remover-desvio", json={"desvio_index": 0}))
        pedido = ("/api/cortes/c1/restaurar-desvio", {"riscado_index": 0})
    else:
        rodada = {**_DESVIO, "origem": "claude", "rodada": 1, "borda_da_rodada": [110.0, 120.0]}
        await _gravar(fabrica, desvios=json.dumps([rodada]))
        await CorteService.sincronizar_transcricao_corte("c1")
        pedido = ("/api/cortes/c1/desfazer-rodada", None)
    antes = (await _ler(fabrica)).transcricao_final
    geracao = await _gerar_presa(cliente, ia)

    resposta = await _no_limite(cliente.post(pedido[0], json=pedido[1]))

    assert resposta.status_code == 200, resposta.text
    assert (await _ler(fabrica)).transcricao_final != antes
    await _terminar(ia, geracao)
    await _conferir_na_frase(fabrica)


@pytest.mark.asyncio
async def test_criar_corte_do_trecho_leva_a_cena_do_original(cliente, ia, fabrica):
    await _ja_com_o_trecho(fabrica)
    geracao = await _gerar_presa(cliente, ia)

    resposta = await _no_limite(
        cliente.post("/api/cortes/c1/corte-do-desvio", json={"desvio_index": 0, "titulo": "Novo"})
    )

    assert resposta.status_code == 200, resposta.text
    await _terminar(ia, geracao)
    await _conferir_na_frase(fabrica)


@pytest.mark.asyncio
async def test_mexer_nos_blocos_leva_a_cena(cliente, ia, fabrica):
    assert (
        await cliente.post("/api/cortes/c1/arranjo/dividir", json={"ponto_seg": 130.0})
    ).status_code == 200
    geracao = await _gerar_presa(cliente, ia)

    resposta = await _no_limite(
        cliente.post("/api/cortes/c1/arranjo/mover", json={"de_indice": 1, "para_indice": 0})
    )

    assert resposta.status_code == 200, resposta.text
    await _terminar(ia, geracao)
    await _conferir_na_frase(fabrica)


@pytest.mark.asyncio
async def test_analise_de_silencios_em_voo_leva_a_cena(cliente, ia, fabrica, monkeypatch):
    # A rota real, sem o FFmpeg: um silêncio de 10 s antes da frase.
    async def silencedetect(*_a, **_k):
        return type(
            "R", (), {"stderr": "silence_start: 10.0\nsilence_end: 20.0\n", "returncode": 0}
        )()

    async def proxy(*_a, **_k):
        return "inexistente.flac"

    monkeypatch.setattr("app.infrastructure.ffmpeg_runner.run_ffmpeg_simple", silencedetect)
    monkeypatch.setattr("app.services.media_proxy.MediaProxyService.gerar_audio_proxy", proxy)
    monkeypatch.setattr(
        "app.services.media_proxy.MediaProxyService.contexto_seg", lambda: (0.0, 0.0)
    )
    monkeypatch.setattr("app.core.channel_paths.resolver_do_projeto", lambda *_a, **_k: "video.mkv")
    antes = (await _ler(fabrica)).transcricao_final
    geracao = await _gerar_presa(cliente, ia)

    resposta = await _no_limite(cliente.post("/api/cortes/c1/analisar-desvios"))

    assert resposta.status_code == 200, resposta.text
    assert (await _ler(fabrica)).transcricao_final != antes, "o silêncio não reescreveu"
    await _terminar(ia, geracao)
    await _conferir_na_frase(fabrica)


@pytest.mark.asyncio
async def test_a_transcricao_do_projeto_refeita_em_voo_leva_a_cena(cliente, ia, fabrica):
    # Rotas do projeto (refazer transcrição, sincronia da legenda): não há corte a recusar.
    geracao = await _gerar_presa(cliente, ia)

    async with fabrica() as db:
        projeto = await db.get(Projeto, "p1")
        projeto.transcricao_raw = json.dumps(_transcricao_da_live(deslocar=5.0))
        await db.commit()
        await CorteService.sincronizar_transcricao_do_projeto("p1", db)

    await _terminar(ia, geracao)
    await _conferir_na_frase(fabrica)


# ─── quem começou ANTES das cenas: nenhuma recusa na porta pegaria ───────────


@pytest.mark.asyncio
async def test_gerar_trechos_iniciado_antes_das_cenas_leva_a_cena(
    cliente, ia, fabrica, monkeypatch
):
    comecou, solta = asyncio.Event(), asyncio.Event()

    async def gerar_desvios(*_a, **_k):
        comecou.set()
        await solta.wait()
        return {"desvios": [{"inicio_seg": 110.0, "fim_seg": 120.0, "motivo": "enrolação"}]}

    monkeypatch.setattr(ClaudeIaService, "gerar_desvios", gerar_desvios)
    trechos = asyncio.create_task(cliente.post("/api/claude/corte/c1/gerar-trechos"))
    await _no_limite(comecou.wait())
    antes = (await _ler(fabrica)).transcricao_final
    geracao = await _gerar_presa(cliente, ia)

    solta.set()
    resposta = await _no_limite(trechos)

    assert resposta.status_code == 200, resposta.text
    assert (await _ler(fabrica)).transcricao_final != antes, "os trechos não reescreveram"
    await _terminar(ia, geracao)
    await _conferir_na_frase(fabrica)


# ─── as duas gravações no mesmo instante ─────────────────────────────────────


@pytest.mark.asyncio
async def test_a_transcricao_que_muda_na_hora_de_gravar_leva_a_cena(
    cliente, ia, fabrica, monkeypatch
):
    # Entre ler a transcrição e gravar as cenas, a edição entra: sem o `where`, a cena
    # ficaria na transcrição de um instante atrás.
    execute_real, editou = AsyncSession.execute, []

    async def editar_antes_de_gravar(self, comando, *a, **k):
        if getattr(comando, "is_update", False) and not editou:
            editou.append(True)
            await _gravar(fabrica, desvios=json.dumps([_DESVIO]))
            await CorteService.sincronizar_transcricao_corte("c1")
        return await execute_real(self, comando, *a, **k)

    monkeypatch.setattr(AsyncSession, "execute", editar_antes_de_gravar)
    geracao = await _gerar_presa(cliente, ia)

    await _terminar(ia, geracao)

    assert editou, "a edição não entrou na hora de gravar"
    await _conferir_na_frase(fabrica)


@pytest.mark.asyncio
async def test_a_sincronia_em_voo_nao_apaga_as_cenas_recem_gravadas(
    cliente, ia, fabrica, monkeypatch
):
    # A sincronia já leu o corte quando a geração grava: sem reler antes de levar as cenas,
    # ela gravaria as antigas por cima das novas.
    velhas = {"formato": "cortes", "cenas": [{"tipo": "enfase", "inicio": 5.0, "fim": 8.0}]}
    await _gravar(fabrica, cenas_remotion=json.dumps(velhas), desvios=json.dumps([_DESVIO]))
    na_sincronia, solta = asyncio.Event(), asyncio.Event()
    original = corte_module._transcricao_da_live

    async def transcricao_presa(db, projeto_id):
        lida = await original(db, projeto_id)
        na_sincronia.set()
        await solta.wait()
        return lida

    monkeypatch.setattr(corte_module, "_transcricao_da_live", transcricao_presa)
    sincronia = asyncio.create_task(CorteService.sincronizar_transcricao_corte("c1"))
    await _no_limite(na_sincronia.wait())
    monkeypatch.setattr(corte_module, "_transcricao_da_live", original)
    geracao = await _gerar_presa(cliente, ia)
    await _terminar(ia, geracao)

    solta.set()
    await _no_limite(sincronia)

    corte = await _ler(fabrica)
    assert _cena_gravada(corte)["inicio"] != 5.0, "a sincronia gravou as cenas velhas por cima"
    await _conferir_na_frase(fabrica)


_CENA_QUE_SE_MOVE = {
    "formato": "cortes",
    "cenas": [{"tipo": "enfase", "inicio": 25.0, "fim": 28.0}],
}


@pytest.mark.parametrize(
    "cenas_antes",
    [{}, {"cenas_remotion": json.dumps(_CENA_QUE_SE_MOVE)}],
    ids=["sem_cenas", "com_cena_que_se_move"],
)
@pytest.mark.asyncio
async def test_a_geracao_que_grava_entre_a_leitura_e_a_gravacao_da_sincronia_acompanha(
    cenas_antes, cliente, ia, fabrica, monkeypatch
):
    # A janela estreita: a sincronia já releu o corte, e a geração grava antes de ela gravar.
    # Com cena que se move, as velhas voltavam por cima; sem cena, a nova ficava para trás.
    await _gravar(fabrica, **cenas_antes, desvios=json.dumps([_DESVIO]))
    geracao = await _gerar_presa(cliente, ia)
    reler, gravar_sincronia = AsyncSession.refresh, corte_module._gravar_sincronia
    estado = {"gravando": False, "cruzou": False}

    async def gravar_marcando(*args, **kwargs):
        estado["gravando"] = True
        return await gravar_sincronia(*args, **kwargs)

    async def reler_e_deixar_a_geracao_gravar(self, *args, **kwargs):
        await reler(self, *args, **kwargs)
        if estado["gravando"] and not estado["cruzou"]:
            estado["cruzou"] = True
            await _terminar(ia, geracao)

    monkeypatch.setattr(corte_module, "_gravar_sincronia", gravar_marcando)
    monkeypatch.setattr(AsyncSession, "refresh", reler_e_deixar_a_geracao_gravar)

    await CorteService.sincronizar_transcricao_corte("c1")

    assert estado["cruzou"], "a geração não gravou na janela"
    # A sincronia não pode desistir: a transcrição nova precisa ter sido gravada.
    assert _tempo_da_frase(await _ler(fabrica)) == pytest.approx(30.0, abs=_FOLGA_SEG)
    await _conferir_na_frase(fabrica)


# ─── quando a cena NÃO acompanha: fica onde está, e avisa ────────────────────


@pytest.mark.asyncio
async def test_a_frase_que_saiu_do_corte_avisa_e_desfaz_a_validacao(cliente, ia, fabrica):
    await _gravar(fabrica, cenas_validadas=1)
    geracao = await _gerar_presa(cliente, ia)

    resposta = await _no_limite(
        cliente.patch("/api/cortes/c1", json={"desvios": [_TRECHO_DA_FRASE]})
    )

    assert resposta.status_code == 200, resposta.text
    await _terminar(ia, geracao)
    corte = await _ler(fabrica)
    cena = _cena_gravada(corte)
    assert cena["inicio"] == 40.0, "ficou onde a IA pôs"
    assert cena["ancora_perdida"] is True
    assert corte.cenas_validadas == 0
    avisos = await origem_das_cenas.conferir("c1")
    assert [a["codigo"] for a in avisos if a["inicio"] == 40.0] == ["frase_saiu_do_corte"]


@pytest.mark.asyncio
async def test_a_frase_que_some_ate_da_live_tambem_avisa(cliente, ia, fabrica):
    # Nas gravadas, transcrição refeita não é recorte e não avisa. Aqui a cena acabou de
    # nascer e ninguém a viu: calar deixaria uma cena errada sem nenhum sinal.
    geracao = await _gerar_presa(cliente, ia)
    outra = [
        {
            **fala,
            "texto": "outra fala",
            "palavras": [
                {"texto": f"nova{fala['start']:.0f}x{j}", "inicio_seg": fala["start"] + j}
                for j in range(4)
            ],
        }
        for fala in _transcricao_da_live()
    ]

    async with fabrica() as db:
        (await db.get(Projeto, "p1")).transcricao_raw = json.dumps(outra)
        await db.commit()
    await CorteService.sincronizar_transcricao_corte("c1")

    await _terminar(ia, geracao)
    assert _cena_gravada(await _ler(fabrica))["ancora_perdida"] is True


@pytest.mark.asyncio
async def test_a_cena_alem_da_borda_nova_nao_some_calada(cliente, ia, fabrica):
    # O teto do descarte é o do corte que a IA leu: a borda nova não apaga a cena sem aviso.
    geracao = await _gerar_presa(cliente, ia)

    resposta = await _no_limite(cliente.patch("/api/cortes/c1", json={"fim_seg": 130.0}))

    assert resposta.status_code == 200, resposta.text
    await _terminar(ia, geracao)
    assert _cena_gravada(await _ler(fabrica))["ancora_perdida"] is True


def _resultado() -> dict:
    return {"formato": "cortes", "cenas": [{"tipo": "enfase", "inicio": 40.0, "fim": 43.0}]}


def test_sem_tempo_por_palavra_nao_ha_como_alinhar_e_a_cena_avisa():
    lida = json.dumps(_transcricao_da_live(com_palavras=False))
    atual = json.dumps(_transcricao_da_live(com_palavras=False, deslocar=-10.0))

    cenas = levar_cenas_geradas(_resultado(), lida, atual)["cenas"]

    assert cenas[0]["ancora_perdida"] is True
    assert cenas[0]["inicio"] == 40.0


def test_sem_tempo_por_palavra_e_mesma_fala_nao_ha_aviso():
    # Só a diarização mudou a transcrição: nenhuma cena saiu do lugar.
    lida = _transcricao_da_live(com_palavras=False)
    atual = [{**s, "speaker": "A"} for s in lida]

    cenas = levar_cenas_geradas(_resultado(), json.dumps(lida), json.dumps(atual))["cenas"]

    assert "ancora_perdida" not in cenas[0]


def test_a_abertura_fica_no_comeco_sem_aviso():
    # RN-43: a abertura (até 1 s) pertence ao começo do corte, não a uma frase.
    resultado = {"cenas": [{"tipo": "pergunta_transicao", "inicio": 0.0, "fim": 3.0}]}
    lida = json.dumps(_transcricao_da_live(com_palavras=False))
    atual = json.dumps(_transcricao_da_live(com_palavras=False, deslocar=-10.0))

    assert "ancora_perdida" not in levar_cenas_geradas(resultado, lida, atual)["cenas"][0]


def test_mesma_transcricao_nao_mexe_nas_cenas():
    lida = json.dumps(_transcricao_da_live())
    assert levar_cenas_geradas(_resultado(), lida, lida) == _resultado()


# ─── dividir e juntar: as únicas edições que esperam ─────────────────────────


@pytest.mark.asyncio
async def test_dividir_com_cenas_em_voo_recusa(cliente, ia, fabrica):
    geracao = await _gerar_presa(cliente, ia)

    resposta = await _no_limite(cliente.post("/api/cortes/c1/dividir", json={"ponto_seg": 130.0}))

    assert resposta.status_code == 400
    assert "dividir ou juntar" in resposta.json()["detail"]
    assert (await _ler(fabrica)).fim_seg == 160.0, "não dividiu"
    await _terminar(ia, geracao)
    assert (
        await cliente.post("/api/cortes/c1/dividir", json={"ponto_seg": 130.0})
    ).status_code == 200


@pytest.mark.asyncio
@pytest.mark.parametrize(("pedido", "em_voo"), [("c1", "c1"), ("c1", "c2"), ("c2", "c1")])
async def test_juntar_com_cenas_em_voo_recusa_dos_dois_lados(pedido, em_voo, cliente, fabrica):
    outro = "c2" if pedido == "c1" else "c1"
    reserva = reservar(em_voo)
    try:
        resposta = await cliente.post(
            f"/api/cortes/{pedido}/juntar", json={"outro_corte_id": outro}
        )
    finally:
        reserva.liberar()

    assert resposta.status_code == 400
    assert "dividir ou juntar" in resposta.json()["detail"]
    async with fabrica() as db:
        assert await db.get(Corte, "c2") is not None, "não juntou"


@pytest.mark.asyncio
async def test_o_bruto_sem_cenas_nao_recusa_dividir(cliente, fabrica):
    # A exceção é só das cenas: o bruto que não as gera não prende o editor.
    reserva = reservar("c1", gera_cenas=False)
    try:
        resposta = await cliente.post("/api/cortes/c1/dividir", json={"ponto_seg": 130.0})
    finally:
        reserva.liberar()

    assert resposta.status_code == 200, resposta.text


# ─── o Gemini reserva a marca e também leva a cena ───────────────────────────


@pytest.mark.asyncio
async def test_o_gemini_reserva_a_marca_e_leva_a_cena(cliente, ia, fabrica):
    gemini = asyncio.create_task(cliente.post("/api/cortes/c1/gerar-cenas-remotion"))
    await _no_limite(ia.comecou.wait())
    assert esta_gerando("c1"), "o Gemini não segurou a marca"

    outro = await _no_limite(cliente.post("/api/claude/corte/c1/gerar-cenas"))
    segundo = await _no_limite(cliente.post("/api/cortes/c1/gerar-cenas-remotion"))
    edicao = await _no_limite(cliente.post("/api/cortes/c1/adicionar-desvio", json=_TRECHO))

    assert outro.status_code == 400 and segundo.status_code == 400
    assert "já estão sendo geradas" in segundo.json()["detail"]
    assert edicao.status_code == 200, edicao.text
    assert ia.chamadas == 1
    await _terminar(ia, gemini)
    assert not esta_gerando("c1"), "a marca ficou presa"
    await _conferir_na_frase(fabrica)


@pytest.mark.asyncio
async def test_o_gemini_registra_que_salvou_e_devolve_as_cenas(cliente, ia, fabrica, monkeypatch):
    registros = []
    monkeypatch.setattr(
        cenas_module, "operational_info", lambda _origem, texto: registros.append(texto)
    )
    gemini = asyncio.create_task(cliente.post("/api/cortes/c1/gerar-cenas-remotion"))
    await _no_limite(ia.comecou.wait())

    ia.solta.set()
    resposta = await _no_limite(gemini)

    assert resposta.status_code == 200, resposta.text
    assert any("Cenas salvas" in texto for texto in registros), registros
    assert resposta.json()["cenas"] == json.loads((await _ler(fabrica)).cenas_remotion)["cenas"]


@pytest.mark.asyncio
async def test_o_gemini_recusado_nao_chama_a_ia_e_nao_prende_a_marca(cliente, ia):
    geracao = await _gerar_presa(cliente, ia)

    resposta = await _no_limite(cliente.post("/api/cortes/c1/gerar-cenas-remotion"))

    assert resposta.status_code == 400
    assert ia.chamadas == 1
    await _terminar(ia, geracao)
    assert not esta_gerando("c1")


@pytest.mark.asyncio
async def test_o_gemini_que_falha_solta_a_marca(cliente, monkeypatch, ia):
    async def falha(*_a, **_k):
        raise RuntimeError("Gemini fora")

    monkeypatch.setattr(gemini_client, "generate_json", falha)

    resposta = await _no_limite(cliente.post("/api/cortes/c1/gerar-cenas-remotion"))

    assert resposta.status_code == 500
    assert not esta_gerando("c1")


@pytest.mark.asyncio
async def test_o_gemini_espera_o_bruto_da_tela(cliente, ia):
    ExportService.set_tarefa_corte_status("c1", "cortando")
    try:
        resposta = await _no_limite(cliente.post("/api/cortes/c1/gerar-cenas-remotion"))
    finally:
        ExportService.set_tarefa_corte_status("c1", "pronto")

    assert resposta.status_code == 400
    assert resposta.json()["detail"] == bruto_do_corte.CENAS_ESPERAM_O_BRUTO
    assert ia.chamadas == 0


# ─── o import manual recusa com a marca ocupada ──────────────────────────────


def _importar(cliente, corte_id="c1"):
    corpo = {"cenas": [{"tipo": "enfase", "texto": "Tese", "startLeg": 0, "duracao_s": 3}]}
    return cliente.post(f"/api/cortes/{corte_id}/cenas-remotion/importar", json=corpo)


@pytest.mark.asyncio
async def test_o_import_manual_recusa_com_as_cenas_em_voo(cliente, ia, fabrica):
    geracao = await _gerar_presa(cliente, ia)

    resposta = await _no_limite(_importar(cliente))

    assert resposta.status_code == 400
    assert "já estão sendo geradas" in resposta.json()["detail"]
    await _terminar(ia, geracao)
    assert _cena_gravada(await _ler(fabrica))["texto"] == "Tese"


@pytest.mark.asyncio
async def test_o_import_manual_recusa_com_o_bruto_da_fabrica(cliente):
    reserva = reservar("c1", gera_cenas=False)
    try:
        resposta = await _no_limite(_importar(cliente))
    finally:
        reserva.liberar()

    assert resposta.status_code == 400
    assert resposta.json()["detail"] == bruto_do_corte.CENAS_ESPERAM_O_BRUTO


@pytest.mark.asyncio
async def test_o_import_manual_passa_com_a_marca_livre_e_a_solta(cliente, fabrica):
    resposta = await _no_limite(_importar(cliente))

    assert resposta.status_code == 200, resposta.text
    assert not esta_gerando("c1")
    assert (await _ler(fabrica)).cenas_remotion


@pytest.mark.asyncio
async def test_o_import_manual_invalido_solta_a_marca(cliente, fabrica):
    await _gravar(fabrica, transcricao_final="[]")

    resposta = await _no_limite(_importar(cliente))

    assert resposta.status_code == 400
    assert not esta_gerando("c1")


# ─── o resto do contrato ─────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_o_prompt_da_rota_nao_leva_a_transcricao_lida(cliente):
    resposta = await cliente.get("/api/cortes/c1/cenas-remotion/prompt")

    assert resposta.status_code == 200, resposta.text
    assert "leitura" not in resposta.json()


@pytest.mark.asyncio
async def test_o_corte_apagado_durante_a_geracao_nao_grava_e_avisa(cliente, ia, fabrica):
    geracao = await _gerar_presa(cliente, ia)

    async with fabrica() as db:
        await db.delete(await db.get(Corte, "c1"))
        await db.commit()
    ia.solta.set()
    resposta = await _no_limite(geracao)

    assert resposta.status_code == 400
    assert "não encontrado" in resposta.json()["detail"]
    assert not esta_gerando("c1")
