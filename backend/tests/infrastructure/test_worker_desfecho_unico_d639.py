"""Um job tem UM desfecho, e cancelar vence o código de saída (D-639).

Cancelar um job mata o processo filho; o filho morto sai com código != 0, e o
worker escrevia `erro` por causa disso. Logo depois escrevia `cancelado` por
cima. Quem lê primeiro decide o que o operador vê — e "falhou" manda caçar bug,
enquanto "cancelado" manda seguir a vida.

Honestidade sobre a prova: a corrida é de tempo e NÃO foi reproduzida de forma
confiável (no teste ponta a ponta o leitor chegou depois das duas escritas, tanto
com o código antigo quanto com o novo). Por isso os testes miram a INVARIANTE —
uma resposta por job, cancelamento com precedência — em vez de cronometrar a
corrida.
"""

import json
import re
import shutil
import subprocess
from pathlib import Path

import pytest

WORKER = Path(__file__).resolve().parents[3] / "video-renderer" / "native_worker.js"
pytestmark = pytest.mark.skipif(shutil.which("node") is None, reason="node não está no PATH")

_ESCRITA = re.compile(r"escreverJsonAtomico\([^;]{0,160}", re.S)


def _fonte() -> str:
    return WORKER.read_text(encoding="utf-8")


def _porteiro_e_resto(fonte: str) -> tuple[str, str]:
    inicio = fonte.index("function responderJob")
    fim = fonte.index("function removerSeExistir")
    return fonte[inicio:fim], fonte[:inicio] + fonte[fim:]


def test_toda_resposta_passa_pelo_porteiro():
    """Guarda: fora do porteiro, ninguém escreve `res_`."""
    porteiro, resto = _porteiro_e_resto(_fonte())

    fora = [t for t in _ESCRITA.findall(resto) if "resPath" in t or "res_" in t]

    assert fora == [], f"escrita de resposta fora do porteiro: {fora}"
    assert "escreverJsonAtomico(resPath, payload)" in porteiro


def test_cancelamento_tem_precedencia_sobre_o_codigo_de_saida():
    """O kill É a causa do código != 0; reportá-lo como falha engana o operador."""
    trecho = _fonte()
    inicio = trecho.index("const duracaoJob = formatDuration")
    trecho = trecho[inicio : inicio + 900]

    assert trecho.index("cancelados.has(id)") < trecho.index("code === 0"), (
        "o código de saída está sendo decidido antes do cancelamento"
    )


def test_o_porteiro_ignora_a_segunda_resposta(tmp_path):
    """Roda o porteiro REAL no node: a primeira resposta vence, a segunda é ignorada."""
    fonte = _fonte()
    # Pega o escritor atômico e o porteiro, que vivem em sequência no worker.
    helper = fonte[
        fonte.index("function escreverJsonAtomico") : fonte.index("function removerSeExistir")
    ]
    destino = tmp_path / "res_job.json"
    script = (
        'const fs = require("fs");\n'
        "const respondidos = new Set();\n"
        'const clockNow = () => "";\n'
        f"{helper}\n"
        f"const alvo = {json.dumps(str(destino))};\n"
        'const primeira = responderJob("job", alvo, { status: "cancelado" });\n'
        'const segunda = responderJob("job", alvo, { status: "erro", erro: "Exit code: 1" });\n'
        "console.log(JSON.stringify({ primeira, segunda }));\n"
    )

    saida = subprocess.run(
        ["node", "-e", script], capture_output=True, text=True, check=True, timeout=60
    )

    # O porteiro loga a resposta ignorada antes do JSON — o veredito é a última linha.
    veredito = json.loads(saida.stdout.strip().splitlines()[-1])

    assert veredito == {"primeira": True, "segunda": False}
    assert json.loads(destino.read_text(encoding="utf-8"))["status"] == "cancelado"


def test_o_registro_de_respondidos_e_limpo_ao_fim_do_job():
    """Sem a limpeza, um job reenfileirado com o mesmo id nunca mais responderia."""
    assert "respondidos.delete(id)" in _fonte()
