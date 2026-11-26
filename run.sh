#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

MODE="dev"

usage() {
  cat <<'EOF'
Uso: ./run.sh [modo]

Modos disponíveis:
  dev, --dev        Inicia API (:3001) + Web Vite (:5173) em modo desenvolvimento (padrão)
  prod, --prod      Faz build do frontend e inicia o servidor Express unificado (:3001)
  demo, --demo      Inicia em modo demonstração com dados fictícios (sem Azure DevOps/PAT)
  docker, --docker  Sobe a aplicação via Docker Compose
  -h, --help        Exibe esta ajuda
EOF
}

if [[ $# -gt 0 ]]; then
  case "$1" in
    dev|--dev)                 MODE="dev" ;;
    prod|--prod|start|--start) MODE="prod" ;;
    demo|--demo)               MODE="demo" ;;
    docker|--docker)           MODE="docker" ;;
    -h|--help|help)            usage; exit 0 ;;
    *)
      echo "Erro: opção desconhecida '$1'." >&2
      usage >&2
      exit 1
      ;;
  esac
fi

if [[ "$MODE" == "docker" ]]; then
  if ! command -v docker >/dev/null 2>&1; then
    echo "Erro: 'docker' não encontrado no PATH." >&2
    exit 1
  fi
  echo "==> Iniciando azdo-board via Docker Compose..."
  exec docker compose up --build
fi

if [[ -d "$HOME/.local/bin" && ":$PATH:" != *":$HOME/.local/bin:"* ]]; then
  export PATH="$HOME/.local/bin:$PATH"
fi

if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
  export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
  if [[ -s "$NVM_DIR/nvm.sh" ]]; then
    set +u
    # shellcheck disable=SC1091
    . "$NVM_DIR/nvm.sh"
    set -u
  fi
fi

if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
  echo "Erro: Node.js (>= 20) e npm são obrigatórios." >&2
  exit 1
fi

NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if [[ "$NODE_MAJOR" -lt 20 ]]; then
  echo "Erro: Node.js 20+ é necessário (versão atual: $(node -v))." >&2
  exit 1
fi

if [[ ! -d "node_modules" ]]; then
  echo "==> Dependências não encontradas. Executando 'npm install'..."
  npm install
fi

if [[ "$MODE" != "demo" && ! -f ".env" ]]; then
  if [[ -f ".env.example" ]]; then
    cp .env.example .env
    echo "Aviso: arquivo '.env' criado a partir de '.env.example'." >&2
    echo "Configure AZDO_ORG, AZDO_PROJECT e AZDO_TEAM em '.env' antes de iniciar (ou rode './run.sh demo')." >&2
    exit 1
  else
    echo "Erro: arquivo '.env' não encontrado." >&2
    exit 1
  fi
fi

case "$MODE" in
  dev)
    echo "==> Iniciando azdo-board em modo desenvolvimento (UI: http://127.0.0.1:5173 | API: http://127.0.0.1:${PORT:-3001})..."
    exec npm run dev
    ;;
  demo)
    echo "==> Iniciando azdo-board em modo demo (UI: http://127.0.0.1:5173 | API: http://127.0.0.1:${PORT:-3001})..."
    exec npm run demo
    ;;
  prod)
    echo "==> Gerando build do frontend..."
    npm run build
    echo "==> Iniciando servidor em http://127.0.0.1:${PORT:-3001}..."
    exec npm start
    ;;
esac
