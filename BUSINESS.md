# Business: allegro-service
>
> ⚠️ IMMUTABLE BY AI.

## Goal

Multi-account Allegro marketplace integration: offer management, CSV import/transformation, order processing, stock sync.

## Constraints

- AI must never create/modify Allegro offers without validation
- Allegro API rate limits must be respected (max 1 req/s per account)
- Order data must be forwarded to orders-microservice — not stored locally

## Consumers

flipflop-service (stock/orders sync).

## SLA

- Production: <https://allegro.alfares.cz>
- Events consumed: stock.updated (warehouse)

# BUSINESS.md

completeness_level: complete

## Problem
Allegro is a live marketplace integration for managing offers, importing CSV data, forwarding orders, and synchronizing stock with the warehouse domain. The repo must preserve operational clarity and avoid inventing unsupported marketplace or product claims.

## Target users and stakeholders
- marketplace operations owners
- catalog and warehouse teams
- orders and notifications consumers
- platform operators responsible for production validation and service health

## Value proposition
The repository keeps offer management, CSV transformation, and stock synchronization aligned with the Alfares marketplace stack without creating a local ownership boundary for order data or product records.

## Goals
- keep offer management and stock sync aligned with the actual Allegro marketplace integration
- preserve operational traceability for order forwarding and stock events
- keep marketplace integration contracts truthful and reviewable
- maintain IPS adoption evidence for production operations

## Non-goals
- owning invoice settlement or payment capture
- storing order data locally beyond the required forwarding boundary
- inventing unsupported marketplace workflows or service responsibilities

## Success metrics
- the marketplace integration remains operational and reviewable
- stock.updated events are consumed and acted on as documented
- validation evidence passes without placeholder or invented runtime claims
- the repo stays aligned with the shared ecosystem contracts

## Business constraints
- production behavior must match the actual Allegro platform integration and the documented ecosystem boundaries
- rate limits and validation rules must be respected for offer and stock synchronization
- local ownership remains minimal and order data is forwarded to the orders service

## Approval
status: approved
Approved by: project owner
Approval evidence: owner-confirmation: allegro-onboarding-approved
