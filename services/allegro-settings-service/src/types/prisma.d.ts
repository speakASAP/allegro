/**
 * Type declarations for PrismaService
 * Ensures userSettings is recognized by TypeScript
 */

import '@allegro/shared';
import { PrismaClient } from '@prisma/client';

declare module '@allegro/shared' {
  export interface PrismaService extends PrismaClient {}
}
