# Production Deployment

## Task: Deploy allegro on production

Read ../nginx-microservice/README.md
Start commands: cat .env && ssh statex "cd nginx-microservice ls -la scripts"

## Quick Deployment

```bash
# 1. Pull latest code
ssh statex "cd /home/statex/allegro && git pull origin master"

# 2. Deploy service
ssh statex "cd /home/statex/nginx-microservice && ./scripts/blue-green/deploy-smart allegro"

# 3. Register domain (if not exists)
ssh statex "cd /home/statex/nginx-microservice && ./scripts/add-domain.sh allegro.statex.cz allegro 3468 admin@statex.cz"

# 4. Configure nginx for frontend service
ssh statex "cd /home/statex/nginx-microservice/nginx/conf.d && \
# Add frontend service upstream after api-gateway upstream
sed -i '/^upstream allegro-api-gateway {/,/^}$/ {
/^}$/a\
\
# Frontend service upstream\
upstream allegro-frontend-service {\
    server allegro-frontend-service:3410 max_fails=3 fail_timeout=30s;\
}
}' allegro.statex.cz.blue.conf && \
# Add location block for root path before /api/ location
sed -i '/# Proxy locations (auto-generated from service registry)/a\
    # Frontend service - root path\
    location / {\
        proxy_pass http://allegro-frontend-service;\
        proxy_http_version 1.1;\
        proxy_set_header Upgrade \$http_upgrade;\
        proxy_set_header Connection \"upgrade\";\
        proxy_set_header Host \$host;\
        proxy_set_header X-Real-IP \$remote_addr;\
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;\
        proxy_set_header X-Forwarded-Proto \$scheme;\
        proxy_cache_bypass \$http_upgrade;\
        \
        proxy_connect_timeout 300s;\
        proxy_read_timeout 300s;\
        proxy_send_timeout 300s;\
        \
        proxy_buffer_size 128k;\
        proxy_buffers 4 256k;\
        proxy_busy_buffers_size 256k;\
    }\
' allegro.statex.cz.blue.conf"

# 5. Copy certificate if add-domain failed
ssh statex "cd /home/statex/nginx-microservice && mkdir -p certificates/allegro.statex.cz && docker exec nginx-certbot cat /etc/letsencrypt/live/allegro.statex.cz/fullchain.pem > certificates/allegro.statex.cz/fullchain.pem && docker exec nginx-certbot cat /etc/letsencrypt/live/allegro.statex.cz/privkey.pem > certificates/allegro.statex.cz/privkey.pem && chmod 600 certificates/allegro.statex.cz/privkey.pem"

# 6. Reload nginx
ssh statex "docker exec nginx-microservice nginx -t && docker exec nginx-microservice nginx -s reload"

# 7. Verify deployment
ssh statex "curl -s https://allegro.statex.cz/health && docker run --rm --network nginx-network alpine/curl:latest curl -s http://allegro:3268/health"
```

## Success Criteria

- Service accessible: `https://allegro.statex.cz/health` returns success
- Internal access: `http://allegro:3268/health` returns success
- No errors in logs: `docker compose logs allegro-service | grep -i error`

## Notes

- Port: 3268
- Internal URL: `http://allegro:3468`
- External URL: `https://allegro.statex.cz`
- Service registry: `/home/statex/nginx-microservice/service-registry/allegro.json`
- Environment: `.env` file in project root (PORT=3468)
