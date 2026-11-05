"""A geração de metadados preenche o que falta e não se paga duas vezes (D-1043).

O gesto do "Gerar bruto" pede metadados sozinho e gravava por cima: um título
escrito à mão sem descrição era reescrito, e uma descrição escrita também. A rota
também aceitava um novo pedido com a geração em voo, e cada chamada custa cerca de
US$ 0,23 e 89 s na mediana (medição de 29/08).

A IA nunca é chamada: `gerar_json` vira um cliente falso, que pode ficar preso até o
teste soltar, e é isso que deixa provar o que acontece DURANTE a geração.
"""

from __future__ import annotations

import asyncio
import json
from types import SimpleNamespace

import httpx
import pytest
import pytest_asyncio
from app.database import get_db
from app.domain.compartilhado.erros import PedidoInvalido
from app.models import Base, Corte, MetadadoCorte, Projeto
from app.routers import claude_ia
from app.routers import metadados as rotas_metadados
from app.routers.errors import registrar_tratadores
from app.services import cenas_em_geracao
from app.services import metadados as metadados_module
from app.services.metadados import MetadadosService
from fastapi import FastAPI
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

_LIMITE_SEG = 5
_ROTA = "/api/claude/corte/c1/gerar-metadados"
_RESPOSTA_DA_IA = {
    "titulo": "Título da IA",
    "opcoes_titulo": ["Título da IA", "Outra opção"],
    "opcoes_texto_capa": ["CAPA DA IA"],
    "sinopse": "Sinopse da IA",
    "hashtags": ["ia"],
    "tags": ["tag da ia"],
}


class ClienteFalso:
    """Faz o papel de `gerar_json`: conta as chamadas e, se pedido, espera o teste soltar."""

    def __init__(self, *, preso: bool = False, erro: Exception | None = None):
        self.chamadas = 0
        self.comecou = asyncio.Event()
        self.solta = asyncio.Event()
        self.ao_soltar = None
        self.erro = erro
        if not preso:
            self.solta.set()

    async def __call__(self, *_args, **_kwargs) -> dict:
        self.chamadas += 1
        self.comecou.set()
        await asyncio.wait_for(self.solta.wait(), _LIMITE_SEG)
        if self.ao_soltar:
            await self.ao_soltar()
        if self.erro:
            raise self.erro
        return dict(_RESPOSTA_DA_IA)


@pytest_asyncio.fixture
async def fabrica(monkeypatch):
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    monkeypatch.setattr(metadados_module, "AsyncSessionLocal", factory)

    async def contexto(_corte_id):
        return {
            "titulo_proposto": "Proposto",
            "tema": "tema",
            "numero_corte": 1,
            "resumo": "resumo",
            "transcricao_marcada": "fala",
            "historico_titulos": "",
        }

    monkeypatch.setattr(MetadadosService, "montar_contexto_meta", staticmethod(contexto))
    monkeypatch.setattr(
        metadados_module.editorial_skills,
        "resolver_skill",
        lambda _chave: SimpleNamespace(lentes=[]),
    )
    monkeypatch.setattr(
        metadados_module.editorial_scaffolds,
        "resolver_scaffold",
        lambda _chave: "{titulo_proposto}",
    )
    monkeypatch.setattr(metadados_module, "bloco_variacao_de", lambda _lentes: "")
    monkeypatch.setattr(metadados_module, "registrar_skill_usada", lambda *_a, **_k: None)
    async with factory() as db:
        db.add(Projeto(id="p1", titulo_live="Live", youtube_url="https://youtu.be/abc"))
        db.add(
            Corte(
                id="c1",
                projeto_id="p1",
                numero=1,
                titulo_proposto="Proposto",
                inicio_seg=0,
                fim_seg=60,
            )
        )
        db.add(
            Corte(
                id="c2",
                projeto_id="p1",
                numero=2,
                titulo_proposto="Outro",
                inicio_seg=60,
                fim_seg=90,
            )
        )
        await db.commit()
    yield factory
    await engine.dispose()


@pytest.fixture
def cliente_falso(monkeypatch):
    def instalar(**kwargs) -> ClienteFalso:
        falso = ClienteFalso(**kwargs)
        monkeypatch.setattr(metadados_module, "gerar_json", falso)
        return falso

    return instalar


@pytest_asyncio.fixture
async def http(fabrica):
    app = FastAPI()
    registrar_tratadores(app)
    app.include_router(claude_ia.router, prefix="/api/claude")
    app.include_router(rotas_metadados.router, prefix="/api/metadados")

    async def banco():
        async with fabrica() as db:
            yield db

    app.dependency_overrides[get_db] = banco
    transporte = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transporte, base_url="http://teste") as cliente:
        yield cliente


async def _gravar_meta(fabrica, **campos) -> None:
    async with fabrica() as db:
        db.add(MetadadoCorte(id="m1", corte_id="c1", **campos))
        await db.commit()


async def _ler_meta(fabrica, corte_id: str = "c1") -> MetadadoCorte:
    async with fabrica() as db:
        resultado = await db.execute(
            select(MetadadoCorte).where(MetadadoCorte.corte_id == corte_id)
        )
        return resultado.scalar_one()


async def _ligar_marca_do_corte(fabrica, **campos) -> None:
    async with fabrica() as db:
        corte = await db.get(Corte, "c1")
        for campo, valor in campos.items():
            setattr(corte, campo, valor)
        await db.commit()


@pytest.mark.asyncio
async def test_titulo_escrito_a_mao_fica_e_a_descricao_e_preenchida(fabrica, cliente_falso):
    await _gravar_meta(fabrica, titulo_youtube="Meu título à mão", descricao_youtube="")
    cliente_falso()

    await MetadadosService.gerar_metadados_via_claude("c1")

    meta = await _ler_meta(fabrica)
    assert meta.titulo_youtube == "Meu título à mão"
    assert meta.descricao_youtube.startswith("Sinopse da IA")
    assert json.loads(meta.opcoes_titulo) == ["Título da IA", "Outra opção"]


@pytest.mark.asyncio
async def test_descricao_escrita_fica_e_o_titulo_vazio_e_preenchido(fabrica, cliente_falso):
    await _gravar_meta(fabrica, titulo_youtube="", descricao_youtube="Minha descrição")
    cliente_falso()

    await MetadadosService.gerar_metadados_via_claude("c1")

    meta = await _ler_meta(fabrica)
    assert meta.descricao_youtube == "Minha descrição"
    assert meta.titulo_youtube == "Título da IA"


@pytest.mark.asyncio
async def test_tags_e_textos_ja_preenchidos_ficam(fabrica, cliente_falso):
    await _gravar_meta(
        fabrica,
        titulo_youtube="Meu título",
        descricao_youtube="Minha descrição",
        tags_youtube=json.dumps(["minha tag"]),
        opcoes_titulo=json.dumps(["minha opção"]),
        opcoes_texto_capa=json.dumps(["MINHA OPÇÃO"]),
        texto_capa="MINHA CAPA",
    )
    cliente_falso()

    await MetadadosService.gerar_metadados_via_claude("c1")

    meta = await _ler_meta(fabrica)
    assert meta.titulo_youtube == "Meu título"
    assert meta.descricao_youtube == "Minha descrição"
    assert json.loads(meta.tags_youtube) == ["minha tag"]
    assert json.loads(meta.opcoes_titulo) == ["minha opção"]
    assert json.loads(meta.opcoes_texto_capa) == ["MINHA OPÇÃO"]
    assert meta.texto_capa == "MINHA CAPA"


@pytest.mark.asyncio
async def test_texto_digitado_durante_a_geracao_tambem_fica(fabrica, cliente_falso):
    """A decisão é na hora de gravar: a IA leva 89 s na mediana, e a tela segue editável."""
    await _gravar_meta(fabrica, titulo_youtube="", descricao_youtube="")
    falso = cliente_falso()

    async def operador_escreve():
        async with fabrica() as db:
            meta = await db.get(MetadadoCorte, "m1")
            meta.titulo_youtube = "Escrito enquanto a IA pensava"
            await db.commit()

    falso.ao_soltar = operador_escreve

    await MetadadosService.gerar_metadados_via_claude("c1")

    meta = await _ler_meta(fabrica)
    assert meta.titulo_youtube == "Escrito enquanto a IA pensava"
    assert meta.descricao_youtube.startswith("Sinopse da IA")


@pytest.mark.asyncio
async def test_titulo_copiado_pelo_fire_nao_conta_como_escrito(fabrica, cliente_falso):
    """Ligar o Fire antes de gerar copia o proposto: isso não é texto do operador."""
    cliente_falso()
    await _gravar_meta(fabrica, titulo_youtube="🔥 Proposto", descricao_youtube="", texto_capa="🔥")
    await _ligar_marca_do_corte(fabrica, is_fire=True)

    await MetadadosService.gerar_metadados_via_claude("c1")

    meta = await _ler_meta(fabrica)
    assert meta.titulo_youtube == "Título da IA"
    assert meta.texto_capa == "🔥 CAPA DA IA"


@pytest.mark.asyncio
async def test_titulo_a_mao_com_fire_fica_inteiro(fabrica, cliente_falso):
    await _gravar_meta(fabrica, titulo_youtube="🔥 Meu título", descricao_youtube="")
    await _ligar_marca_do_corte(fabrica, is_fire=True)
    cliente_falso()

    await MetadadosService.gerar_metadados_via_claude("c1")

    assert (await _ler_meta(fabrica)).titulo_youtube == "🔥 Meu título"


@pytest.mark.asyncio
async def test_corte_de_leitura_recebe_o_prefixo_so_no_titulo_gerado(fabrica, cliente_falso):
    await _ligar_marca_do_corte(fabrica, is_leitura=True, autor_leitura="Hegel", parte_leitura=2)
    cliente_falso()

    await MetadadosService.gerar_metadados_via_claude("c1")

    meta = await _ler_meta(fabrica)
    assert "Hegel" in meta.titulo_youtube
    assert meta.titulo_youtube.endswith("Título da IA")


@pytest.mark.asyncio
async def test_corte_sem_metadado_recebe_tudo(fabrica, cliente_falso):
    cliente_falso()

    await MetadadosService.gerar_metadados_via_claude("c1")

    meta = await _ler_meta(fabrica)
    assert meta.titulo_youtube == "Título da IA"
    assert meta.descricao_youtube.startswith("Sinopse da IA")
    assert json.loads(meta.tags_youtube) == ["tag da ia"]
    assert meta.texto_capa == "CAPA DA IA"


@pytest.mark.asyncio
async def test_regerar_pela_rota_continua_substituindo_tudo(fabrica, cliente_falso, http):
    """O "Regerar metadados" do card (D-746, D-821) é pedido explícito e tem Desfazer."""
    await _gravar_meta(
        fabrica,
        titulo_youtube="Meu título",
        descricao_youtube="Minha descrição",
        tags_youtube=json.dumps(["minha tag"]),
        texto_capa="MINHA CAPA",
    )
    cliente_falso()

    resposta = await http.post(_ROTA, params={"substituir": "true"})

    assert resposta.status_code == 200
    meta = await _ler_meta(fabrica)
    assert meta.titulo_youtube == "Título da IA"
    assert meta.descricao_youtube.startswith("Sinopse da IA")
    assert json.loads(meta.tags_youtube) == ["tag da ia"]
    assert meta.texto_capa == "CAPA DA IA"


@pytest.mark.asyncio
async def test_rota_sem_o_pedido_de_substituir_preenche_so_o_que_falta(
    fabrica, cliente_falso, http
):
    await _gravar_meta(fabrica, titulo_youtube="Meu título", descricao_youtube="")
    cliente_falso()

    resposta = await http.post(_ROTA)

    assert resposta.status_code == 200
    assert (await _ler_meta(fabrica)).titulo_youtube == "Meu título"


@pytest.mark.asyncio
async def test_colar_o_resultado_manual_continua_substituindo(fabrica, http):
    """Colar o JSON da IA externa é o operador dizendo o que quer ali."""
    await _gravar_meta(fabrica, titulo_youtube="Meu título", descricao_youtube="Minha descrição")

    resposta = await http.post(
        "/api/metadados/corte/c1/meta/importar",
        json={"titulo": "Colado", "sinopse": "Sinopse colada"},
    )

    assert resposta.status_code == 200
    meta = await _ler_meta(fabrica)
    assert meta.titulo_youtube == "Colado"
    assert meta.descricao_youtube.startswith("Sinopse colada")


@pytest.mark.asyncio
async def test_segundo_pedido_com_a_geracao_em_voo_e_recusado(fabrica, cliente_falso, http):
    falso = cliente_falso(preso=True)

    primeiro = asyncio.create_task(http.post(_ROTA))
    await asyncio.wait_for(falso.comecou.wait(), _LIMITE_SEG)

    # O F5 perde o estado da tela; só a rota sabe que a geração segue em voo.
    segundo = await http.post(_ROTA)

    assert segundo.status_code == 400
    assert "já estão sendo gerados" in segundo.json()["detail"]
    assert falso.chamadas == 1

    falso.solta.set()
    assert (await primeiro).status_code == 200
    assert falso.chamadas == 1


@pytest.mark.asyncio
async def test_regerar_tambem_e_recusado_com_a_geracao_em_voo(fabrica, cliente_falso, http):
    falso = cliente_falso(preso=True)
    primeiro = asyncio.create_task(http.post(_ROTA))
    await asyncio.wait_for(falso.comecou.wait(), _LIMITE_SEG)

    segundo = await http.post(_ROTA, params={"substituir": "true"})

    assert segundo.status_code == 400
    falso.solta.set()
    await primeiro


@pytest.mark.asyncio
async def test_a_geracao_de_outro_corte_nao_e_recusada(fabrica, cliente_falso, http):
    falso = cliente_falso(preso=True)
    primeiro = asyncio.create_task(http.post(_ROTA))
    await asyncio.wait_for(falso.comecou.wait(), _LIMITE_SEG)

    outro = asyncio.create_task(http.post("/api/claude/corte/c2/gerar-metadados"))
    while falso.chamadas < 2:
        await asyncio.sleep(0)
    falso.solta.set()

    assert (await primeiro).status_code == 200
    assert (await outro).status_code == 200


@pytest.mark.asyncio
async def test_depois_de_terminar_o_corte_pode_gerar_de_novo(fabrica, cliente_falso, http):
    falso = cliente_falso()

    assert (await http.post(_ROTA)).status_code == 200
    assert (await http.post(_ROTA)).status_code == 200
    assert falso.chamadas == 2


@pytest.mark.asyncio
async def test_falha_na_geracao_nao_prende_o_corte(fabrica, cliente_falso, http):
    cliente_falso(erro=RuntimeError("a CLI caiu"))
    assert (await http.post(_ROTA)).status_code == 500

    falso = cliente_falso()
    assert (await http.post(_ROTA)).status_code == 200
    assert falso.chamadas == 1


@pytest.mark.asyncio
async def test_a_recusa_vem_como_erro_de_dominio(fabrica, cliente_falso):
    falso = cliente_falso(preso=True)
    primeiro = asyncio.create_task(MetadadosService.gerar_metadados_via_claude("c1"))
    await asyncio.wait_for(falso.comecou.wait(), _LIMITE_SEG)

    with pytest.raises(PedidoInvalido):
        await MetadadosService.gerar_metadados_via_claude("c1")

    falso.solta.set()
    await primeiro


@pytest.mark.asyncio
async def test_metadados_em_voo_nao_seguram_as_cenas_nem_o_bruto(fabrica, cliente_falso):
    """O gesto do bruto pede os dois juntos: a marca de um não pode recusar o outro."""
    falso = cliente_falso(preso=True)
    primeiro = asyncio.create_task(MetadadosService.gerar_metadados_via_claude("c1"))
    await asyncio.wait_for(falso.comecou.wait(), _LIMITE_SEG)

    # É esta consulta que recusa o bruto (BRUTO_ESPERA_AS_CENAS).
    assert cenas_em_geracao.esta_gerando("c1") is False
    with cenas_em_geracao.reservar_ou_recusar("c1"):
        assert cenas_em_geracao.esta_gerando("c1") is True

        # E as cenas em voo também não recusam os metadados.
        falso.solta.set()
        await primeiro
        await MetadadosService.gerar_metadados_via_claude("c1")

    assert cenas_em_geracao.esta_gerando("c1") is False
