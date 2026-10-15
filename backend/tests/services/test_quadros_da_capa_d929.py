"""D-929: os quadros da live de cada capa — do banco ao recorte, e a volta ao banco de fotos.

O banco é um SQLite em memória; a leitura do vídeo (`infrastructure/
quadros_do_video`) é trocada por um falso que registra o que pediram, porque a
escolha do rosto e dos quadros já tem teste próprio no domínio.
"""

from __future__ import annotations

import asyncio
import json
from types import SimpleNamespace

import pytest
import pytest_asyncio
from app.core import channel_paths
from app.domain.canal.quadros_do_apresentador import Caixa, QuadroCandidato
from app.models import Base, Corte, MetadadoCorte, MetadadoShort, Projeto, Short
from app.services import quadros_da_capa
from app.services.quadros_da_capa import MaterialDaCapa, webcam_do_layout
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

FALA = [
    {
        "palavras": [
            {"texto": t, "inicio_seg": s}
            for t, s in [
                ("nunca", 9.68),
                ("pisaram", 9.96),
                ("na", 10.4),
                ("rua", 10.6),
                ("se", 11.5),
                ("pisar", 11.6),
                ("no", 11.8),
                ("sol", 11.88),
                ("dissolvem", 12.8),
                ("depois", 40.0),
                ("vai", 41.0),
                ("pra", 41.2),
                ("rua", 41.4),
                ("ninguem", 41.6),
                ("leva", 41.8),
            ]
        ]
    }
]
FRASE = "NUNCA PISARAM NA RUA... SE PISAR NO SOL, DISSOLVEM"
LAYOUT_DO_PROJETO = {"compartilhada": {"crop_facecam": {"x": 17, "y": 281, "w": 643, "h": 440}}}


@pytest_asyncio.fixture
async def banco(monkeypatch, tmp_path):
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    monkeypatch.setattr(quadros_da_capa, "AsyncSessionLocal", factory)
    monkeypatch.setattr(channel_paths, "projetos_dir", lambda: tmp_path / "projetos")
    monkeypatch.setattr(
        quadros_da_capa,
        "AppSettingsService",
        SimpleNamespace(get=lambda: SimpleNamespace(youtube_layout_padrao_global=None)),
    )
    clip = tmp_path / "projetos" / "p1" / "cortes" / "c1" / "clip_raw_1.mkv"
    clip.parent.mkdir(parents=True)
    clip.write_bytes(b"mkv")

    async with factory() as db:
        db.add(
            Projeto(
                id="p1",
                youtube_url="http://x",
                transcricao_raw="[]",
                layout_youtube_padrao=json.dumps(LAYOUT_DO_PROJETO),
            )
        )
        for corte_id, caminho in (("c1", "cortes/c1/clip_raw_1.mkv"), ("c2", "")):
            db.add(
                Corte(
                    id=corte_id,
                    projeto_id="p1",
                    numero=1,
                    titulo_proposto="t",
                    inicio_seg=0.0,
                    fim_seg=60.0,
                    transcricao_final=json.dumps(FALA),
                    frase_gancho_texto="a frase-gancho",
                    arquivo_clip_path=caminho,
                    duracao_clip_seg=60.0,
                )
            )
        db.add(MetadadoCorte(id="m1", corte_id="c1", texto_capa=FRASE))
        db.add(
            Short(
                id="s1",
                corte_id="c1",
                numero=1,
                inicio_seg=30.0,
                fim_seg=50.0,
                gancho_tela="*vai* pra rua",
                gancho="o gancho da curadoria",
            )
        )
        db.add(MetadadoShort(id="ms1", short_id="s1", frase_capa="NINGUÉM LEVA"))
        await db.commit()
    yield clip
    await engine.dispose()


class TestMaterialDaCapa:
    @pytest.mark.asyncio
    async def test_thumbnail_e_tiktok_procuram_o_texto_da_capa_no_bruto_do_corte(self, banco):
        for destino in ("youtube", "tiktok"):
            material = await quadros_da_capa.material_da_capa(destino, "c1")

            assert material.video == banco
            assert material.frases == [FRASE, "a frase-gancho"]
            assert material.trechos is None
            assert material.duracao == 60.0

    @pytest.mark.asyncio
    async def test_a_webcam_vem_do_layout_em_cascata(self, banco):
        material = await quadros_da_capa.material_da_capa("youtube", "c1")

        assert material.webcam == Caixa(17 / 1920, 281 / 1080, 643 / 1920, 440 / 1080)

    @pytest.mark.asyncio
    async def test_o_short_procura_as_frases_dele_so_nos_trechos_dele(self, banco):
        material = await quadros_da_capa.material_da_capa("short", "s1")

        assert material.frases == ["NINGUÉM LEVA", "vai pra rua", "o gancho da curadoria"]
        assert material.trechos == [(30.0, 50.0)]
        assert material.video == banco

    @pytest.mark.asyncio
    async def test_sem_bruto_em_disco_nao_ha_video(self, banco):
        assert (await quadros_da_capa.material_da_capa("youtube", "c2")).video is None

    @pytest.mark.asyncio
    async def test_capa_que_nao_existe_nao_tem_material(self, banco):
        assert await quadros_da_capa.material_da_capa("youtube", "nao-existe") is None
        assert await quadros_da_capa.material_da_capa("short", "nao-existe") is None


class LeitorFalso:
    """O `quadros_do_video` de mentira: o apresentador fixo e vivo na webcam."""

    def __init__(self, monkeypatch, *, vivo: bool = True) -> None:
        self.salvou: list[tuple] = []
        self.vivo = vivo
        rosto = Caixa(0.15, 0.40, 0.094, 0.167)
        monkeypatch.setattr(
            quadros_da_capa.quadros_do_video,
            "rostos_nos_instantes",
            lambda _v, instantes: [[rosto] for _ in instantes],
        )
        monkeypatch.setattr(quadros_da_capa.quadros_do_video, "proporcao", lambda _v: 16 / 9)
        monkeypatch.setattr(quadros_da_capa.quadros_do_video, "medir_candidatos", self.medir)
        monkeypatch.setattr(quadros_da_capa.quadros_do_video, "salvar_recortes", self.salvar)

    def medir(self, _video, instantes, _regiao):
        return [
            QuadroCandidato(t, 500.0, ((i % 3) / 3 if self.vivo else 0.5,) * 4, True)
            for i, t in enumerate(instantes)
        ]

    def salvar(self, _video, instantes, regiao, pasta, _ampliacao):
        self.salvou.append((instantes, regiao))
        return [pasta / f"quadro-da-live-{i}.jpg" for i, _ in enumerate(instantes, start=1)]


def _material(video=None, **kw) -> MaterialDaCapa:
    base = {
        "video": video,
        "transcricao": FALA,
        "frases": [FRASE],
        "trechos": None,
        "duracao": 60.0,
        "webcam": webcam_do_layout({}, LAYOUT_DO_PROJETO, None),
    }
    return MaterialDaCapa(**{**base, **kw})


class TestExtrairQuadros:
    def test_tres_quadros_no_momento_da_frase_dentro_da_webcam(self, monkeypatch, tmp_path):
        leitor = LeitorFalso(monkeypatch)

        quadros = quadros_da_capa.extrair_quadros(_material(tmp_path / "v.mkv"), tmp_path)

        assert [q.name for q in quadros] == [
            "quadro-da-live-1.jpg",
            "quadro-da-live-2.jpg",
            "quadro-da-live-3.jpg",
        ]
        instantes, regiao = leitor.salvou[0]
        assert all(9.0 <= t <= 13.5 for t in instantes)
        webcam = _material(None).webcam
        assert regiao.x >= webcam.x
        assert regiao.y + regiao.altura <= webcam.y + webcam.altura + 1e-3

    @pytest.mark.parametrize(
        ("motivo", "material"),
        [
            ("sem bruto", {"video": None}),
            ("frase que não casa", {"frases": ["O BANCO CENTRAL ERROU A META"]}),
        ],
    )
    def test_sem_video_ou_sem_frase_volta_ao_banco_de_fotos(
        self, monkeypatch, tmp_path, motivo, material
    ):
        leitor = LeitorFalso(monkeypatch)
        base = _material(**{"video": tmp_path / "v.mkv", **material})

        assert quadros_da_capa.extrair_quadros(base, tmp_path) == [], motivo
        assert leitor.salvou == []

    def test_sem_rosto_vivo_volta_ao_banco_de_fotos(self, monkeypatch, tmp_path):
        leitor = LeitorFalso(monkeypatch, vivo=False)

        assert quadros_da_capa.extrair_quadros(_material(tmp_path / "v.mkv"), tmp_path) == []
        assert leitor.salvou == []

    def test_a_segunda_frase_vale_quando_a_primeira_nao_casa(self, monkeypatch, tmp_path):
        leitor = LeitorFalso(monkeypatch)
        material = _material(tmp_path / "v.mkv", frases=["NADA A VER COM ISSO", "VAI PRA RUA"])

        assert quadros_da_capa.extrair_quadros(material, tmp_path)
        assert all(39.0 <= t <= 43.0 for t in leitor.salvou[0][0])


class TestQuadrosDoApresentador:
    def test_falha_no_caminho_vira_banco_de_fotos_e_nao_derruba_a_capa(self, monkeypatch, tmp_path):
        async def quebra(_destino, _alvo):
            raise RuntimeError("banco fora do ar")

        monkeypatch.setattr(quadros_da_capa, "material_da_capa", quebra)

        assert asyncio.run(quadros_da_capa.quadros_do_apresentador("youtube", "c1", tmp_path)) == []


class TestWebcamDoLayout:
    def test_layout_ilegivel_nao_tem_webcam(self, monkeypatch):
        def quebra(*_a):
            raise TypeError("layout torto")

        monkeypatch.setattr(quadros_da_capa, "resolver_layout_em_cascata", quebra)

        assert webcam_do_layout("{", None, None) is None
