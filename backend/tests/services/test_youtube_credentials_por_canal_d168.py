"""D-168: credenciais OAuth do YouTube — token por canal, crachá compartilhado.

Cobre os resolvers `youtube_client_secrets_path` / `youtube_token_path`:
- (a) layout LEGADO (sem canal ativo) resolve ambos na raiz do backend;
- (b) canal ativo com override do `client_secrets` na pasta do canal tem precedência;
- (c) modelo recomendado: `client_secrets` compartilhado (raiz) + token SEMPRE por canal.
"""

from app import channel_paths
from app.channel_paths import youtube_client_secrets_path, youtube_token_path


def _fixar_layout(monkeypatch, *, instance_root, canal_root, backend_root):
    monkeypatch.setattr(channel_paths, "_instance_root", lambda: instance_root)
    monkeypatch.setattr(channel_paths, "active_channel_root", lambda: canal_root)
    monkeypatch.setattr(channel_paths, "_BACKEND_ROOT", backend_root)


def test_legado_resolve_na_raiz_do_backend(tmp_path, monkeypatch):
    instance = tmp_path / "instance"
    backend = tmp_path / "backend"
    # Sem canal ativo: active_channel_root == _instance_root (fallback legado).
    _fixar_layout(monkeypatch, instance_root=instance, canal_root=instance, backend_root=backend)

    assert youtube_client_secrets_path() == backend / "client_secrets.json"
    assert youtube_token_path() == backend / "token.json"


def test_canal_ativo_com_credencial_resolve_na_pasta_do_canal(tmp_path, monkeypatch):
    instance = tmp_path / "instance"
    canal = instance / "channels" / "sapo"
    backend = tmp_path / "backend"
    (canal / "youtube").mkdir(parents=True)
    (canal / "youtube" / "client_secrets.json").write_text("{}", encoding="utf-8")
    _fixar_layout(monkeypatch, instance_root=instance, canal_root=canal, backend_root=backend)

    assert youtube_client_secrets_path() == canal / "youtube" / "client_secrets.json"
    # token nasce ao lado do client_secrets resolvido
    assert youtube_token_path() == canal / "youtube" / "token.json"


def test_crachac_compartilhado_com_token_por_canal(tmp_path, monkeypatch):
    """Modelo recomendado: client_secrets na raiz (compartilhado), token por canal."""
    instance = tmp_path / "instance"
    canal = instance / "channels" / "sapo"
    backend = tmp_path / "backend"
    canal.mkdir(parents=True)  # canal ativo, SEM client_secrets próprio
    _fixar_layout(monkeypatch, instance_root=instance, canal_root=canal, backend_root=backend)

    # crachá do app: compartilhado na raiz do backend
    assert youtube_client_secrets_path() == backend / "client_secrets.json"
    # login: SEMPRE por canal, mesmo com o crachá compartilhado
    assert youtube_token_path() == canal / "youtube" / "token.json"
