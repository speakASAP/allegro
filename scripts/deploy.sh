#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; BLUE='\033[0;34m'; NC='\033[0m'

SERVICE_NAME="allegro-service"
API_GATEWAY_NAME="allegro-api-gateway"
FRONTEND_NAME="allegro-frontend"
SETTINGS_NAME="allegro-settings"
IMPORTS_NAME="allegro-imports"
NAMESPACE="${NAMESPACE:-statex-apps}"
K8S_DIR="$PROJECT_ROOT/k8s"
REGISTRY="${REGISTRY:-localhost:5000}"
# Tag describes the WORKING TREE that is actually built, not just git HEAD:
# a tag derived from HEAD alone repeats itself when files changed without a
# commit, which makes `kubectl set image` a no-op and silently keeps the old
# image running.
compute_default_tag() {
  local head dirty root
  root="${PROJECT_ROOT:-$(pwd)}"
  head="$(git -C "$root" rev-parse --short HEAD 2>/dev/null || true)"
  if [ -z "$head" ]; then
    echo "build-$(date -u +%Y%m%d%H%M%S)"
    return
  fi
  dirty="$(git -C "$root" status --porcelain 2>/dev/null || true)"
  if [ -n "$dirty" ]; then
    echo "${head}-wt$(date -u +%Y%m%d%H%M%S)"
  else
    echo "$head"
  fi
}

DEFAULT_TAG="$(compute_default_tag)"
IMAGE_TAG="${1:-$DEFAULT_TAG}"
SERVICE_IMAGE="${REGISTRY}/${SERVICE_NAME}:${IMAGE_TAG}"
SERVICE_IMAGE_LATEST="${REGISTRY}/${SERVICE_NAME}:latest"
API_GATEWAY_IMAGE="${REGISTRY}/${API_GATEWAY_NAME}:${IMAGE_TAG}"
API_GATEWAY_IMAGE_LATEST="${REGISTRY}/${API_GATEWAY_NAME}:latest"
FRONTEND_IMAGE="${REGISTRY}/${FRONTEND_NAME}:${IMAGE_TAG}"
FRONTEND_IMAGE_LATEST="${REGISTRY}/${FRONTEND_NAME}:latest"
SETTINGS_IMAGE="${REGISTRY}/${SETTINGS_NAME}:${IMAGE_TAG}"
SETTINGS_IMAGE_LATEST="${REGISTRY}/${SETTINGS_NAME}:latest"
IMPORTS_IMAGE="${REGISTRY}/${IMPORTS_NAME}:${IMAGE_TAG}"
IMPORTS_IMAGE_LATEST="${REGISTRY}/${IMPORTS_NAME}:latest"
FRONTEND_API_URL="${FRONTEND_API_URL:-https://allegro.alfares.cz/api}"

# shellcheck disable=SC1091
source "$(dirname "$PROJECT_ROOT")/shared/scripts/load-deploy-phase-timing.sh" "$PROJECT_ROOT" 2>/dev/null \
  || source "$HOME/Documents/Github/shared/scripts/load-deploy-phase-timing.sh" "$PROJECT_ROOT" \
  || { echo "Error: deploy timing library not found" >&2; exit 1; }
deploy_timing_init "$SERVICE_NAME"

preflight_service_health() {
  echo -e "${YELLOW}Preflight: checking Kubernetes and current service health...${NC}"

  if ! kubectl get namespace "$NAMESPACE" >/dev/null 2>&1; then
    echo -e "${RED}Namespace not found: $NAMESPACE${NC}"
    exit 1
  fi

  if ! kubectl get nodes >/dev/null 2>&1; then
    echo -e "${RED}kubectl cannot reach cluster${NC}"
    exit 1
  fi

  for app in "$SERVICE_NAME" "$API_GATEWAY_NAME" "$FRONTEND_NAME" "$SETTINGS_NAME" "$IMPORTS_NAME"; do
    BAD_PODS=$(kubectl get pods -n "$NAMESPACE" -l app="$app" --no-headers 2>/dev/null | awk '$3 ~ /Error|CrashLoopBackOff|ImagePullBackOff|CreateContainerConfigError|CreateContainerError|ErrImagePull/ {print $1}')
    if [ -n "$BAD_PODS" ]; then
      echo -e "${RED}Deployment $app has unhealthy pods before deploy:${NC}"
      kubectl get pods -n "$NAMESPACE" -l app="$app" -o wide || true
      exit 1
    fi
  done

  echo -e "${GREEN}Preflight passed${NC}"
}

rollout_wait() {
  local deployment="$1"
  echo -e "${YELLOW}Waiting for ${deployment} rollout...${NC}"
  deploy_timing_k8s_rollout_wait kubectl "$deployment" "$NAMESPACE"
}

echo -e "${BLUE}==========================================================${NC}"
echo -e "${BLUE}  Allegro Service - Kubernetes Deployment${NC}"
echo -e "${BLUE}==========================================================${NC}"

if [ ! -d "$K8S_DIR" ]; then
  echo -e "${RED}Missing k8s directory: $K8S_DIR${NC}"
  exit 1
fi

deploy_timing_run_phase "Preflight" preflight_service_health

deploy_timing_phase_start "Build images"
docker build -f "$PROJECT_ROOT/services/allegro-service/Dockerfile" -t "$SERVICE_IMAGE" -t "$SERVICE_IMAGE_LATEST" "$PROJECT_ROOT"
docker build -f "$PROJECT_ROOT/services/api-gateway/Dockerfile" -t "$API_GATEWAY_IMAGE" -t "$API_GATEWAY_IMAGE_LATEST" "$PROJECT_ROOT"
docker build -f "$PROJECT_ROOT/services/settings/Dockerfile" -t "$SETTINGS_IMAGE" -t "$SETTINGS_IMAGE_LATEST" "$PROJECT_ROOT"
docker build -f "$PROJECT_ROOT/services/imports/Dockerfile" -t "$IMPORTS_IMAGE" -t "$IMPORTS_IMAGE_LATEST" "$PROJECT_ROOT"
docker build -f "$PROJECT_ROOT/services/frontend/Dockerfile" --build-arg FRONTEND_API_URL="$FRONTEND_API_URL" -t "$FRONTEND_IMAGE" -t "$FRONTEND_IMAGE_LATEST" "$PROJECT_ROOT"
deploy_timing_phase_end "Build images"

deploy_timing_phase_start "Push images"
docker push "$SERVICE_IMAGE"
docker push "$SERVICE_IMAGE_LATEST"
docker push "$API_GATEWAY_IMAGE"
docker push "$API_GATEWAY_IMAGE_LATEST"
docker push "$FRONTEND_IMAGE"
docker push "$SETTINGS_IMAGE"
docker push "$SETTINGS_IMAGE_LATEST"
docker push "$IMPORTS_IMAGE"
docker push "$IMPORTS_IMAGE_LATEST"
docker push "$FRONTEND_IMAGE_LATEST"
deploy_timing_phase_end "Push images"

deploy_timing_phase_start "Apply Kubernetes manifests"
echo -e "${YELLOW}Applying Kubernetes manifests...${NC}"

apply_static_manifest() {
  local manifest="$1"
  if [ -f "$K8S_DIR/$manifest" ]; then
    kubectl apply -f "$K8S_DIR/$manifest" -n "$NAMESPACE"
  fi
}

apply_deployment_manifest() {
  local manifest="$1"
  local image_name="$2"
  local image="$3"
  local rendered
  rendered="$(mktemp)"
  sed "s|image: ${REGISTRY}/${image_name}:latest|image: ${image}|" "$K8S_DIR/$manifest" > "$rendered"
  kubectl apply -f "$rendered" -n "$NAMESPACE"
  rm -f "$rendered"
}

apply_static_manifest configmap.yaml
apply_static_manifest external-secret.yaml
apply_deployment_manifest deployment.yaml "$SERVICE_NAME" "$SERVICE_IMAGE"
apply_static_manifest service.yaml
apply_deployment_manifest api-gateway-deployment.yaml "$API_GATEWAY_NAME" "$API_GATEWAY_IMAGE"
apply_static_manifest api-gateway-service.yaml
apply_deployment_manifest settings-deployment.yaml "$SETTINGS_NAME" "$SETTINGS_IMAGE"
apply_static_manifest settings-service.yaml
apply_deployment_manifest imports-deployment.yaml "$IMPORTS_NAME" "$IMPORTS_IMAGE"
apply_static_manifest imports-service.yaml
apply_deployment_manifest frontend-deployment.yaml "$FRONTEND_NAME" "$FRONTEND_IMAGE"
apply_static_manifest frontend-service.yaml

echo -e "${GREEN}OK Kubernetes manifests applied${NC}"
deploy_timing_phase_end "Apply Kubernetes manifests"

deploy_timing_phase_start "Set deployment images"
kubectl set image "deployment/${SERVICE_NAME}" app="$SERVICE_IMAGE" -n "$NAMESPACE"
kubectl set image "deployment/${API_GATEWAY_NAME}" app="$API_GATEWAY_IMAGE" -n "$NAMESPACE"
kubectl set image "deployment/${FRONTEND_NAME}" app="$FRONTEND_IMAGE" -n "$NAMESPACE"
kubectl set image "deployment/${SETTINGS_NAME}" app="$SETTINGS_IMAGE" -n "$NAMESPACE"
kubectl set image "deployment/${IMPORTS_NAME}" app="$IMPORTS_IMAGE" -n "$NAMESPACE"
deploy_timing_phase_end "Set deployment images"

deploy_timing_phase_start "Wait for rollouts"
rollout_wait "$SERVICE_NAME"
rollout_wait "$API_GATEWAY_NAME"
rollout_wait "$SETTINGS_NAME"
rollout_wait "$IMPORTS_NAME"
rollout_wait "$FRONTEND_NAME"
deploy_timing_phase_end "Wait for rollouts"

deploy_timing_phase_start "Switch ingress"
apply_static_manifest ingress.yaml
deploy_timing_phase_end "Switch ingress"

deploy_timing_phase_start "Post-deploy status"
kubectl get pods -n "$NAMESPACE" -l app="$SERVICE_NAME"
kubectl get pods -n "$NAMESPACE" -l app="$API_GATEWAY_NAME"
kubectl get pods -n "$NAMESPACE" -l app="$FRONTEND_NAME"
kubectl get pods -n "$NAMESPACE" -l app="$SETTINGS_NAME"
kubectl get pods -n "$NAMESPACE" -l app="$IMPORTS_NAME"
deploy_timing_phase_end "Post-deploy status"

deploy_timing_finish_success "Allegro Service"
DEPLOY_TIMING_FINISHED=1
exit 0
