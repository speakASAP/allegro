import { Controller, Get, Headers, Query, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Injectable } from "@nestjs/common";
import { PrismaService } from "@allegro/shared";
import { AllegroAuthService } from "../allegro-auth.service";
import { ShipmentStatusProjection, ShipmentStatusProjectionService } from "./shipment-status-projection.service";
import { ShipmentSnapshotStatus, ShipmentSourceReadStatus } from "./shipment-status-snapshot.mapper";

export interface ShipmentStatusRedactedScanSummary {
  contract: "allegro.shipment_status_redacted_scan.v1";
  source: "allegro-service";
  generatedAt: string;
  mode: "read-only";
  limit: number;
  candidatesChecked: number;
  candidatesWithCentralOrderId: number;
  scanned: number;
  failed: number;
  snapshotCount: number;
  nonUnknownStatusCount: number;
  latestStatusCounts: Partial<Record<ShipmentSnapshotStatus, number>>;
  sourceReadStatusCounts: Partial<Record<ShipmentSourceReadStatus, number>>;
  packageCountTotal: number;
  hasAnyWaybillHash: boolean;
  blockers: string[];
  safety: {
    mutates: false;
    mutatesAllegro: false;
    mutatesWarehouse: false;
    mutatesOrders: false;
    refreshesOAuthToken: false;
    returnsRawIds: false;
    returnsRawWaybills: false;
    returnsProviderPayload: false;
  };
}

interface ForwardedShipmentCandidate {
  localOrderId: string;
  accountId: string | null;
  externalOrderId: string;
  responseSummary?: unknown;
  account?: {
    id: string;
    userId: string;
  } | null;
}

const DEFAULT_SCAN_LIMIT = 50;
const MAX_SCAN_LIMIT = 50;
const NO_NON_UNKNOWN_BLOCKER = "[MISSING: Allegro provider sample with carrier tracking status other than UNKNOWN]";
const SERVICE_NATIVE_BLOCKER = "[MISSING: service-native Allegro OAuth shipment scan candidate]";

@Injectable()
export class ShipmentStatusRedactedScanService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly allegroAuthService: AllegroAuthService,
    private readonly projectionService: ShipmentStatusProjectionService,
  ) {}

  async scan(query: Record<string, unknown> = {}): Promise<ShipmentStatusRedactedScanSummary> {
    const limit = normalizeLimit(query.limit);
    const generatedAt = new Date().toISOString();
    const candidates = await this.prisma.allegroOrderForwardingAttempt.findMany({
      where: {
        status: "FORWARDED",
        account: {
          isActive: true,
          accessToken: { not: null },
        },
      },
      include: {
        account: {
          select: {
            id: true,
            userId: true,
          },
        },
      },
      orderBy: { attemptedAt: "desc" },
      take: limit,
    });

    const summary: ShipmentStatusRedactedScanSummary = {
      contract: "allegro.shipment_status_redacted_scan.v1",
      source: "allegro-service",
      generatedAt,
      mode: "read-only",
      limit,
      candidatesChecked: candidates.length,
      candidatesWithCentralOrderId: 0,
      scanned: 0,
      failed: 0,
      snapshotCount: 0,
      nonUnknownStatusCount: 0,
      latestStatusCounts: {},
      sourceReadStatusCounts: {},
      packageCountTotal: 0,
      hasAnyWaybillHash: false,
      blockers: [],
      safety: {
        mutates: false,
        mutatesAllegro: false,
        mutatesWarehouse: false,
        mutatesOrders: false,
        refreshesOAuthToken: false,
        returnsRawIds: false,
        returnsRawWaybills: false,
        returnsProviderPayload: false,
      },
    };

    const blockers = new Set<string>();
    for (const candidate of candidates as ForwardedShipmentCandidate[]) {
      const centralOrderId = extractCentralOrderId(candidate.responseSummary);
      if (!centralOrderId) {
        continue;
      }
      summary.candidatesWithCentralOrderId += 1;

      if (!candidate.account || !candidate.accountId) {
        summary.failed += 1;
        blockers.add(SERVICE_NATIVE_BLOCKER);
        continue;
      }

      try {
        const token = await this.allegroAuthService.getShipmentStatusScanAccessTokenForAccount(
          candidate.account.userId,
          candidate.account.id,
        );
        const projection = await this.projectionService.buildReadOnlyProjection({
          orders: [{
            accountId: candidate.accountId,
            externalOrderId: candidate.externalOrderId,
            localOrderId: candidate.localOrderId,
            centralOrderId,
          }],
        }, {
          token,
          readAt: generatedAt,
          generatedAt,
        });
        summary.scanned += 1;
        mergeProjection(summary, projection);
      } catch (error) {
        summary.failed += 1;
        blockers.add(normalizeBlocker(error));
      }
    }

    if (summary.candidatesWithCentralOrderId === 0) {
      blockers.add("[MISSING: forwarded Allegro order with central Orders id for shipment scan]");
    }
    if (summary.snapshotCount > 0 && summary.nonUnknownStatusCount === 0) {
      blockers.add(NO_NON_UNKNOWN_BLOCKER);
    }
    summary.blockers = Array.from(blockers).sort();
    return summary;
  }
}

@Controller("internal/allegro/shipment-status")
export class InternalShipmentStatusController {
  constructor(
    private readonly scanService: ShipmentStatusRedactedScanService,
    private readonly configService: ConfigService,
  ) {}

  @Get("redacted-scan")
  async redactedScan(
    @Query() query: Record<string, unknown>,
    @Headers("x-internal-service-token") internalToken?: string,
    @Headers("authorization") authorization?: string,
    @Headers("x-service-name") serviceName?: string,
  ): Promise<{ success: boolean; data: ShipmentStatusRedactedScanSummary }> {
    this.assertInternalService(internalToken || authorization, serviceName);
    return { success: true, data: await this.scanService.scan(query) };
  }

  private assertInternalService(token?: string, serviceName?: string): void {
    const expected = (
      this.configService.get<string>("ALLEGRO_INTERNAL_SERVICE_TOKEN")
      || this.configService.get<string>("INTERNAL_SERVICE_TOKEN")
      || ""
    ).trim();
    const supplied = String(token || "").replace(/^Bearer\s+/i, "").trim();
    const allowedServices = String(
      this.configService.get<string>("ALLEGRO_SHIPMENT_STATUS_SCAN_ALLOWED_SERVICES")
      || "orders-microservice,warehouse-microservice,allegro-service",
    ).split(",").map((value) => value.trim()).filter(Boolean);

    if (!expected || !supplied || supplied !== expected || !serviceName || !allowedServices.includes(serviceName)) {
      throw new UnauthorizedException("internal_service_auth_required");
    }
  }
}

function mergeProjection(summary: ShipmentStatusRedactedScanSummary, projection: ShipmentStatusProjection): void {
  summary.snapshotCount += projection.snapshotCount;
  for (const snapshot of projection.snapshots) {
    increment(summary.latestStatusCounts, snapshot.shipment.latestStatus);
    increment(summary.sourceReadStatusCounts, snapshot.sourceRead.status);
    summary.packageCountTotal += snapshot.shipment.packageCount;
    summary.hasAnyWaybillHash = summary.hasAnyWaybillHash || Boolean(snapshot.shipment.waybillHash);
    if (snapshot.shipment.latestStatus !== "UNKNOWN") {
      summary.nonUnknownStatusCount += 1;
    }
  }
}

function extractCentralOrderId(value: unknown): string | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const record = value as Record<string, any>;
  return normalizeOptionalString(
    record.id
    || record.orderId
    || record.centralOrderId
    || record.order?.id
    || record.data?.id,
  );
}

function increment<T extends string>(target: Partial<Record<T, number>>, key: T): void {
  target[key] = (target[key] || 0) + 1;
}

function normalizeBlocker(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error || "UNKNOWN_SHIPMENT_SCAN_ERROR");
  if (message.startsWith("[MISSING:") || message.startsWith("[UNKNOWN:")) {
    return message.slice(0, 200);
  }
  if (message.includes("OAuth") || message.includes("token")) {
    return "[MISSING: usable Allegro OAuth token for service-native shipment scan]";
  }
  if (message.includes("shipment read failed")) {
    return "[UNKNOWN: Allegro shipment endpoint read failed for selected candidate]";
  }
  return "[UNKNOWN: service-native Allegro shipment scan failed for selected candidate]";
}

function normalizeLimit(value: unknown): number {
  const parsed = Number(value || DEFAULT_SCAN_LIMIT);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_SCAN_LIMIT;
  }
  return Math.min(Math.floor(parsed), MAX_SCAN_LIMIT);
}

function normalizeOptionalString(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  const normalized = String(value).trim();
  return normalized || null;
}
