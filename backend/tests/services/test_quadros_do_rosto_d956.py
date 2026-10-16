"""D-956: quem decide o apresentador é a vida no ROSTO, não na região ampliada.

Medido no corte 32e33933 da PROD (16/10/2026): live só com a câmera, em tela
cheia, e um pôster com um rosto desenhado na parede. Nenhum dos dois rostos cai
na webcam do layout, e a escolha ia para a vida. Medida na região de cabeça e
ombros, o pôster ganhava (0,041 contra 0,021): a região dele é pequena e a
cabeça do apresentador entra nela, e a dele é grande e dilui o movimento. No
próprio rosto: apresentador 0,129, pôster 0,016. Os números do falso abaixo
são esses.
"""

from __future__ import annotations

from app.domain.canal.quadros_do_apresentador import Caixa, QuadroCandidato, regiao_do_apresentador
from app.services import quadros_da_capa
from app.services.quadros_da_capa import MaterialDaCapa, webcam_do_layout

FALA = [
    {
        "palavras": [
            {"texto": t, "inicio_seg": s}
            for t, s in [("esse", 192.6), ("argumento", 193.0), ("invencivel", 194.8)]
        ]
    }
]
# A webcam de quem divide a tela, no terço esquerdo: nesta live ela não tem ninguém.
LAYOUT_DE_TELA_DIVIDIDA = {
    "compartilhada": {"crop_facecam": {"x": 17, "y": 271, "w": 643, "h": 460}}
}
POSTER = Caixa(0.657, 0.196, 0.046, 0.082)
APRESENTADOR = Caixa(0.404, 0.371, 0.205, 0.365)
PROPORCAO = 16 / 9

# Vida medida na PROD, por caixa: (rosto, região ampliada).
VIDA = {POSTER: (0.016, 0.041), APRESENTADOR: (0.129, 0.021)}


class LeitorDaLive:
    """O `quadros_do_video` de mentira com o pôster e o apresentador nos quadros."""

    def __init__(self, monkeypatch) -> None:
        self.salvou: list[Caixa] = []
        self.regioes = {regiao_do_apresentador(r, PROPORCAO): r for r in VIDA}
        modulo = quadros_da_capa.quadros_do_video
        monkeypatch.setattr(
            modulo, "rostos_nos_instantes", lambda _v, inst: [[POSTER, APRESENTADOR] for _ in inst]
        )
        monkeypatch.setattr(modulo, "proporcao", lambda _v: PROPORCAO)
        monkeypatch.setattr(modulo, "medir_candidatos", self.medir)
        monkeypatch.setattr(modulo, "salvar_recortes", self.salvar)

    def medir(self, _video, instantes, caixa: Caixa):
        if caixa in VIDA:
            vida = VIDA[caixa][0]
        else:
            vida = VIDA[self.regioes[caixa]][1]
        # Miniaturas alternando 0 e `vida`: a mudança média entre seguidas é `vida`.
        return [
            QuadroCandidato(t, 500.0, (vida * (i % 2),) * 4, True) for i, t in enumerate(instantes)
        ]

    def salvar(self, _video, instantes, regiao, pasta, _ampliacao):
        self.salvou.append(regiao)
        return [pasta / f"quadro-da-live-{i}.jpg" for i, _ in enumerate(instantes, start=1)]


def test_o_poster_na_parede_nao_vira_o_apresentador(monkeypatch, tmp_path):
    leitor = LeitorDaLive(monkeypatch)
    material = MaterialDaCapa(
        video=tmp_path / "clip_raw.mkv",
        transcricao=FALA,
        frases=["ESSE ARGUMENTO ... INVENCÍVEL"],
        trechos=None,
        duracao=445.0,
        webcam=webcam_do_layout({}, LAYOUT_DE_TELA_DIVIDIDA, None),
    )

    assert quadros_da_capa.extrair_quadros(material, tmp_path)
    assert leitor.salvou == [regiao_do_apresentador(APRESENTADOR, PROPORCAO)]
