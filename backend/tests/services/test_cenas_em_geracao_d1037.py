"""A mesma geração de cenas não se paga duas vezes (D-1037).

Cada geração custa cerca de US$ 0,33 e 256 s na mediana (medição de 29/08), e
havia dois caminhos para pagá-la de novo: a Pós mostrava "Gerar cenas" livre
enquanto a cadeia do bruto gerava, e ao trocar de corte e voltar. A rota não
recusava nada.

A IA nunca é chamada: `_gerar_cenas` vira uma geração "presa", que só termina
quando o teste solta. É o que deixa provar o que acontece DURANTE ela.
"""

from __future__ import annotations

import asyncio
import inspect
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor

import httpx
import pytest
import pytest_asyncio
from app.core.tarefas_ativas import TarefasAtivas
from app.database import get_db
from app.domain.compartilhado.erros import PedidoInvalido
from app.models import Base, Corte, Projeto
from app.routers import claude_ia, cortes, export
from app.routers.errors import registrar_tratadores
from app.services import bruto_do_corte
from app.services import corte as corte_module
from app.services import export as export_module
from app.services.bruto_progress import BrutoProgress
from app.services.cenas_remotion import CenasRemotionService
from app.services.export import ExportService
from fastapi import FastAPI
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from tests.services.test_gerar_bruto_d716 import Esteira

# A esteira do bruto troca este método por um dublê; aqui a cadeia usa o de verdade.
_GERAR_DE_VERDADE = inspect.getattr_static(CenasRemotionService, "gerar_cenas_via_claude")
_LIMITE_SEG = 5


class GeracaoPresa:
    """O corpo da geração: conta as chamadas e espera o teste soltar."""

    def __init__(self):
        self.chamadas = 0
        self.comecou = asyncio.Event()
        self.solta = asyncio.Event()
        self.erro: BaseException | None = None

    async def __call__(self, _corte_id, _provider="claude"):
        self.chamadas += 1
        self.comecou.set()
        await self.solta.wait()
        if self.erro:
            raise self.erro
        return {"total_cenas": 1}


@pytest.fixture
def presa(monkeypatch):
    geracao = GeracaoPresa()
    monkeypatch.setattr(CenasRemotionService, "_gerar_cenas", geracao)
    yield geracao
    geracao.solta.set()


@pytest_asyncio.fixture
async def cliente(presa, monkeypatch):
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    fabrica = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with fabrica() as db:
        db.add(Projeto(id="p1", youtube_url="https://x/y"))
        for numero, corte_id in enumerate(("c1", "c2"), 1):
            db.add(Corte(id=corte_id, projeto_id="p1", numero=numero, status="aprovado"))
        await db.commit()

    async def banco():
        async with fabrica() as db:
            yield db

    app = FastAPI()
    registrar_tratadores(app)
    app.include_router(claude_ia.router, prefix="/api/claude")
    app.include_router(export.router, prefix="/api/export")
    app.include_router(cortes.router, prefix="/api/cortes")
    monkeypatch.setattr(bruto_do_corte, "AsyncSessionLocal", fabrica)
    app.dependency_overrides[get_db] = banco
    transporte = httpx.ASGITransport(app=app, raise_app_exceptions=False)
    async with httpx.AsyncClient(transport=transporte, base_url="http://teste") as http:
        yield http
    await engine.dispose()


async def _pedir(cliente, corte_id="c1"):
    return await _no_limite(cliente.post(f"/api/claude/corte/{corte_id}/gerar-cenas"))


async def _em_geracao(cliente, corte_id="c1") -> bool:
    resposta = await cliente.get(f"/api/claude/corte/{corte_id}/cenas-em-geracao")
    assert resposta.status_code == 200
    return resposta.json()["em_geracao"]


async def _comecar(cliente, presa, corte_id="c1"):
    pedido = asyncio.create_task(_pedir(cliente, corte_id))
    await asyncio.wait_for(presa.comecou.wait(), _LIMITE_SEG)
    return pedido


def _no_limite(pedido):
    """Sem a recusa, a segunda geração fica presa junto: que o teste falhe, não trave."""
    return asyncio.wait_for(pedido, _LIMITE_SEG)


def _marcado(corte_id="c1") -> bool:
    from app.services.cenas_em_geracao import esta_gerando

    return esta_gerando(corte_id)


# ─── A rota recusa a segunda geração ────────────────────────────────────────


@pytest.mark.asyncio
async def test_o_segundo_pedido_do_mesmo_corte_e_recusado_com_mensagem_clara(cliente, presa):
    primeiro = await _comecar(cliente, presa)

    segundo = await _pedir(cliente)

    assert segundo.status_code == 400
    assert "já estão sendo geradas" in segundo.json()["detail"]
    assert presa.chamadas == 1
    presa.solta.set()
    assert (await primeiro).status_code == 200


@pytest.mark.asyncio
async def test_pedidos_no_mesmo_instante_so_um_passa(cliente, presa):
    pedidos = [asyncio.create_task(_pedir(cliente)) for _ in range(5)]
    await asyncio.wait_for(presa.comecou.wait(), _LIMITE_SEG)
    # Os recusados voltam sozinhos; o que passou continua preso até soltar.
    for _ in range(100):
        if sum(p.done() for p in pedidos) == 4:
            break
        await asyncio.wait(pedidos, timeout=0.05)
    assert sum(p.done() for p in pedidos) == 4
    presa.solta.set()

    respostas = await asyncio.gather(*pedidos)

    assert sorted(r.status_code for r in respostas) == [200, 400, 400, 400, 400]
    assert presa.chamadas == 1


def test_a_reserva_tem_um_dono_so_mesmo_entre_threads():
    from app.services.cenas_em_geracao import reservar

    with ThreadPoolExecutor(max_workers=16) as threads:
        reservas = list(threads.map(lambda _: reservar("c-corrida"), range(64)))

    vencedoras = [r for r in reservas if r is not None]
    assert len(vencedoras) == 1
    vencedoras[0].liberar()


@pytest.mark.asyncio
async def test_outro_corte_nao_espera(cliente, presa):
    primeiro = await _comecar(cliente, presa)

    outro = asyncio.create_task(_pedir(cliente, "c2"))
    for _ in range(100):
        if presa.chamadas == 2:
            break
        await asyncio.wait([outro], timeout=0.05)
    assert presa.chamadas == 2
    presa.solta.set()

    assert (await outro).status_code == 200
    assert (await primeiro).status_code == 200


@pytest.mark.asyncio
async def test_a_recusa_nao_derruba_o_item_da_fila(cliente, presa):
    primeiro = await _comecar(cliente, presa)

    await _pedir(cliente)

    item = next(t for t in TarefasAtivas.listar() if t.chave == "ia:cenas-expert:c1")
    assert item.ativa
    presa.solta.set()
    await primeiro


# ─── A API diz, e a marca sai ───────────────────────────────────────────────


@pytest.mark.asyncio
async def test_a_api_diz_que_as_cenas_estao_sendo_geradas(cliente, presa):
    assert await _em_geracao(cliente) is False

    primeiro = await _comecar(cliente, presa)
    assert await _em_geracao(cliente) is True
    assert await _em_geracao(cliente, "c2") is False

    presa.solta.set()
    await primeiro
    assert await _em_geracao(cliente) is False


@pytest.mark.asyncio
async def test_o_status_da_linha_diz_que_as_cenas_estao_sendo_geradas(cliente, presa):
    async def na_linha() -> dict[str, bool]:
        resposta = await cliente.get("/api/export/projeto/p1/status")
        return {c["corte_id"]: c["cenas_em_geracao"] for c in resposta.json()["cortes"]}

    assert await na_linha() == {"c1": False, "c2": False}

    primeiro = await _comecar(cliente, presa)
    assert await na_linha() == {"c1": True, "c2": False}

    presa.solta.set()
    await primeiro
    assert await na_linha() == {"c1": False, "c2": False}


@pytest.mark.parametrize(
    ("erro", "status"),
    [(ValueError("sem prompt"), 400), (RuntimeError("IA fora"), 500)],
)
@pytest.mark.asyncio
async def test_a_geracao_que_falha_nao_deixa_o_corte_preso(cliente, presa, erro, status):
    presa.erro = erro
    primeiro = await _comecar(cliente, presa)
    presa.solta.set()
    assert (await primeiro).status_code == status

    assert await _em_geracao(cliente) is False
    presa.erro = None
    assert (await _pedir(cliente)).status_code == 200


@pytest.mark.asyncio
async def test_a_geracao_cancelada_nao_deixa_o_corte_preso(presa):
    tarefa = asyncio.create_task(CenasRemotionService.gerar_cenas_via_claude("c1"))
    await asyncio.wait_for(presa.comecou.wait(), _LIMITE_SEG)

    tarefa.cancel()
    with pytest.raises(asyncio.CancelledError):
        await tarefa

    assert _marcado() is False


def test_um_dono_antigo_nao_libera_a_reserva_de_outro():
    from app.services.cenas_em_geracao import esta_gerando, reservar

    antiga = reservar("c1")
    antiga.liberar()
    nova = reservar("c1")

    antiga.liberar()

    assert esta_gerando("c1") is True
    nova.liberar()


def test_a_marca_nao_sobrevive_ao_reinicio():
    """Um processo novo, o que o reinício do backend é, não vê a reserva deste."""
    from app.services.cenas_em_geracao import reservar

    reserva = reservar("c-reinicio")
    try:
        codigo = "from app.services.cenas_em_geracao import esta_gerando; print(esta_gerando('c-reinicio'))"
        saida = subprocess.run(
            [sys.executable, "-c", codigo],
            capture_output=True,
            text=True,
            timeout=60,
            check=True,
        )
    finally:
        reserva.liberar()

    assert saida.stdout.strip().endswith("False")


# ─── Entre as duas origens: a cadeia do bruto e o clique ────────────────────


@pytest.fixture
def esteira(monkeypatch, tmp_path, presa):
    bancada = Esteira(monkeypatch, tmp_path)
    monkeypatch.setattr(export_module.settings, "claude_auto_cenas_no_bruto", True)
    monkeypatch.setattr(CenasRemotionService, "gerar_cenas_via_claude", _GERAR_DE_VERDADE)
    return bancada


def _passo(chave: str) -> str:
    return next(p["status"] for p in BrutoProgress.get("c1") if p["chave"] == chave)


@pytest.mark.asyncio
async def test_nao_ha_janela_entre_gravar_o_bruto_e_a_marca(esteira, presa):
    """A linha lê "com bruto" assim que o commit sai: a marca já tem de estar lá."""
    com_bruto: list[bool] = []

    async def no_commit():
        if esteira.corte.arquivo_clip_path:
            com_bruto.append(_marcado())

    esteira.session.commit.side_effect = no_commit
    presa.solta.set()

    await export_module.ExportService.gerar_bruto_via_worker("c1")

    assert com_bruto
    assert all(com_bruto)


@pytest.mark.asyncio
async def test_o_clique_e_recusado_enquanto_a_cadeia_sincroniza(esteira, presa):
    recusas: list[str] = []

    async def na_sincronia(*_a, **_k):
        with pytest.raises(PedidoInvalido) as recusa:
            await _no_limite(CenasRemotionService.gerar_cenas_via_claude("c1"))
        recusas.append(str(recusa.value))

    esteira.sincronizar.side_effect = na_sincronia
    presa.solta.set()

    await export_module.ExportService.gerar_bruto_via_worker("c1")

    assert len(recusas) == 1
    assert presa.chamadas == 1
    assert _marcado() is False


@pytest.mark.asyncio
async def test_o_clique_e_recusado_enquanto_a_cadeia_gera(esteira, presa):
    cadeia = asyncio.create_task(export_module.ExportService.gerar_bruto_via_worker("c1"))
    await asyncio.wait_for(presa.comecou.wait(), _LIMITE_SEG)

    with pytest.raises(PedidoInvalido):
        await _no_limite(CenasRemotionService.gerar_cenas_via_claude("c1"))

    presa.solta.set()
    assert (await cadeia)["status"] == "pronto"
    assert presa.chamadas == 1
    assert _passo("cenas") == "concluido"
    assert _marcado() is False


@pytest.mark.parametrize("refazer_cenas", [True, False])
@pytest.mark.asyncio
async def test_o_bruto_nao_comeca_com_o_clique_em_voo(esteira, presa, refazer_cenas):
    """Todo bruto pode reescrever a transcrição, e a importação converte os índices
    contra a transcrição do momento: as cenas em voo sairiam deslocadas, sem aviso."""
    clique = asyncio.create_task(CenasRemotionService.gerar_cenas_via_claude("c1"))
    await asyncio.wait_for(presa.comecou.wait(), _LIMITE_SEG)

    resultado = await _no_limite(
        export_module.ExportService.gerar_bruto_via_worker("c1", refazer_cenas=refazer_cenas)
    )

    assert resultado["status"] == "erro"
    assert "cenas" in resultado["mensagem"]
    assert corte_module.CorteService.detectar_silencios_tecnico.await_count == 0
    assert presa.chamadas == 1
    assert _marcado() is True, "o bruto recusado não pode soltar a marca que não é dele"
    presa.solta.set()
    await clique
    assert _marcado() is False


@pytest.mark.asyncio
async def test_a_rota_do_bruto_recusa_com_mensagem_e_nao_fica_cortando(cliente, presa):
    primeiro = await _comecar(cliente, presa)

    resposta = await cliente.post("/api/cortes/c1/gerar-bruto")

    assert resposta.status_code == 400
    assert "cenas" in resposta.json()["detail"]
    assert ExportService.get_tarefa_corte_status("c1") != "cortando"
    presa.solta.set()
    await primeiro


@pytest.mark.asyncio
async def test_a_rota_de_cenas_recusa_enquanto_o_bruto_roda(cliente, presa):
    """Vale também para o bruto que não vai gerar cenas: ele reescreve a transcrição."""
    ExportService.set_tarefa_corte_status("c1", "cortando")
    try:
        resposta = await _pedir(cliente)
    finally:
        ExportService.set_tarefa_corte_status("c1", "pronto")

    assert resposta.status_code == 400
    assert "bruto" in resposta.json()["detail"]
    assert presa.chamadas == 0


@pytest.mark.asyncio
async def test_a_marca_cobre_o_bruto_desde_a_salvaguarda(esteira, presa, monkeypatch):
    """A salvaguarda reescreve a transcrição antes do render: o clique não pode ler ali."""
    no_caminho: list[bool] = []

    async def na_salvaguarda(*_a, **_k):
        no_caminho.append(_marcado())
        with pytest.raises(PedidoInvalido):
            await _no_limite(CenasRemotionService.gerar_cenas_via_claude("c1"))
        return {"status": "sucesso"}

    corte_module.CorteService.detectar_silencios_tecnico.side_effect = na_salvaguarda
    pipeline = export_module.build_bruto_pipeline

    def no_render(**campos):
        no_caminho.append(_marcado())
        return pipeline(**campos)

    monkeypatch.setattr(export_module, "build_bruto_pipeline", no_render)
    presa.solta.set()

    assert (await export_module.ExportService.gerar_bruto_via_worker("c1"))["status"] == "pronto"

    assert no_caminho == [True, True]
    assert presa.chamadas == 1
    assert _marcado() is False


@pytest.mark.asyncio
async def test_o_render_que_falha_nao_deixa_o_corte_preso(esteira, presa):
    esteira.tamanho_do_clip = 0

    resultado = await export_module.ExportService.gerar_bruto_via_worker("c1")

    assert resultado["status"] == "erro"
    assert presa.chamadas == 0
    assert _marcado() is False


@pytest.mark.asyncio
async def test_a_marca_sai_antes_dos_shorts(esteira, presa, monkeypatch):
    """Os shorts levam minutos e não geram cenas: não podem segurar o corte."""
    monkeypatch.setattr(export_module.settings, "claude_auto_shorts_no_bruto", True)
    esteira.corte.is_fire = True
    nos_shorts: list[bool] = []

    async def anota(*_a, **_k):
        nos_shorts.append(_marcado())

    esteira.shorts.side_effect = anota
    presa.solta.set()

    await export_module.ExportService.gerar_bruto_via_worker("c1")

    assert nos_shorts == [False]


@pytest.mark.asyncio
async def test_a_sincronia_que_falha_nao_deixa_o_corte_preso(esteira, presa):
    esteira.sincronizar.side_effect = RuntimeError("banco travado")

    with pytest.raises(RuntimeError):
        await export_module.ExportService.gerar_bruto_via_worker("c1")

    assert presa.chamadas == 0
    assert _marcado() is False


@pytest.mark.asyncio
async def test_a_ia_que_falha_na_cadeia_nao_deixa_o_corte_preso(esteira, presa):
    presa.erro = RuntimeError("IA fora")
    presa.solta.set()

    assert (await export_module.ExportService.gerar_bruto_via_worker("c1"))["status"] == "pronto"

    assert _passo("cenas") == "erro"
    assert _marcado() is False


@pytest.mark.asyncio
async def test_a_cadeia_cancelada_nao_deixa_o_corte_preso(esteira, presa):
    cadeia = asyncio.create_task(export_module.ExportService.gerar_bruto_via_worker("c1"))
    await asyncio.wait_for(presa.comecou.wait(), _LIMITE_SEG)

    cadeia.cancel()
    with pytest.raises(asyncio.CancelledError):
        await cadeia

    assert _marcado() is False


@pytest.mark.parametrize(
    ("automatico", "refazer"),
    [(True, False), (False, True)],
)
@pytest.mark.asyncio
async def test_sem_cenas_na_cadeia_nao_ha_marca(esteira, presa, monkeypatch, automatico, refazer):
    monkeypatch.setattr(export_module.settings, "claude_auto_cenas_no_bruto", automatico)
    na_sincronia: list[bool] = []

    async def anota(*_a, **_k):
        na_sincronia.append(_marcado())

    esteira.sincronizar.side_effect = anota

    await export_module.ExportService.gerar_bruto_via_worker("c1", refazer_cenas=refazer)

    assert na_sincronia == [False]
    assert presa.chamadas == 0
