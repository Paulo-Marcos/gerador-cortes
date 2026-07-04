import sys
from pathlib import Path

from google_auth_oauthlib.flow import InstalledAppFlow

# Este utilitário vive em backend/dev-utils/, mas as credenciais são resolvidas
# pelo MESMO módulo que o serviço de upload usa (app.channel_paths), para que o
# token nasça exatamente onde o backend vai lê-lo — no canal ATIVO
# (instance/channels/<ativo>/youtube/token.json), enquanto o client_secrets pode
# ser compartilhado na raiz do backend (D-168). Sem isto, o script gravava o token
# ao lado de si mesmo (dev-utils/) e o serviço nunca o encontrava.
_BACKEND_ROOT = Path(__file__).resolve().parent.parent
if str(_BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(_BACKEND_ROOT))

from app.channel_paths import youtube_client_secrets_path, youtube_token_path  # noqa: E402

# Escopos expandidos: upload + gerenciamento de playlists
SCOPES = [
    "https://www.googleapis.com/auth/youtube",
    "https://www.googleapis.com/auth/youtube.upload",
]


def main():
    client_secrets_path = youtube_client_secrets_path()
    token_path = youtube_token_path()

    print("====== AUTENTICAÇÃO DO YOUTUBE ======")
    print(f"Crachá do app (client_secrets): {client_secrets_path}")
    print(f"Token do canal ativo (será gerado): {token_path}")

    if not client_secrets_path.exists():
        print(f"\nERRO: 'client_secrets.json' não encontrado em '{client_secrets_path}'.")
        print("Baixe as credenciais OAuth 2.0 (tipo 'Desktop app') do Google Cloud Console")
        print(f"e salve como 'client_secrets.json' em: {client_secrets_path.parent}")
        sys.exit(1)

    print("Iniciando fluxo de autenticação local...")
    print("O seu navegador padrão deverá ser aberto automaticamente.")
    print("Caso não seja, clique no link que aparecerá abaixo.")

    try:
        # Pede login na porta 8080 localmente no host
        flow = InstalledAppFlow.from_client_secrets_file(str(client_secrets_path), SCOPES)
        creds = flow.run_local_server(port=8080)

        # Salva o token ao lado do client_secrets (mesmo diretório que o serviço lê)
        token_path.parent.mkdir(parents=True, exist_ok=True)
        with open(token_path, "w") as token:
            token.write(creds.to_json())

        print(f"\n✅ SUCESSO! Token gerado em: {token_path}")
        print("Reinicie o backend e teste o upload!")
    except Exception as e:
        print(f"\n❌ Falha no processo de autenticação: {e}")


if __name__ == "__main__":
    main()
