"""D-464: onde o recorte 9:16 se centra.

O default NÃO é o meio do quadro. Num short vertical quem carrega o vídeo é a
pessoa falando, e centralizar no meio deixa o rosto na borda sempre que a
facecam vive num canto — o normal numa live. Daí o foco padrão sair do
`crop_facecam` do layout do corte.

`Short.foco_x` NULL significa "ainda concordo com o layout"; um valor gravado
significa que o operador viu o enquadramento e discordou. Essa distinção é o que
permite mudar o layout do corte e ver os shorts acompanharem — menos os que
foram ajustados à mão.
"""

import json

import pytest
import pytest_asyncio
from app.models import Base, Corte, Projeto, Short
from app.services import shorts as servico
from app.services.shorts import foco_efetivo
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

_LAYOUT_FACECAM_ESQUERDA = json.dumps(
    {"regioes": [{"crop_facecam": {"x": 24, "y": 410, "w": 340, "h": 260}}]}
)


def _corte(layout: str = "{}") -> Corte:
    return Corte(
        id="c1",
        projeto_id="p1",
        numero=1,
        inicio_seg=0.0,
        fim_seg=100.0,
        inicio_hms="00:00:00.000",
        fim_hms="00:01:40.000",
        duracao_clip_seg=100.0,
        layout_youtube=layout,
    )


def test_foco_padrao_segue_a_facecam_do_layout():
    curto = Short(id="s1", corte_id="c1", numero=1)

    assert foco_efetivo(curto, _corte(_LAYOUT_FACECAM_ESQUERDA)) == 0.101


def test_sem_layout_o_foco_cai_no_meio():
    """Pior enquadrado, nunca quebrado."""
    assert foco_efetivo(Short(id="s1", corte_id="c1", numero=1), _corte()) == 0.5


def test_layout_corrompido_nao_explode():
    assert foco_efetivo(Short(id="s1", corte_id="c1", numero=1), _corte("{nao json")) == 0.5


def test_sem_corte_o_foco_cai_no_meio():
    assert foco_efetivo(Short(id="s1", corte_id="c1", numero=1), None) == 0.5


def test_ajuste_do_operador_vence_o_layout():
    """Quem assistiu ao trecho tem a ultima palavra sobre o enquadramento."""
    curto = Short(id="s1", corte_id="c1", numero=1, foco_x=0.8)

    assert foco_efetivo(curto, _corte(_LAYOUT_FACECAM_ESQUERDA)) == 0.8


@pytest_asyncio.fixture
async def factory(monkeypatch):
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    sessions = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    monkeypatch.setattr(servico, "AsyncSessionLocal", sessions)

    async with sessions() as db:
        db.add(Projeto(id="p1", youtube_url="u"))
        db.add(_corte(_LAYOUT_FACECAM_ESQUERDA))
        db.add(Short(id="s1", corte_id="c1", numero=1, inicio_seg=0.0, fim_seg=30.0))
        await db.commit()

    yield sessions
    await engine.dispose()


@pytest.mark.asyncio
async def test_a_lista_leva_o_foco_efetivo_para_a_tela(factory):
    """Sem isso a tela nao teria de onde partir: foco_x e NULL ate alguem ajustar."""
    (item,) = await servico.listar_shorts("c1")

    assert item["foco_x"] is None
    assert item["foco_efetivo"] == 0.101


@pytest.mark.asyncio
async def test_ajustar_o_foco_grava_e_passa_a_vencer(factory):
    await servico.atualizar_short("s1", servico.AtualizarShortDTO(foco_x=0.42))

    (item,) = await servico.listar_shorts("c1")
    assert item["foco_x"] == 0.42
    assert item["foco_efetivo"] == 0.42


@pytest.mark.asyncio
async def test_foco_fora_da_faixa_e_recusado(factory):
    for invalido in (-0.1, 1.5):
        with pytest.raises(ValueError, match="foco horizontal"):
            await servico.atualizar_short("s1", servico.AtualizarShortDTO(foco_x=invalido))
