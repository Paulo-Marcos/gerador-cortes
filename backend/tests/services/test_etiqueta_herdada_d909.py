"""D-909: o texto da capa do YouTube virou frase, e frase não vira etiqueta do TikTok.

Até a D-909 o `texto_capa` tinha 2 a 6 palavras e era, de propósito, a mesma
etiqueta da capa vertical (D-533/D-534). Com a frase dita de 10 a 18 palavras,
herdar seria encolher meia frase para a vitrine: acima do teto, a etiqueta volta
a vir da skill dela.
"""

import pytest
from app.domain.corte.capa_tiktok import MAX_PALAVRAS_DA_ETIQUETA_HERDADA, etiqueta_herdada
from app.routers import shorts as rota_shorts
from app.routers.errors import registrar_tratadores
from app.services import capa_tiktok
from fastapi import FastAPI
from fastapi.testclient import TestClient

FRASE = "EU DIVIDI O SET COM DIRETORES GIGANTES E DESCOBRI A VERDADE DOS BASTIDORES..."


class TestDominio:
    @pytest.mark.parametrize(
        "texto", ["SELIC", "🔥 📖 O JURO COMPOSTO", "NÃO TEM PAÍS QUE SOBREVIVE A ISSO"]
    )
    def test_nome_curto_continua_sendo_a_etiqueta(self, texto):
        assert etiqueta_herdada(f"  {texto} ") == texto

    def test_frase_dita_nao_vira_etiqueta(self):
        assert etiqueta_herdada(FRASE) == ""

    def test_o_teto_conta_palavras_e_nao_emojis(self):
        oito = " ".join(["PALAVRA"] * MAX_PALAVRAS_DA_ETIQUETA_HERDADA)

        assert etiqueta_herdada(f"🔥 {oito}") == f"🔥 {oito}"
        assert etiqueta_herdada(f"{oito} MAIS") == ""


class TestRota:
    @pytest.fixture
    def montagens(self, monkeypatch):
        registro: dict = {"sugeriu": 0, "etiquetas": []}

        async def tem_texto(_corte_id):
            return False

        async def sugerir(_corte_id, _provider):
            registro["sugeriu"] += 1
            return "BASTIDORES"

        async def gerar(_corte_id, *, etiqueta, origem, instante_seg):
            registro["etiquetas"].append(etiqueta)
            return capa_tiktok.Path("capa_tiktok_c1.png")

        monkeypatch.setattr(capa_tiktok, "tem_texto_de_capa", tem_texto)
        monkeypatch.setattr(capa_tiktok, "sugerir_etiqueta", sugerir)
        monkeypatch.setattr(capa_tiktok, "gerar", gerar)
        app = FastAPI()
        registrar_tratadores(app)
        app.include_router(rota_shorts.router, prefix="/api/shorts")
        return TestClient(app), registro

    def test_frase_na_tela_pede_a_etiqueta_a_skill(self, montagens):
        cliente, registro = montagens

        resposta = cliente.post("/api/shorts/corte/c1/capa-tiktok", json={"etiqueta": FRASE})

        assert resposta.json()["etiqueta"] == "BASTIDORES"
        assert registro == {"sugeriu": 1, "etiquetas": ["BASTIDORES"]}

    def test_nome_curto_na_tela_vai_direto(self, montagens):
        cliente, registro = montagens

        cliente.post("/api/shorts/corte/c1/capa-tiktok", json={"etiqueta": "SELIC"})

        assert registro == {"sugeriu": 0, "etiquetas": ["SELIC"]}
