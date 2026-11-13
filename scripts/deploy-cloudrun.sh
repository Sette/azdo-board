#!/usr/bin/env bash
# Deploy seguro e isolado do azdo-board no Google Cloud Run (time pequeno <= 10 pessoas).
# - Cria/usa uma Service Account dedicada sem privilégios no projeto (least-privilege), com acesso
#   APENAS ao secret SESSION_SECRET (isolada de BigQuery, GCS, Vertex AI, etc. da conta compartilhada).
# - Nunca sobe o PERSONAL_ACCESS_TOKEN pessoal do .env (cada usuário cadastra o seu após login Google).
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${ENV_FILE:-$ROOT_DIR/.env}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Erro: arquivo $ENV_FILE não encontrado." >&2
  exit 1
fi

get_env() {
  local key="$1"
  grep -E "^[[:space:]]*${key}=" "$ENV_FILE" | tail -n 1 | cut -d'=' -f2- | sed -E "s/^['\"]|['\"]$//g" || true
}

PROJECT_ID="${GOOGLE_CLOUD_PROJECT:-$(get_env GOOGLE_CLOUD_PROJECT)}"
PROJECT_ID="${PROJECT_ID:-sld-ai-health-score-dev}"
SERVICE_NAME="${CLOUD_RUN_SERVICE:-azdo-board}"
REGION="${CLOUD_RUN_REGION:-us-central1}"
SECRET_NAME="${SESSION_SECRET_NAME:-azdo-board-session-secret}"
SA_NAME="${CLOUD_RUN_SA_NAME:-azdo-board-runner}"
SA_EMAIL="${SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"

AZDO_ORG="$(get_env AZDO_ORG)"
AZDO_PROJECT="$(get_env AZDO_PROJECT)"
AZDO_TEAM="$(get_env AZDO_TEAM)"
APP_LANG="$(get_env APP_LANG)"
GOOGLE_AUTH_ENABLED="$(get_env GOOGLE_AUTH_ENABLED)"
GOOGLE_AUTH_ENABLED="${GOOGLE_AUTH_ENABLED:-false}"
GOOGLE_CLIENT_ID="$(get_env GOOGLE_CLIENT_ID)"
ALLOWED_EMAIL_DOMAIN="$(get_env ALLOWED_EMAIL_DOMAIN)"
ALLOWED_EMAILS="$(get_env ALLOWED_EMAILS)"
SESSION_SECRET="$(get_env SESSION_SECRET)"
MAX_MCP_CLIENTS="$(get_env MAX_MCP_CLIENTS)"

for req_var in PROJECT_ID AZDO_ORG AZDO_PROJECT AZDO_TEAM SESSION_SECRET; do
  if [[ -z "${!req_var:-}" ]]; then
    echo "Erro: variável obrigatória '$req_var' ausente no .env ou ambiente." >&2
    exit 1
  fi
done

if [[ "${GOOGLE_AUTH_ENABLED,,}" =~ ^(true|1|yes|on)$ ]] && [[ -z "$GOOGLE_CLIENT_ID" ]]; then
  echo "Erro: GOOGLE_CLIENT_ID é obrigatório quando GOOGLE_AUTH_ENABLED=true." >&2
  exit 1
fi

echo "==> Projeto GCP: $PROJECT_ID | Serviço: $SERVICE_NAME | Região: $REGION"
echo "==> Service Account isolada: $SA_EMAIL"

# 1. Garante APIs necessárias habilitadas
gcloud services enable \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com \
  secretmanager.googleapis.com \
  --project="$PROJECT_ID"

# 2. Cria Service Account dedicada sem roles de projeto (isolamento total do restante de sld-ai-health-score-dev)
if ! gcloud iam service-accounts describe "$SA_EMAIL" --project="$PROJECT_ID" >/dev/null 2>&1; then
  echo "==> Criando Service Account dedicada '$SA_EMAIL'..."
  gcloud iam service-accounts create "$SA_NAME" \
    --display-name="AzDO Board Cloud Run (Least Privilege)" \
    --project="$PROJECT_ID"
fi

# 3. Salva/atualiza SESSION_SECRET no Secret Manager
if ! gcloud secrets describe "$SECRET_NAME" --project="$PROJECT_ID" >/dev/null 2>&1; then
  echo "==> Criando secret '$SECRET_NAME' no Secret Manager..."
  printf '%s' "$SESSION_SECRET" | gcloud secrets create "$SECRET_NAME" \
    --replication-policy="automatic" \
    --data-file=- \
    --project="$PROJECT_ID"
else
  echo "==> Atualizando versão do secret '$SECRET_NAME'..."
  printf '%s' "$SESSION_SECRET" | gcloud secrets versions add "$SECRET_NAME" \
    --data-file=- \
    --project="$PROJECT_ID" >/dev/null
fi

# 4. Concede acesso SOMENTE a este secret para a Service Account do serviço
gcloud secrets add-iam-policy-binding "$SECRET_NAME" \
  --project="$PROJECT_ID" \
  --member="serviceAccount:${SA_EMAIL}" \
  --role="roles/secretmanager.secretAccessor" >/dev/null

TMP_ENV_YAML="$(mktemp)"
trap 'rm -f "$TMP_ENV_YAML"' EXIT

cat >"$TMP_ENV_YAML" <<EOF
AZDO_ORG: "${AZDO_ORG}"
AZDO_PROJECT: "${AZDO_PROJECT}"
AZDO_TEAM: "${AZDO_TEAM}"
APP_LANG: "${APP_LANG:-pt}"
GOOGLE_AUTH_ENABLED: "${GOOGLE_AUTH_ENABLED}"
GOOGLE_CLIENT_ID: "${GOOGLE_CLIENT_ID}"
ALLOWED_EMAIL_DOMAIN: "${ALLOWED_EMAIL_DOMAIN}"
ALLOWED_EMAILS: "${ALLOWED_EMAILS}"
MAX_MCP_CLIENTS: "${MAX_MCP_CLIENTS:-12}"
EOF

echo "==> Fazendo build e deploy no Cloud Run..."
gcloud run deploy "$SERVICE_NAME" \
  --source="$ROOT_DIR" \
  --project="$PROJECT_ID" \
  --region="$REGION" \
  --platform=managed \
  --service-account="$SA_EMAIL" \
  --allow-unauthenticated \
  --session-affinity \
  --port=8080 \
  --cpu=1 \
  --memory=1Gi \
  --concurrency=20 \
  --timeout=120 \
  --min-instances=0 \
  --max-instances=2 \
  --env-vars-file="$TMP_ENV_YAML" \
  --set-secrets="SESSION_SECRET=${SECRET_NAME}:latest"

SERVICE_URL="$(gcloud run services describe "$SERVICE_NAME" --project="$PROJECT_ID" --region="$REGION" --format='value(status.url)')"
echo ""
echo "✅ Deploy concluído: $SERVICE_URL"
echo "⚠️  Importante: adicione '$SERVICE_URL' em 'Authorized JavaScript origins' do OAuth Client ID ($GOOGLE_CLIENT_ID)"
echo "   Console: https://console.cloud.google.com/apis/credentials?project=${PROJECT_ID}"
