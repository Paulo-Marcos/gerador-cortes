"""Pedir à IA o ajuste de uma cena só (D-1074).

O operador cita uma cena do plano e pede a mudança ("encurte para caber em duas linhas"),
sem gerar o plano de novo. A resposta é uma proposta: o card mostra o antes e o depois, e
só o Aceitar grava, e só aquela cena, se o plano ainda é o do pedido.

Só a IA é falsa. As rotas, o banco, a marca das cenas e o registro de cancelamento são os
de verdade, pelas portas HTTP que a Pós usa.
"""

from __future__ import annotations

import asyncio
import json

import httpx
import pytest
import pytest_asyncio
from app.database import get_db
from app.domain.corte.ajuste_da_cena import ETAPA_DO_AJUSTE
from app.models import Base, Corte, Projeto
from app.routers import claude_ia, cortes
from app.routers import origem_das_cenas as rota_das_cenas
from app.routers.errors import registrar_tratadores
from app.services import ajuste_da_cena as ajuste_module
from app.services import cenas_remotion as cenas_module
from app.services import corte as corte_module
from app.services import desvios as desvios_module
from app.services import origem_das_cenas
from app.services.canal import editorial_scaffolds, editorial_skills
from app.services.canal.editorial_skills import SkillResolvida
from app.services.cancelamento_jobs import TrabalhoEmVoo, cancelar_job
from app.services.corte import CorteService
from fastapi import FastAPI
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

_LIMITE_SEG = 5
_PALAVRAS = [f"palavra{i}" for i in range(200)]
_AJUSTE = "/api/claude/corte/c1/ajustar-cena"
_ACEITAR = "/api/cortes/c1/cenas-remotion/ajuste/aceitar"
_SKILL_DO_CANAL = "CORPO DA SKILL DE CENAS DO CANAL"

# A transcrição do corte (200 s): uma legenda a cada 4 s, de 4 palavras ("palavra0"..).
# A cena a ajustar fica em 20-24 s, na legenda [5] ("palavra20 ... palavra23").
_A_AJUSTAR = {
    "tipo": "enfase",
    "texto": "Uma frase longa demais para caber",
    "inicio": 20.0,
    "fim": 24.0,
    "layout_card": "horizontal",
}
_OUTRA = {"tipo": "barra_inferior", "texto": "Outra cena", "inicio": 40.0, "fim": 43.0}
_MANUAL = {"tipo": "barra_inferior", "texto": "Escrita à mão", "inicio": 8.0, "fim": 11.0}
_MANUAL["manual"] = True
_RISCADA = {"tipo": "enfase", "texto": "Fora do vídeo", "inicio": 50.0, "fim": 53.0}
_RISCADA["riscada"] = True


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


class GeradorFalso:
    """O provedor da IA: guarda o que recebeu e devolve a cena que o teste escolher."""

    def __init__(self, provider: str, ia: IaFalsa):
        self.provider = provider
        self.ia = ia

    def modelo(self, pedido):
        return pedido.modelo

    async def gerar_json(self, prompt, pedido):
        self.ia.chamadas.append({"provider": self.provider, "prompt": prompt, "pedido": pedido})
        if self.ia.segurar is not None:
            self.ia.chegou.set()
            await self.ia.segurar.wait()
        return {"formato": "cortes", "cenas": [dict(self.ia.resposta)]}


class IaFalsa:
    def __init__(self):
        self.chamadas: list[dict] = []
        # Mesma legenda e duração da cena enviada: o pedido não era sobre o tempo.
        self.resposta = {"tipo": "enfase", "startLeg": 5, "duracao_s": 4.0, "texto": "Curta"}
        self.segurar: asyncio.Event | None = None
        self.chegou = asyncio.Event()


@pytest.fixture
def ia(monkeypatch):
    falsa = IaFalsa()
    skill = SkillResolvida(
        key="cenas-expert",
        corpo=_SKILL_DO_CANAL,
        modelo="sonnet",
        thinking_tokens=0,
        timeout=60.0,
        lentes=[],
        modelo_gemini="gemini-falso",
    )
    monkeypatch.setattr(
        ajuste_module, "gerador_para", lambda provider: GeradorFalso(provider, falsa)
    )
    monkeypatch.setattr(editorial_skills, "resolver_skill", lambda *_a, **_k: skill)
    monkeypatch.setattr(
        editorial_scaffolds,
        "resolver_scaffold",
        lambda *_a, **_k: "SCAFFOLD DE CENAS DO CANAL\n{legendas_numeradas}",
    )
    monkeypatch.setattr(cenas_module, "CONTRATO_DA_ORIGEM", "")
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
    for modulo in (corte_module, cenas_module, desvios_module, origem_das_cenas, ajuste_module):
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
                fim_seg=300.0,
                status="aprovado",
                titulo_proposto="Corte",
            )
        )
        await db.commit()
    await CorteService.sincronizar_transcricao_corte("c1")
    await _semear_o_plano(f, origem="claude")
    yield f
    TrabalhoEmVoo.limpar()
    await engine.dispose()


async def _semear_o_plano(fabrica, *, origem: str) -> None:
    """O plano gerado e validado: a IA de `origem` gerou, o operador conferiu."""
    async with fabrica() as db:
        corte = await db.get(Corte, "c1")
        corte.cenas_remotion = json.dumps(
            {"formato": "cortes", "cenas": [_MANUAL, _A_AJUSTAR, _OUTRA, _RISCADA]},
            ensure_ascii=False,
        )
        corte.cenas_origem = origem
        corte.cenas_validadas = 1
        await db.commit()


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


def _pedido_de(cena: dict, pedido: str = "encurte para caber em duas linhas") -> dict:
    return {"tipo": cena["tipo"], "inicio": cena["inicio"], "pedido": pedido}


async def _pedir(
    cliente, cena: dict = _A_AJUSTAR, pedido: str = "encurte para caber em duas linhas"
):
    return await _no_limite(cliente.post(_AJUSTE, json=_pedido_de(cena, pedido)))


async def _gravado(fabrica) -> tuple[list[dict], int]:
    async with fabrica() as db:
        corte = await db.get(Corte, "c1", populate_existing=True)
        return json.loads(corte.cenas_remotion)["cenas"], corte.cenas_validadas


def _aceite(proposta: dict) -> dict:
    return {
        "versao": proposta["versao"],
        "tipo": proposta["antes"]["tipo"],
        "inicio": proposta["antes"]["inicio"],
        "depois": proposta["depois"],
    }


# ── O pedido devolve uma proposta e não grava ─────────────────────────────────


@pytest.mark.asyncio
async def test_o_pedido_devolve_o_antes_e_o_depois_sem_gravar(cliente, fabrica):
    resposta = await _pedir(cliente)

    assert resposta.status_code == 200, resposta.text
    proposta = resposta.json()
    assert proposta["antes"]["texto"] == _A_AJUSTAR["texto"]
    assert proposta["depois"]["texto"] == "Curta"
    assert proposta["provider"] == "claude"
    assert proposta["versao"]
    cenas, validadas = await _gravado(fabrica)
    assert [c["texto"] for c in cenas] == [
        "Escrita à mão",
        "Uma frase longa demais para caber",
        "Outra cena",
        "Fora do vídeo",
    ]
    assert validadas == 1


@pytest.mark.asyncio
async def test_o_pedido_leva_a_skill_e_o_scaffold_do_canal_a_fala_em_volta_e_a_cena(cliente, ia):
    await _pedir(cliente)

    [chamada] = ia.chamadas
    prompt = chamada["prompt"]
    assert chamada["pedido"].expertise == _SKILL_DO_CANAL
    assert "SCAFFOLD DE CENAS DO CANAL" in prompt
    # A fala em volta da cena entra; a do resto do corte, longe dela, não.
    assert "palavra20" in prompt
    assert "palavra120" not in prompt
    assert "Uma frase longa demais para caber" in prompt
    assert "encurte para caber em duas linhas" in prompt


@pytest.mark.asyncio
async def test_o_ajuste_conta_na_telemetria_numa_etapa_propria(cliente, ia):
    await _pedir(cliente)

    [chamada] = ia.chamadas
    assert chamada["pedido"].etapa == ETAPA_DO_AJUSTE == "ajuste-de-cena"
    assert chamada["pedido"].corte_id == "c1"


@pytest.mark.asyncio
async def test_pede_ao_gemini_quando_o_plano_atual_veio_do_gemini(cliente, fabrica, ia):
    await _semear_o_plano(fabrica, origem="gemini")

    resposta = await _pedir(cliente)

    assert resposta.json()["provider"] == "gemini"
    assert ia.chamadas[0]["provider"] == "gemini"


@pytest.mark.asyncio
async def test_pedido_sobre_o_texto_mantem_o_tempo_e_o_layout_que_o_operador_escolheu(cliente):
    depois = (await _pedir(cliente)).json()["depois"]

    assert (depois["inicio"], depois["fim"]) == (20.0, 24.0)
    assert depois["layout_card"] == "horizontal"
    assert not depois.get("manual")


@pytest.mark.asyncio
async def test_cena_que_volta_fora_do_corte_e_recusada(cliente, ia):
    ia.resposta = {"tipo": "enfase", "startLeg": 5, "duracao_s": 300.0, "texto": "Longa"}

    resposta = await _pedir(cliente)

    assert resposta.status_code == 400
    assert "fora do corte" in resposta.json()["detail"]


# ── Manual e riscada não recebem ajuste ───────────────────────────────────────


@pytest.mark.asyncio
@pytest.mark.parametrize(("cena", "trecho"), [(_MANUAL, "a IA não mexe"), (_RISCADA, "riscada")])
async def test_cena_manual_ou_riscada_nao_recebe_ajuste(cliente, ia, cena, trecho):
    resposta = await _pedir(cliente, cena)

    assert resposta.status_code == 400
    assert trecho in resposta.json()["detail"]
    assert ia.chamadas == []


@pytest.mark.asyncio
async def test_cena_que_nao_esta_no_plano_e_recusada_sem_chamar_a_ia(cliente, ia):
    resposta = await _pedir(cliente, {"tipo": "enfase", "inicio": 33.0})

    assert resposta.status_code == 400
    assert ia.chamadas == []


# ── Aceitar grava só aquela cena, com a guarda do plano ───────────────────────


@pytest.mark.asyncio
async def test_aceitar_grava_so_a_cena_ajustada_e_desfaz_a_validacao(cliente, fabrica):
    proposta = (await _pedir(cliente)).json()

    resposta = await _no_limite(cliente.post(_ACEITAR, json=_aceite(proposta)))

    assert resposta.status_code == 200, resposta.text
    cenas, validadas = await _gravado(fabrica)
    assert [c["texto"] for c in cenas] == ["Escrita à mão", "Curta", "Outra cena", "Fora do vídeo"]
    assert cenas[0] == _MANUAL
    assert cenas[2] == _OUTRA
    assert cenas[3] == _RISCADA
    assert validadas == 0


@pytest.mark.asyncio
async def test_aceitar_recusa_se_o_plano_mudou_desde_o_pedido(cliente, fabrica):
    proposta = (await _pedir(cliente)).json()
    outro_plano = {"cenas_remotion": {"formato": "cortes", "cenas": [_A_AJUSTAR, _OUTRA]}}
    salvo = await _no_limite(cliente.patch("/api/cortes/c1", json=outro_plano))
    assert salvo.status_code == 200, salvo.text

    resposta = await _no_limite(cliente.post(_ACEITAR, json=_aceite(proposta)))

    assert resposta.status_code == 400
    assert "mudou" in resposta.json()["detail"]
    cenas, _ = await _gravado(fabrica)
    assert [c["texto"] for c in cenas] == ["Uma frase longa demais para caber", "Outra cena"]


@pytest.mark.asyncio
async def test_descartar_nao_grava_nada(cliente, fabrica):
    """Descartar é só a tela esquecer a proposta: sem Aceitar, o banco fica como estava."""
    await _pedir(cliente)

    cenas, validadas = await _gravado(fabrica)
    assert cenas[1] == _A_AJUSTAR
    assert validadas == 1


# ── O ajuste e a geração do plano não correm juntos no corte ──────────────────


@pytest.mark.asyncio
async def test_com_um_ajuste_em_voo_a_geracao_do_plano_e_recusada(cliente, ia):
    ia.segurar = asyncio.Event()
    pedido = asyncio.create_task(_pedir(cliente))
    await _no_limite(ia.chegou.wait())

    geracao = await _no_limite(cliente.post("/api/claude/corte/c1/gerar-cenas"))
    outro_ajuste = await _pedir(cliente, _OUTRA)

    ia.segurar.set()
    assert (await pedido).status_code == 200
    assert geracao.status_code == 400
    assert "ajustada" in geracao.json()["detail"]
    assert outro_ajuste.status_code == 400
    assert len(ia.chamadas) == 1


@pytest.mark.asyncio
async def test_com_a_geracao_do_plano_em_voo_o_ajuste_e_recusado(cliente, ia):
    from app.services.cenas_em_geracao import reservar_ou_recusar

    with reservar_ou_recusar("c1"):
        resposta = await _pedir(cliente)

    assert resposta.status_code == 400
    assert "sendo geradas" in resposta.json()["detail"]
    assert ia.chamadas == []


# ── Cancelar ──────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_cancelar_interrompe_a_ia_responde_cancelado_e_solta_o_corte(cliente, fabrica, ia):
    ia.segurar = asyncio.Event()  # a IA nunca responde sozinha
    pedido = asyncio.create_task(_pedir(cliente))
    await _no_limite(ia.chegou.wait())

    desfecho = cancelar_job("ajuste:c1")
    resposta = await pedido

    assert desfecho["cancelado"] is True
    assert resposta.status_code == 400
    assert "cancelado" in resposta.json()["detail"]
    assert not TrabalhoEmVoo.em_voo("ajuste:c1")
    # O corte ficou livre: pedir de novo é aceito.
    ia.segurar = None
    assert (await _pedir(cliente)).status_code == 200
    cenas, _ = await _gravado(fabrica)
    assert cenas[1] == _A_AJUSTAR


# ── O uso da assinatura fica registrado ───────────────────────────────────────


@pytest.mark.asyncio
async def test_a_chamada_real_do_claude_grava_a_telemetria_com_a_etapa_do_ajuste(
    cliente, monkeypatch
):
    """Pelo cliente do Claude de verdade, sem o subprocesso: o registro de D-353 recebe a
    etapa própria, e a lista de chamadas por etapa conta quantos ajustes houve."""
    import dataclasses

    from app.infrastructure import claude_cli_client, llm_calls_store
    from app.infrastructure.gerador_ia import gerador_para

    gravados: list[dict] = []
    resposta_da_ia = {"cenas": [{"tipo": "enfase", "startLeg": 5, "duracao_s": 4.0, "texto": "C"}]}

    async def run_falso(_prompt, **_kw):
        return {"result": json.dumps(resposta_da_ia)}

    monkeypatch.setattr(ajuste_module, "gerador_para", gerador_para)
    monkeypatch.setattr(claude_cli_client, "_run", run_falso)
    monkeypatch.setattr(
        llm_calls_store,
        "gravar_llm_call",
        lambda registro, **_k: gravados.append(dataclasses.asdict(registro)) or "id",
    )

    resposta = await _pedir(cliente)

    assert resposta.status_code == 200, resposta.text
    assert [(g["etapa"], g["corte_id"], g["sucesso"]) for g in gravados] == [
        ("ajuste-de-cena", "c1", True)
    ]


@pytest.mark.asyncio
async def test_corte_que_nao_existe_responde_404(cliente, ia):
    resposta = await _no_limite(
        cliente.post("/api/claude/corte/nao-existe/ajustar-cena", json=_pedido_de(_A_AJUSTAR))
    )

    assert resposta.status_code == 404
    assert ia.chamadas == []


@pytest.mark.asyncio
async def test_resposta_que_omite_tipo_legenda_e_duracao_mantem_os_da_cena(cliente, ia):
    """RN-40: o que a IA omite fica como estava, também o tipo e o tempo (auditoria, rodada 1).

    Antes, a conversão completava o que faltava com os padrões dela: `{"texto": "Curta"}`
    virava `barra_inferior` em 0-5 s.
    """
    ia.resposta = {"texto": "Curta"}

    depois = (await _pedir(cliente)).json()["depois"]

    assert depois["texto"] == "Curta"
    assert depois["tipo"] == "enfase"
    assert (depois["inicio"], depois["fim"]) == (20.0, 24.0)
    assert depois["layout_card"] == "horizontal"


# ── As guardas do Aceitar, que a rota confere de novo (auditoria, rodada 1) ───


@pytest.mark.asyncio
@pytest.mark.parametrize(("cena", "trecho"), [(_MANUAL, "a IA não mexe"), (_RISCADA, "riscada")])
async def test_aceitar_recusa_cena_manual_ou_riscada_mesmo_com_a_versao_certa(
    cliente, fabrica, cena, trecho
):
    """A tela não oferece o ajuste nessas cenas; o servidor também não o grava."""
    proposta = (await _pedir(cliente)).json()
    alvo = {**_aceite(proposta), "tipo": cena["tipo"], "inicio": cena["inicio"]}

    resposta = await _no_limite(cliente.post(_ACEITAR, json=alvo))

    assert resposta.status_code == 400
    assert trecho in resposta.json()["detail"]
    cenas, validadas = await _gravado(fabrica)
    assert [_MANUAL, _A_AJUSTAR, _OUTRA, _RISCADA] == cenas
    assert validadas == 1


@pytest.mark.asyncio
async def test_aceitar_recusa_a_cena_que_chega_fora_do_corte(cliente, fabrica):
    proposta = (await _pedir(cliente)).json()
    fora = {
        **proposta["depois"],
        "inicio": 20.0,
        "fim": 400.0,
        "inicio_seg": 20.0,
        "fim_seg": 400.0,
    }

    resposta = await _no_limite(cliente.post(_ACEITAR, json={**_aceite(proposta), "depois": fora}))

    assert resposta.status_code == 400
    assert "fora do corte" in resposta.json()["detail"]
    cenas, _ = await _gravado(fabrica)
    assert cenas[1] == _A_AJUSTAR


@pytest.mark.asyncio
async def test_aceitar_recusa_se_o_plano_muda_entre_a_leitura_e_a_gravacao(
    cliente, fabrica, monkeypatch
):
    """A versão bate na leitura, mas outra aba grava antes do UPDATE: a gravação é
    condicional, recusa, e o que a outra aba gravou fica."""
    proposta = (await _pedir(cliente)).json()
    gravar_de_verdade = origem_das_cenas._gravar_se

    async def outra_aba_grava_antes(db, corte_id, condicao, valores):
        async with fabrica() as outra:
            corte = await outra.get(Corte, "c1", populate_existing=True)
            plano = json.loads(corte.cenas_remotion)
            plano["cenas"][2] = {**_OUTRA, "texto": "Gravada por outra aba"}
            corte.cenas_remotion = json.dumps(plano, ensure_ascii=False)
            await outra.commit()
        return await gravar_de_verdade(db, corte_id, condicao, valores)

    monkeypatch.setattr(origem_das_cenas, "_gravar_se", outra_aba_grava_antes)

    resposta = await _no_limite(cliente.post(_ACEITAR, json=_aceite(proposta)))

    assert resposta.status_code == 400
    assert "mudou" in resposta.json()["detail"]
    cenas, _ = await _gravado(fabrica)
    assert cenas[1] == _A_AJUSTAR
    assert cenas[2]["texto"] == "Gravada por outra aba"
