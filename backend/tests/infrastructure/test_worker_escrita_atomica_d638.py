"""A resposta do worker aparece inteira, ou não aparece (D-638).

O backend reage ao evento de CRIAÇÃO do `res_` (watchfiles) e lê na hora. Com
escrita direta, ele podia abrir o arquivo no meio da gravação e receber JSON
truncado — que vira um `WorkerJobFailed` mentiroso ("falha ao ler resposta") num
job que DEU CERTO: o render é perdido e a investigação começa no lugar errado.

O lado Python já escrevia atômico (`escrever_json_atomico`); o worker Node não.
Estes testes rodam o JS DE VERDADE (node é pré-requisito do projeto) e guardam
a regra no arquivo, para a próxima escrita nascer atômica também.
"""

import json
import re
import shutil
import subprocess
from pathlib import Path

import pytest

WORKER = Path(__file__).resolve().parents[3] / "video-renderer" / "native_worker.js"
pytestmark = pytest.mark.skipif(shutil.which("node") is None, reason="node não está no PATH")


def _fonte() -> str:
    return WORKER.read_text(encoding="utf-8")


def test_o_worker_tem_o_escritor_atomico_com_tmp_e_rename():
    fonte = _fonte()
    corpo = fonte[fonte.index("function escreverJsonAtomico") :][:400]

    assert ".tmp" in corpo, "sem arquivo temporário não há atomicidade"
    assert "renameSync" in corpo, "o rename é o que torna a troca atômica"


def test_nenhuma_resposta_da_fila_e_escrita_direto():
    """Guarda de regressão: `res_`/`ack_` só saem pelo escritor atômico."""
    fonte = _fonte()
    # A única escrita direta legítima é a do `.tmp`, dentro do próprio helper.
    diretas = [
        trecho
        for trecho in re.findall(r"fs\.writeFileSync\([^;]{0,200}", fonte, re.S)
        if "temporario" not in trecho
    ]

    assert diretas == [], f"escrita direta encontrada: {diretas[:1]}"


def test_o_arquivo_final_nunca_existe_pela_metade(tmp_path):
    """Roda o helper real no node e confirma o que o backend precisa ler."""
    destino = tmp_path / "res_job.json"
    payload = {"status": "sucesso", "duration_ms": 123456, "detalhe": "x" * 8192}
    script = f"""
      const fs = require("fs");
      {_fonte()[_fonte().index("function escreverJsonAtomico") :].split("function removerSeExistir")[0]}
      escreverJsonAtomico({json.dumps(str(destino))}, {json.dumps(payload)});
      // Se o `.tmp` sobrar, a pasta da fila acumula lixo que o backend vê.
      console.log(JSON.stringify({{ tmp_sobrou: fs.existsSync({json.dumps(str(destino) + ".tmp")}) }}));
    """

    saida = subprocess.run(
        ["node", "-e", script], capture_output=True, text=True, check=True, timeout=60
    )

    assert json.loads(saida.stdout)["tmp_sobrou"] is False
    assert json.loads(destino.read_text(encoding="utf-8")) == payload


def test_leitura_no_meio_da_escrita_direta_falha(tmp_path):
    """O bug que motivou a story, para o teste acima não virar fé.

    Metade do JSON no caminho final é exatamente o que o backend recebia.
    """
    destino = tmp_path / "res_job.json"
    inteiro = json.dumps({"status": "sucesso", "duration_ms": 1})
    destino.write_text(inteiro[: len(inteiro) // 2], encoding="utf-8")

    with pytest.raises(json.JSONDecodeError):
        json.loads(destino.read_text(encoding="utf-8"))
