# Refactoring Plan: Remove Services

## Overview
Remove the following services from the Allegro Integration System:
- product-service
- scheduler-service
- sync-service
- webhook-service

## Services to Keep
- api-gateway
- allegro-service (core Allegro API integration)
- import-service
- allegro-settings-service
- allegro-frontend-service

## Implementation Checklist

### 1. Remove Service Directories
- [x] Delete `services/product-service/`
- [x] Delete `services/scheduler-service/`
- [x] Delete `services/sync-service/`
- [x] Delete `services/webhook-service/`

### 2. Update API Gateway
- [x] Remove `productsRoute` from `gateway.controller.ts`
- [x] Remove `syncRoute` from `gateway.controller.ts`
- [x] Remove `webhooksRoute` from `gateway.controller.ts`
- [x] Remove `products`, `sync`, `webhooks`, `scheduler` from `gateway.service.ts` serviceUrls

### 3. Update Root package.json
- [x] Update `start:dev` script to remove deleted services

### 4. Update README.md
- [x] Remove references to deleted services in Architecture section
- [x] Remove service ports from Port Configuration table
- [x] Remove service endpoints documentation
- [x] Remove service health check URLs
- [x] Update service count from 9 to 5

### 5. Update Frontend
- [x] Remove ProductsPage component and route
- [x] Remove SyncStatusPage component and route
- [x] Remove Products and Sync Status from Dashboard navigation
- [x] Remove product export functionality from ImportJobsPage
- [x] Update `api.ts` to remove service port references
- [x] Update `serviceErrorHandler.ts` to remove service mappings

### 6. Update Documentation
- [x] Update `docs/START_PROJECT.md` to remove deleted services

### 7. Clean Up Scripts
- [x] Check and update any test scripts that reference deleted services

## Summary

✅ All tasks completed successfully. The application has been refactored to remove:
- product-service
- scheduler-service
- sync-service
- webhook-service

The remaining services are:
- api-gateway
- allegro-service
- import-service
- allegro-settings-service
- allegro-frontend-service

