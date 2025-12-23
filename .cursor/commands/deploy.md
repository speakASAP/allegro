# Production Deployment

## Task: Deploy allegro on production

Read ../nginx-microservice/README.md
Start commands: cat .env && ssh statex "cd nginx-microservice ls -la scripts"

## Quick Deployment

```bash
# 1. Pull latest code
ssh statex "cd /home/statex/allegro-service && git pull origin master"

# 2. Deploy service
ssh statex "cd /home/statex/nginx-microservice && ./scripts/blue-green/deploy-smart allegro"

# 3. Register domain (if not exists)
ssh statex "cd /home/statex/nginx-microservice && ./scripts/add-domain.sh allegro.statex.cz allegro 3411 admin@statex.cz"

# 4. Configure nginx for frontend service

# 5. Copy certificate if add-domain failed
ssh statex "cd /home/statex/nginx-microservice && mkdir -p certificates/allegro.statex.cz && docker exec nginx-certbot cat /etc/letsencrypt/live/allegro.statex.cz/fullchain.pem > certificates/allegro.statex.cz/fullchain.pem && docker exec nginx-certbot cat /etc/letsencrypt/live/allegro.statex.cz/privkey.pem > certificates/allegro.statex.cz/privkey.pem && chmod 600 certificates/allegro.statex.cz/privkey.pem"

# 6. Reload nginx
ssh statex "docker exec nginx-microservice nginx -t && docker exec nginx-microservice nginx -s reload"

# 7. Verify deployment
ssh statex "curl -s https://allegro.statex.cz/health && docker run --rm --network nginx-network alpine/curl:latest curl -s http://allegro:3367/health"
```

## Success Criteria

- Service accessible: `https://allegro.statex.cz/health` returns success
- Internal access: `http://allegro:3367/health` returns success
- No errors in logs: `docker compose logs allegro-service | grep -i error`

## Notes

- API Gateway Port: 3411 (configured via `API_GATEWAY_PORT` in .env)
- Frontend Port: 3410 (configured via `ALLEGRO_FRONTEND_SERVICE_PORT` in .env)
- External URL: `https://allegro.statex.cz`
- Service registry: `/home/statex/nginx-microservice/service-registry/allegro.json`
- Environment: `.env` file in project root
