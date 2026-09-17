#!/usr/bin/env bash
# bin/bootstrap.sh — primeira instalação do CutCut no Linux/macOS (D-630).
#
# Mesma receita do bin/bootstrap.ps1: confere o que precisa existir antes, cria
# o ambiente Python do backend, instala as dependências do frontend e do
# renderer e cria o backend/.env a partir do exemplo — sem nunca sobrescrever
# um .env já existente. Pode rodar de novo quantas vezes quiser.
#
# Uso:
#   bin/bootstrap.sh          # instalação normal
#   bin/bootstrap.sh --dev    # + dependências de teste do backend
#
# Nota: o app sobe hoje pelo dev.ps1 (PowerShell). No Linux/macOS este script
# deixa tudo instalado, mas a subida ainda é manual (uvicorn + npm run dev).
set -euo pipefail

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEV=0
[[ "${1:-}" == "--dev" ]] && DEV=1

passo() { printf '\n→ %s\n' "$1"; }
ok() { printf '  ok: %s\n' "$1"; }
aviso() { printf '  aviso: %s\n' "$1"; }
parar() {
  printf '\n  ✗ %s\n' "$1" >&2
  exit 1
}

# `head -1` e o ponto: em "Python 3.13.1" ou "v20.11.0" a PRIMEIRA dupla e a
# versao; um casamento guloso pegaria "13.1"/"11.0" e barraria um Node valido.
versao_maior_menor() { grep -oE '[0-9]+\.[0-9]+' <<<"$1" | head -1; }

# Compara duas versões "maior.menor": 0 quando a primeira é >= a segunda.
versao_suficiente() { [[ "$(printf '%s\n%s\n' "$2" "$1" | sort -t. -k1,1n -k2,2n | head -1)" == "$2" ]]; }

exigir_versao() {
  local nome="$1" binario="$2" argumento="$3" minima="$4" como_instalar="$5" versao
  command -v "$binario" >/dev/null 2>&1 || parar "$nome não encontrado. $como_instalar"
  versao="$(versao_maior_menor "$("$binario" "$argumento" 2>&1)")"
  if [[ -n "$versao" ]] && ! versao_suficiente "$versao" "$minima"; then
    parar "$nome $versao é antigo demais (mínimo $minima). $como_instalar"
  fi
  ok "$nome ${versao:-?}"
}

echo "CutCut — instalação inicial"
echo "Raiz: $RAIZ"

# ─── 1. O que precisa existir ANTES ──────────────────────────────────────────
passo "1/5 Conferindo o que precisa estar instalado"
PYTHON=python3
command -v "$PYTHON" >/dev/null 2>&1 || PYTHON=python
exigir_versao "Python" "$PYTHON" "--version" "3.11" "Instale o Python 3.11+ (apt install python3 / brew install python)."
exigir_versao "Node.js" "node" "--version" "20.0" "Instale o Node.js 20+ (https://nodejs.org)."
command -v npm >/dev/null 2>&1 || parar "npm não encontrado. Ele vem com o Node.js."

# ffmpeg e yt-dlp não são necessários para INSTALAR, só para usar: avisar basta,
# e a tela de Pré-requisitos cobra depois.
for ferramenta in ffmpeg yt-dlp; do
  if command -v "$ferramenta" >/dev/null 2>&1; then
    ok "$ferramenta"
  else
    aviso "$ferramenta não está no PATH — o app precisa dele para rodar (apt install $ferramenta / brew install $ferramenta)."
  fi
done

# ─── 2. Backend ──────────────────────────────────────────────────────────────
passo "2/5 Ambiente Python do backend"
VENV="$RAIZ/backend/.venv"
VENV_PYTHON="$VENV/bin/python"
if [[ -x "$VENV_PYTHON" ]]; then
  ok "venv já existe (backend/.venv)"
else
  "$PYTHON" -m venv "$VENV"
  [[ -x "$VENV_PYTHON" ]] || parar "não consegui criar o venv em $VENV"
  ok "venv criado"
fi
"$VENV_PYTHON" -m pip install --upgrade pip --quiet
"$VENV_PYTHON" -m pip install -r "$RAIZ/backend/requirements.txt"
[[ $DEV -eq 1 ]] && "$VENV_PYTHON" -m pip install -r "$RAIZ/backend/requirements-dev.txt"
ok "dependências do backend instaladas"

# ─── 3. Frontend e renderer ──────────────────────────────────────────────────
passo "3/5 Dependências do frontend e do renderer"
for pacote in frontend video-renderer; do
  (cd "$RAIZ/$pacote" && npm ci)
  ok "$pacote pronto"
done

# ─── 4. Configuração ─────────────────────────────────────────────────────────
passo "4/5 Arquivo de configuração do backend"
if [[ -f "$RAIZ/backend/.env" ]]; then
  ok "backend/.env já existe — mantido como está"
else
  cp "$RAIZ/backend/.env.example" "$RAIZ/backend/.env"
  ok "backend/.env criado a partir do exemplo"
fi

# ─── 5. Próximo passo ────────────────────────────────────────────────────────
passo "5/5 Pronto"
cat <<'FIM'
  Suba o backend:   backend/.venv/bin/python -m uvicorn app.main:app --reload --port 8000  (na pasta backend)
  Suba o frontend:  npm run dev  (na pasta frontend)
  Depois, no navegador: Configurações → aba Aplicação → cartão "Pré-requisitos"
FIM
