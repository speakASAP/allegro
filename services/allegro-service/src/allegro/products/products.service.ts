import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { PrismaService, LoggerService } from '@allegro/shared';

interface ProductQuery {
  page?: number;
  limit?: number;
  search?: string;
}

interface ProductPayload {
  allegroProductId?: string;
  name?: string;
  brand?: string;
  manufacturerCode?: string;
  ean?: string;
  publicationStatus?: string;
  isAiCoCreated?: boolean;
  marketedBeforeGPSR?: boolean | null;
  rawData?: any;
  parameters?: Array<{
    parameterId: string;
    name?: string;
    values?: any;
    valuesIds?: any;
    rangeValue?: any;
  }>;
}

@Injectable()
export class ProductsService {
  private readonly logger: LoggerService;

  constructor(
    private readonly prisma: PrismaService,
    loggerService: LoggerService,
  ) {
    this.logger = loggerService;
    this.logger.setContext('ProductsService');
  }

  private extractSummaryFromRaw(
    rawData: any,
    payload: ProductPayload = {},
    existing?: {
      allegroProductId?: string | null;
      name?: string | null;
      brand?: string | null;
      manufacturerCode?: string | null;
      ean?: string | null;
      publicationStatus?: string | null;
      isAiCoCreated?: boolean | null;
      marketedBeforeGPSR?: boolean | null;
      rawData?: any;
    },
  ) {
    const product = rawData?.product || rawData || {};
    const params = Array.isArray(product?.parameters) ? product.parameters : [];
    const findParamValue = (id: string, name?: string): string | undefined => {
      const param = params.find((p: any) => String(p?.id) === id || (name && p?.name === name));
      if (!param) return undefined;
      if (Array.isArray(param.values) && param.values.length > 0) {
        const first = param.values[0] as any;
        if (typeof first === 'string') return first;
        return first?.name;
      }
      if (typeof param.value === 'string') return param.value;
      return undefined;
    };

    return {
      allegroProductId:
        payload.allegroProductId ??
        existing?.allegroProductId ??
        product?.id ??
        rawData?.id ??
        null,
      name: payload.name ?? product?.name ?? existing?.name ?? null,
      brand:
        payload.brand ??
        findParamValue('248811', 'Značka') ??
        product?.brand ??
        existing?.brand ??
        null,
      manufacturerCode:
        payload.manufacturerCode ??
        findParamValue('224017', 'Kód výrobce') ??
        product?.manufacturerCode ??
        existing?.manufacturerCode ??
        null,
      ean:
        payload.ean ??
        findParamValue('225693', 'EAN (GTIN)') ??
        product?.ean ??
        existing?.ean ??
        null,
      publicationStatus:
        payload.publicationStatus ??
        product?.publication?.status ??
        existing?.publicationStatus ??
        null,
      isAiCoCreated:
        payload.isAiCoCreated ?? product?.isAiCoCreated ?? existing?.isAiCoCreated ?? false,
      marketedBeforeGPSR:
        payload.marketedBeforeGPSR ??
        rawData?.marketedBeforeGPSRObligation ??
        existing?.marketedBeforeGPSR ??
        null,
      rawData: payload.rawData ?? rawData ?? existing?.rawData ?? null,
    };
  }

  async getProducts(query: ProductQuery & { includeRaw?: string }) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 20;
    const skip = (page - 1) * limit;
    const search = query.search?.trim();
    const includeRaw = query.includeRaw === 'true';

    const where: any = {};
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { brand: { contains: search, mode: 'insensitive' } },
        { manufacturerCode: { contains: search, mode: 'insensitive' } },
        { ean: { contains: search, mode: 'insensitive' } },
        { allegroProductId: { contains: search, mode: 'insensitive' } },
      ];
    }

    this.logger.log('[getProducts] Fetching products', { page, limit, search });

    const prisma = this.prisma as any; // fallback to allow newer Prisma models

    const [items, total] = await Promise.all([
      prisma.allegroProduct.findMany({
        where,
        skip,
        take: limit,
        select: {
          id: true,
          allegroProductId: true,
          name: true,
          brand: true,
          manufacturerCode: true,
          ean: true,
          publicationStatus: true,
          isAiCoCreated: true,
          marketedBeforeGPSR: true,
          rawData: includeRaw,
          createdAt: true,
          updatedAt: true,
          parameters: {
            select: {
              id: true,
              parameterId: true,
              name: true,
              values: true,
              valuesIds: true,
              rangeValue: true,
              createdAt: true,
              updatedAt: true,
            },
          },
        },
        orderBy: { updatedAt: 'desc' },
      }),
      prisma.allegroProduct.count({ where }),
    ]);

    return {
      items,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getProduct(id: string) {
    const prisma = this.prisma as any;

    const product = await prisma.allegroProduct.findUnique({
      where: { id },
      include: { parameters: true },
    });

    if (!product) {
      throw new HttpException('Product not found', HttpStatus.NOT_FOUND);
    }

    return product;
  }

  async createProduct(payload: ProductPayload) {
    if (!payload.rawData) {
      throw new HttpException('rawData is required', HttpStatus.BAD_REQUEST);
    }

    const prisma = this.prisma as any;
    const summary = this.extractSummaryFromRaw(payload.rawData, payload);

    // Ensure allegroProductId is set (required field)
    const allegroProductId = 
      payload.allegroProductId || 
      summary.allegroProductId || 
      payload.rawData?.product?.id || 
      payload.rawData?.id || 
      `local-${Date.now()}-${Math.random().toString(36).substring(7)}`;

    const created = await prisma.allegroProduct.create({
      data: {
        allegroProductId: String(allegroProductId),
        name: summary.name,
        brand: summary.brand,
        manufacturerCode: summary.manufacturerCode,
        ean: summary.ean,
        publicationStatus: summary.publicationStatus,
        isAiCoCreated: summary.isAiCoCreated,
        marketedBeforeGPSR: summary.marketedBeforeGPSR,
        rawData: summary.rawData,
      } as any,
      include: { parameters: true },
    });

    if (payload.parameters?.length) {
      await this.replaceParameters(created.id, payload.parameters);
    } else if (Array.isArray(payload.rawData?.product?.parameters)) {
      await this.replaceParameters(created.id, payload.rawData.product.parameters);
    }

    return this.getProduct(created.id);
  }

  async updateProduct(id: string, payload: ProductPayload) {
    const prisma = this.prisma as any;
    const existing = await prisma.allegroProduct.findUnique({ where: { id } });
    if (!existing) {
      throw new HttpException('Product not found', HttpStatus.NOT_FOUND);
    }

    const rawData = payload.rawData ?? existing.rawData;
    const summary = this.extractSummaryFromRaw(rawData, payload, existing);

    await prisma.allegroProduct.update({
      where: { id },
      data: {
        allegroProductId: summary.allegroProductId ?? existing.allegroProductId,
        name: summary.name ?? existing.name,
        brand: summary.brand ?? existing.brand,
        manufacturerCode: summary.manufacturerCode ?? existing.manufacturerCode,
        ean: summary.ean ?? existing.ean,
        publicationStatus: summary.publicationStatus ?? existing.publicationStatus,
        isAiCoCreated: summary.isAiCoCreated ?? existing.isAiCoCreated,
        marketedBeforeGPSR: summary.marketedBeforeGPSR ?? existing.marketedBeforeGPSR,
        rawData: summary.rawData ?? existing.rawData,
      } as any,
    });

    if (payload.parameters) {
      await this.replaceParameters(id, payload.parameters);
    }

    return this.getProduct(id);
  }

  async deleteProduct(id: string) {
    const prisma = this.prisma as any;
    await prisma.allegroProduct.delete({ where: { id } });
    return { success: true };
  }

  private async replaceParameters(productId: string, parameters: any[]) {
    const prisma = this.prisma as any;
    await prisma.allegroProductParameter.deleteMany({ where: { allegroProductId: productId } });
    if (parameters.length === 0) {
      return;
    }
    const data = parameters.map((param: any, index: number) => ({
      allegroProductId: productId,
      parameterId: param.parameterId || param.id || `param-${index}`,
      name: param.name || null,
      values: param.values || null,
      valuesIds: param.valuesIds || null,
      rangeValue: param.rangeValue || null,
    }));
    await prisma.allegroProductParameter.createMany({
      data: data as any,
      skipDuplicates: true,
    });
  }
}

