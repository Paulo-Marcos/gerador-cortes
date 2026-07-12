"""Testes das funções puras de metadados adicionadas na D-342.

Cobre a formatação de capítulos (bloco `Capítulos:` da descrição) e a
transcrição com marcadores `[MM:SS]` que ancora os capítulos. São funções
puras — sem banco, sem canal_config específico — mas o import do módulo puxa
`canal_config`, então mantemos o mesmo stub dos demais testes do serviço.
"""

import sys
from unittest.mock import MagicMock

# canal_config stub — injetado quando o arquivo real está ausente (clone limpo).
try:
    import app.canal_config as _cc

    _ = _cc.PROMPT_GERAR_THUMBNAIL_AGENTE_LIVRE
except (ImportError, AttributeError):
    # Stub idêntico ao de test_metadados_prompt_agent.py: as duas suítes injetam
    # o MESMO módulo em sys.modules; valores divergentes poluiriam a que rodar
    # depois (colisão observada na D-342).
    _stub = MagicMock()
    _stub.CREDITOS_TEMPLATE = "{link_live}"
    _stub.PROMPT_GERAR_METADADOS = (
        "{titulo} {resumo} {tema} {numero} {transcricao} {historico_titulos}"
    )
    _stub.PROMPT_GERAR_THUMBNAIL = (
        "{titulo} {tema} {resumo} {transcricao} {texto_capa} {historico_visual}"
    )
    _stub.PROMPT_GERAR_THUMBNAIL_AGENTE = (
        "AGENTE-STUB tema:{tema} titulo_youtube:{titulo_youtube} "
        "texto_capa:{texto_capa} {resumo} {transcricao} {historico_visual}"
    )
    _stub.PROMPT_GERAR_THUMBNAIL_AGENTE_LIVRE = (
        "AGENTE-LIVRE-STUB tema:{tema} titulo_youtube:{titulo_youtube} "
        "texto_capa:{texto_capa} {resumo} {transcricao} {historico_visual}"
    )
    sys.modules["app.canal_config"] = _stub

from app.services.metadados import (  # noqa: E402
    _mmss,
    formatar_bloco_capitulos,
    formatar_transcricao_timestampada,
)


class TestMmss:
    def test_formata_minutos_segundos(self):
        assert _mmss(0) == "00:00"
        assert _mmss(75) == "01:15"

    def test_acima_de_uma_hora_usa_hhmmss(self):
        assert _mmss(3661) == "01:01:01"


class TestFormatarBlocoCapitulos:
    def test_caminho_feliz(self):
        chapters = [
            {"inicio": "00:00", "titulo": "Abertura"},
            {"inicio": "01:20", "titulo": "O nó do argumento"},
            {"inicio": "03:05", "titulo": "Por que importa"},
        ]
        bloco = formatar_bloco_capitulos(chapters)
        assert bloco == (
            "Capítulos:\n00:00 Abertura\n01:20 O nó do argumento\n03:05 Por que importa"
        )

    def test_menos_de_tres_retorna_vazio(self):
        chapters = [{"inicio": "00:00", "titulo": "Só um"}, {"inicio": "01:00", "titulo": "Dois"}]
        assert formatar_bloco_capitulos(chapters) == ""

    def test_lista_vazia_ou_none_retorna_vazio(self):
        assert formatar_bloco_capitulos([]) == ""
        assert formatar_bloco_capitulos(None) == ""

    def test_primeiro_fora_de_zero_retorna_vazio(self):
        chapters = [
            {"inicio": "00:10", "titulo": "A"},
            {"inicio": "01:00", "titulo": "B"},
            {"inicio": "02:00", "titulo": "C"},
        ]
        assert formatar_bloco_capitulos(chapters) == ""

    def test_item_malformado_retorna_vazio(self):
        chapters = [
            {"inicio": "00:00", "titulo": "A"},
            {"inicio": "01:00"},  # sem título
            {"inicio": "02:00", "titulo": "C"},
        ]
        assert formatar_bloco_capitulos(chapters) == ""


class TestFormatarTranscricaoTimestampada:
    def test_agrupa_em_blocos_por_bucket(self):
        segmentos = [
            {"start": 0.0, "texto": "Primeira frase."},
            {"start": 5.0, "texto": "Segunda frase."},
            {"start": 30.0, "texto": "Depois do corte de bucket."},
        ]
        saida = formatar_transcricao_timestampada(segmentos, bucket_seg=25.0)
        linhas = saida.split("\n")
        assert linhas[0] == "[00:00] Primeira frase. Segunda frase."
        assert linhas[1] == "[00:30] Depois do corte de bucket."

    def test_vazio_retorna_vazio(self):
        assert formatar_transcricao_timestampada([]) == ""
        assert formatar_transcricao_timestampada(None) == ""

    def test_ignora_segmentos_sem_texto(self):
        # O segmento em branco (0.0s) é descartado; o marcador reflete o
        # primeiro trecho com fala de verdade (1.0s → [00:01]).
        segmentos = [{"start": 0.0, "texto": "  "}, {"start": 1.0, "texto": "Vale."}]
        assert formatar_transcricao_timestampada(segmentos) == "[00:01] Vale."
