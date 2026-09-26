"""D-155: o banco e os projetos seguem o canal ativo.

Os dados operacionais moram em `instance/channels/<ativo>/projetos/`. O move
que os trouxe do `backend/` legado saiu no D-698, com o comando que o rodava;
fica a resolução: `database_url()` e `projetos_dir()` apontam para o canal, e
caem no legado enquanto o canal não tem banco — nunca abrem um banco vazio
paralelo.
"""

from __future__ import annotations

# --------------------------------------------------------------------------- #
# database_url / projetos_dir seguem o canal ativo
# --------------------------------------------------------------------------- #


def test_database_url_e_projetos_dir_apontam_para_o_canal(tmp_path, monkeypatch):
    from app.core import channel_paths

    instance = tmp_path / "instance"
    canal = instance / "channels" / "meucanal"
    (canal / "projetos").mkdir(parents=True)
    (canal / "projetos" / "projetos.db").write_bytes(b"SQLite format 3\x00dados-do-banco")
    (instance / "active-channel").write_text("meucanal\n", encoding="utf-8")
    monkeypatch.setattr(channel_paths, "_REPO_ROOT", tmp_path)
    monkeypatch.delenv("PROJETOS_DIR", raising=False)

    assert channel_paths.projetos_dir() == canal / "projetos"
    assert channel_paths.database_url() == (
        f"sqlite+aiosqlite:///{(canal / 'projetos' / 'projetos.db').as_posix()}"
    )


def test_projetos_dir_usa_legado_ate_o_banco_existir_no_canal(tmp_path, monkeypatch):
    """ANTES da consolidação (canal sem projetos.db), aponta para o legado — nunca
    abre um banco vazio paralelo enquanto os dados reais estão no `backend/`."""
    from app.core import channel_paths

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
