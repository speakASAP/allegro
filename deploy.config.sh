# deploy.config.sh — declaration consumed by shared/scripts/deploy.sh.
# See shared/docs/DEPLOY_STANDARDIZATION_REPORT.md section 6/7 (Phase D) for the design.
# scripts/deploy.sh is still the live, authoritative deploy path.
#
# 5 images/deployments (service, api-gateway, settings, imports, frontend),
# each sed-templated then also kubectl set-image'd. Ingress is deliberately
# applied LAST, after all 5 rollouts complete (a gradual-cutover pattern) --
# modeled as deploy_post_verify, which runs after Wait-for-rollout/Verify.
# The other of the two services from the 2026-07-18 containerd incident.

SERVICE_NAME="allegro-service"
API_GATEWAY_NAME="allegro-api-gateway"
FRONTEND_NAME="allegro-frontend"
SETTINGS_NAME="allegro-settings"
IMPORTS_NAME="allegro-imports"
PORT="3000"

FRONTEND_API_URL="${FRONTEND_API_URL:-https://allegro.alfares.cz/api}"

IMAGES=(
  "allegro-service|.|services/allegro-service/Dockerfile|"
  "allegro-api-gateway|.|services/api-gateway/Dockerfile|"
  "allegro-settings|.|services/settings/Dockerfile|"
  "allegro-imports|.|services/imports/Dockerfile|"
  "allegro-frontend|.|services/frontend/Dockerfile|--build-arg FRONTEND_API_URL=${FRONTEND_API_URL}"
)

DEPLOYMENTS=(
  "allegro-service|app|allegro-service"
  "allegro-api-gateway|app|allegro-api-gateway"
  "allegro-settings|app|allegro-settings"
  "allegro-imports|app|allegro-imports"
  "allegro-frontend|app|allegro-frontend"
)

MANIFESTS=(configmap.yaml external-secret.yaml service.yaml api-gateway-service.yaml settings-service.yaml imports-service.yaml frontend-service.yaml)

deploy_preflight() {
  for app in "$SERVICE_NAME" "$API_GATEWAY_NAME" "$FRONTEND_NAME" "$SETTINGS_NAME" "$IMPORTS_NAME"; do
    local bad_pods
    bad_pods=$(kubectl get pods -n "$NAMESPACE" -l app="$app" --no-headers 2>/dev/null \
      | awk '$3 ~ /Error|CrashLoopBackOff|ImagePullBackOff|CreateContainerConfigError|CreateContainerError|ErrImagePull/ {print $1}')
    if [ -n "$bad_pods" ]; then
      echo "Deployment $app has unhealthy pods before deploy:" >&2
      kubectl get pods -n "$NAMESPACE" -l app="$app" -o wide >&2 || true
      return 1
    fi
  done
}

deploy_post_manifests() {
  local rendered
  for entry in \
    "deployment.yaml|${SERVICE_NAME}|${REGISTRY}/${SERVICE_NAME}:${IMAGE_TAG}" \
    "api-gateway-deployment.yaml|${API_GATEWAY_NAME}|${REGISTRY}/${API_GATEWAY_NAME}:${IMAGE_TAG}" \
    "settings-deployment.yaml|${SETTINGS_NAME}|${REGISTRY}/${SETTINGS_NAME}:${IMAGE_TAG}" \
    "imports-deployment.yaml|${IMPORTS_NAME}|${REGISTRY}/${IMPORTS_NAME}:${IMAGE_TAG}" \
    "frontend-deployment.yaml|${FRONTEND_NAME}|${REGISTRY}/${FRONTEND_NAME}:${IMAGE_TAG}"; do
    IFS='|' read -r manifest image_name image <<< "$entry"
    if [ -f "$PROJECT_ROOT/k8s/$manifest" ]; then
      rendered="$(mktemp)"
      sed "s|image: ${REGISTRY}/${image_name}:latest|image: ${image}|" "$PROJECT_ROOT/k8s/$manifest" > "$rendered"
      kubectl apply -f "$rendered" -n "$NAMESPACE"
      rm -f "$rendered"
    fi
  done
}

deploy_post_verify() {
  if [ -f "$PROJECT_ROOT/k8s/ingress.yaml" ]; then
    kubectl apply -f "$PROJECT_ROOT/k8s/ingress.yaml" -n "$NAMESPACE"
  fi
}
