"""D-957: o recorte do apresentador para na moldura da câmera, antes da faixa da live.

Medido no corte b4a2dd8c da PROD (16/10/2026): live só com a câmera, numa
janela com moldura entre a barra do canal (em cima) e a faixa "NOVO ASSINANTE /
CHAVE PIX" (embaixo). O rosto é grande, e a região de cabeça e ombros ia de
y=0,038 a 1,0: as duas faixas iam ao ChatGPT como referência. Na coluna da
região, a moldura é uma linha horizontal fixa em todos os quadros: de 0,099 a
0,129 em cima e de 0,885 a 0,9 embaixo (é o que o vídeo de mentira devolve).
"""

from __future__ import annotations

from app.domain.canal.quadros_do_apresentador import Caixa, QuadroCandidato, regiao_do_apresentador
from app.infrastructure.quadros_do_video import VideoIlegivel
from app.services import quadros_da_capa
from app.services.quadros_da_capa import MaterialDaCapa

FALA = [
    {
        "palavras": [
            {"texto": t, "inicio_seg": s}
            for t, s in [("esse", 192.6), ("argumento", 193.0), ("invencivel", 194.8)]
        ]
    }
]
APRESENTADOR = Caixa(0.436, 0.373, 0.225, 0.401)
PROPORCAO = 16 / 9
MOLDURA = [0.099, 0.1, 0.101, 0.111, 0.113, 0.114, 0.128, 0.129, 0.885, 0.886, 0.9]


class LeitorDaLive:
    """O `quadros_do_video` de mentira: o apresentador em tela cheia, com moldura."""

    def __init__(self, monkeypatch, linhas=None) -> None:
        self.salvou: list[Caixa] = []
        modulo = quadros_da_capa.quadros_do_video
        monkeypatch.setattr(
            modulo, "rostos_nos_instantes", lambda _v, inst: [[APRESENTADOR] for _ in inst]
        )
        monkeypatch.setattr(modulo, "proporcao", lambda _v: PROPORCAO)
        monkeypatch.setattr(modulo, "medir_candidatos", self.medir)
        monkeypatch.setattr(modulo, "salvar_recortes", self.salvar)
        monkeypatch.setattr(modulo, "linhas_fixas", linhas or (lambda *_a, **_k: MOLDURA))

    def medir(self, _video, instantes, _caixa):
        return [
            QuadroCandidato(t, 500.0, (0.1 * (i % 2),) * 4, True) for i, t in enumerate(instantes)
        ]

    def salvar(self, _video, instantes, regiao, pasta, _ampliacao):
        self.salvou.append(regiao)
        return [pasta / f"quadro-da-live-{i}.jpg" for i, _ in enumerate(instantes, start=1)]


def _material(tmp_path) -> MaterialDaCapa:
    return MaterialDaCapa(
        video=tmp_path / "clip_raw.mkv",
        transcricao=FALA,
        frases=["ESSE ARGUMENTO ... INVENCÍVEL"],
        trechos=None,
        duracao=445.0,
    )


def test_o_recorte_para_na_moldura_e_a_faixa_da_live_fica_de_fora(monkeypatch, tmp_path):
    leitor = LeitorDaLive(monkeypatch)

    assert quadros_da_capa.extrair_quadros(_material(tmp_path), tmp_path)

    (regiao,) = leitor.salvou
    inteira = regiao_do_apresentador(APRESENTADOR, PROPORCAO)
    assert inteira.y + inteira.altura == 1.0  # antes: a região descia até a faixa
    assert (regiao.y, round(regiao.y + regiao.altura, 3)) == (0.129, 0.885)
    assert (regiao.x, regiao.largura) == (inteira.x, inteira.largura)


def test_sem_ler_as_linhas_vai_a_regiao_inteira(monkeypatch, tmp_path):
    def ilegivel(*_a, **_k):
        raise VideoIlegivel("não abriu")

    leitor = LeitorDaLive(monkeypatch, linhas=ilegivel)

    assert quadros_da_capa.extrair_quadros(_material(tmp_path), tmp_path)
    assert leitor.salvou == [regiao_do_apresentador(APRESENTADOR, PROPORCAO)]
