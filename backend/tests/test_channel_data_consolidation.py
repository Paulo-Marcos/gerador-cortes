"""D-155: consolidação dos DADOS operacionais do canal na pasta do canal ativo.

Estende o migrador de boot da D-151: além de embrulhar o `instance/` plano em
`channels/<ativo>/`, ele MOVE `backend/projetos/` (banco `projetos.db` + mídias)
e `backend/app/canal_config.py` para dentro do canal, fechando o isolamento
multi-canal (Opção X).

Invariantes exercitadas (segurança/LOSSLESS é o ponto crítico):

  - LOSSLESS: tudo o que estava em `backend/projetos` e `app/canal_config.py`
    aparece sob o canal, com os mesmos checksums; a origem some;
  - IDEMPOTENTE: rodar de novo é NO-OP — origem já não existe, nada muda;
  - PLACEHOLDER: um `projetos/` de destino que só tem `.gitkeep` é tratado como
    vazio e substituído sem perda;
  - DEFENSIVO: destino com dados REAIS coexistindo com a origem → aborta;
  - SAME-VOLUME: origem e destino em volumes diferentes → aborta, sem mover nada;
  - ISOLAMENTO DE TESTE: chamar com `instance_root` próprio mas SEM `backend_root`
    nunca toca nos dados reais.
"""

from __future__ import annotations

import hashlib
from pathlib import Path

import pytest
from app import channel_layout_migration as mod
from app.channel_layout_migration import (
    LayoutMigrationError,
    consolidar_dados_do_canal,
)

# --------------------------------------------------------------------------- #
# Fixtures auxiliares
# --------------------------------------------------------------------------- #


def _criar_instance_plano(instance: Path, handle: str = "@meucanal") -> None:
    """`instance/` plano mínimo (editorial), SEM os dados operacionais — esses
    vivem no `backend/` e são trazidos pela consolidação."""
    instance.mkdir(parents=True, exist_ok=True)
    (instance / "channel.yaml").write_text(
        f'handle: "{handle}"\nnome: "Meu Canal"\n', encoding="utf-8"
    )
    (instance / "editorial").mkdir()
    (instance / "editorial" / "cortes.md").write_text("# cortes\n", encoding="utf-8")


def _criar_backend(backend: Path) -> dict[str, str]:
    """`backend/` legado com `projetos/` (db + mídias) e `app/canal_config.py`.

    Devolve checksums por caminho relativo ao `backend/` para conferência LOSSLESS.
    """
    app = backend / "app"
    app.mkdir(parents=True)
    (app / "canal_config.py").write_text("CREDITOS_TEMPLATE = 'x'\n", encoding="utf-8")

    projetos = backend / "projetos"
    projetos.mkdir()
    (projetos / "projetos.db").write_bytes(b"SQLite format 3\x00dados-do-banco")
    (projetos / "uuid-1").mkdir()
    (projetos / "uuid-1" / "video.mp4").write_bytes(b"\x00\x01\x02 midia bruta")
    (projetos / "uuid-1" / "legenda.vtt").write_text("WEBVTT\n", encoding="utf-8")
    (projetos / "uuid-2").mkdir()
    (projetos / "uuid-2" / "thumb.png").write_bytes(b"\x89PNG midia")
    return _checksums(backend)


def _checksums(raiz: Path) -> dict[str, str]:
    saida: dict[str, str] = {}
    for arquivo in sorted(raiz.rglob("*")):
        if arquivo.is_file():
            rel = arquivo.relative_to(raiz).as_posix()
            saida[rel] = hashlib.sha256(arquivo.read_bytes()).hexdigest()
    return saida


# --------------------------------------------------------------------------- #
# LOSSLESS
# --------------------------------------------------------------------------- #


def test_consolida_banco_projetos_e_canal_config_sem_perda(tmp_path):
    instance = tmp_path / "instance"
    backend = tmp_path / "backend"
    _criar_instance_plano(instance, handle="@meucanal")
    antes = _criar_backend(backend)

    resultado = consolidar_dados_do_canal(instance_root=instance, backend_root=backend)

    canal = instance / "channels" / "meucanal"
    assert resultado.canal_root == canal

    # Banco + mídias agora sob o canal, com checksums idênticos (nada perdido).
    assert (canal / "projetos" / "projetos.db").is_file()
    depois_projetos = _checksums(canal / "projetos")
    antes_projetos = {
        k[len("projetos/") :]: v for k, v in antes.items() if k.startswith("projetos/")
    }
    assert depois_projetos == antes_projetos

    # canal_config.py movido para a RAIZ do canal, byte-a-byte.
    assert (canal / "canal_config.py").read_text(encoding="utf-8") == "CREDITOS_TEMPLATE = 'x'\n"

    # Origem legada esvaziada: dados não vivem mais fora da instância.
    assert not (backend / "projetos").exists()
    assert not (backend / "app" / "canal_config.py").exists()


def test_consolidacao_e_idempotente(tmp_path):
    instance = tmp_path / "instance"
    backend = tmp_path / "backend"
    _criar_instance_plano(instance)
    _criar_backend(backend)

    consolidar_dados_do_canal(instance_root=instance, backend_root=backend)
    canal = instance / "channels" / "meucanal"
    estado_apos_primeiro = _checksums(canal)

    # 2ª passagem: layout já migrado (noop) e origem já consolidada → nada muda.
    resultado2 = consolidar_dados_do_canal(instance_root=instance, backend_root=backend)
    estado_apos_segundo = _checksums(canal)

    assert resultado2.acao == "noop"
    assert estado_apos_segundo == estado_apos_primeiro


def test_destino_so_com_placeholder_e_substituido(tmp_path):
    """Canal já migrado cujo `projetos/` é só um `.gitkeep` recebe os dados reais."""
    instance = tmp_path / "instance"
    backend = tmp_path / "backend"
    canal = instance / "channels" / "default"
    (canal / "editorial").mkdir(parents=True)
    (canal / "projetos").mkdir(parents=True)
    (canal / "projetos" / ".gitkeep").write_text("", encoding="utf-8")
    (instance / "active-channel").write_text("default\n", encoding="utf-8")
    _criar_backend(backend)

    resultado = consolidar_dados_do_canal(instance_root=instance, backend_root=backend)

    assert resultado.acao == "noop"
    assert (canal / "projetos" / "projetos.db").is_file()
    assert (canal / "projetos" / "uuid-1" / "video.mp4").is_file()
    assert not (backend / "projetos").exists()


# --------------------------------------------------------------------------- #
# DEFENSIVO
# --------------------------------------------------------------------------- #


def test_aborta_quando_destino_tem_dados_reais(tmp_path):
    """Destino com dados reais E origem presente → ambíguo, aborta sem sobrescrever."""
    instance = tmp_path / "instance"
    backend = tmp_path / "backend"
    canal = instance / "channels" / "default"
    (canal / "projetos").mkdir(parents=True)
    (canal / "projetos" / "ja-existe.db").write_bytes(b"banco preexistente")
    (instance / "active-channel").write_text("default\n", encoding="utf-8")
    _criar_backend(backend)

    with pytest.raises(LayoutMigrationError):
        consolidar_dados_do_canal(instance_root=instance, backend_root=backend)

    # LOSSLESS no abort: nada da origem foi perdido.
    assert (backend / "projetos" / "projetos.db").is_file()
    assert (canal / "projetos" / "ja-existe.db").is_file()


def test_aborta_quando_volumes_diferentes(tmp_path, monkeypatch):
    """Origem e destino em volumes distintos → aborta, sem mover/copiar 70GB."""
    instance = tmp_path / "instance"
    backend = tmp_path / "backend"
    _criar_instance_plano(instance, handle="@meucanal")
    _criar_backend(backend)

    # Simula volumes diferentes: id do volume varia pelo lado da árvore.
    def fake_id_volume(caminho: Path) -> int:
        return 1 if str(backend) in str(caminho) else 2

    monkeypatch.setattr(mod, "_id_volume", fake_id_volume)

    with pytest.raises(LayoutMigrationError, match="volumes diferentes"):
        consolidar_dados_do_canal(instance_root=instance, backend_root=backend)

    # Nada foi movido: a origem permanece intacta.
    assert (backend / "projetos" / "projetos.db").is_file()
    assert (backend / "app" / "canal_config.py").is_file()


def test_sem_backend_root_explicito_recusa(tmp_path):
    """Com `instance_root` próprio e SEM `backend_root`, a função RECUSA — blindagem
    contra mover os dados REAIS do `backend/` para dentro de uma fixture de teste."""
    instance = tmp_path / "instance"
    _criar_instance_plano(instance, handle="@meucanal")

    with pytest.raises(ValueError, match="backend_root"):
        consolidar_dados_do_canal(instance_root=instance)

    # Nada foi materializado a partir dos dados reais.
    assert not (instance / "channels" / "meucanal" / "projetos").exists()


# --------------------------------------------------------------------------- #
# database_url / projetos_dir seguem o canal ativo
# --------------------------------------------------------------------------- #


def test_database_url_e_projetos_dir_apontam_para_o_canal(tmp_path, monkeypatch):
    from app import channel_paths

    instance = tmp_path / "instance"
    backend = tmp_path / "backend"
    _criar_instance_plano(instance, handle="@meucanal")
    _criar_backend(backend)
    monkeypatch.setattr(channel_paths, "_REPO_ROOT", tmp_path)

    consolidar_dados_do_canal(instance_root=instance, backend_root=backend)

    canal = instance / "channels" / "meucanal"
    assert channel_paths.projetos_dir() == canal / "projetos"
    assert channel_paths.database_url() == (
        f"sqlite+aiosqlite:///{(canal / 'projetos' / 'projetos.db').as_posix()}"
    )


def test_projetos_dir_usa_legado_ate_o_banco_existir_no_canal(tmp_path, monkeypatch):
    """ANTES da consolidação (canal sem projetos.db), aponta para o legado — nunca
    abre um banco vazio paralelo enquanto os dados reais estão no `backend/`."""
    from app import channel_paths

    instance = tmp_path / "instance"
    canal = instance / "channels" / "meucanal"
    (canal / "projetos").mkdir(parents=True)
    (canal / "projetos" / ".gitkeep").write_text("", encoding="utf-8")  # só placeholder
    (instance / "active-channel").write_text("meucanal\n", encoding="utf-8")
    legado = tmp_path / "backend" / "projetos"
    legado.mkdir(parents=True)

    monkeypatch.setattr(channel_paths, "_REPO_ROOT", tmp_path)
    monkeypatch.setattr(channel_paths, "_BACKEND_ROOT", tmp_path / "backend")
    monkeypatch.delenv("PROJETOS_DIR", raising=False)

    # Canal ativo existe, mas sem projetos.db → legado.
    assert channel_paths.projetos_dir() == legado

    # Depois que o banco existe no canal, vira para o canal.
    (canal / "projetos" / "projetos.db").write_bytes(b"db")
    assert channel_paths.projetos_dir() == canal / "projetos"
