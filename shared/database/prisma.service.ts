/**
 * Prisma Service
 * Provides Prisma Client instance for database access
 */

import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    // Construct DATABASE_URL from DB_* variables if not set or invalid
    let databaseUrl = process.env.DATABASE_URL;
    
    // Validate existing DATABASE_URL if present
    let isValidUrl = false;
    if (databaseUrl) {
      // Check for common issues: duplicate key, missing protocol, or invalid format
      if (databaseUrl.includes('DATABASE_URL=')) {
        // Remove duplicate key prefix if present
        databaseUrl = databaseUrl.replace(/^DATABASE_URL=/, '');
      }
      
      // Validate URL format
      if (databaseUrl.startsWith('postgresql://') || databaseUrl.startsWith('postgres://')) {
        try {
          // Try to parse the URL to validate it
          new URL(databaseUrl);
          isValidUrl = true;
        } catch {
          // URL is malformed (e.g., password contains unencoded special characters)
          isValidUrl = false;
        }
      }
    }
    
    // If DATABASE_URL is invalid or missing, construct from DB_* variables
    if (!isValidUrl) {
      const dbHost = process.env.DB_HOST;
      const dbPort = process.env.DB_PORT;
      const dbUser = process.env.DB_USER;
      const dbPassword = process.env.DB_PASSWORD || '';
      const dbName = process.env.DB_NAME;
      
      if (!dbHost || !dbPort || !dbUser || !dbName) {
        throw new Error('Missing required database configuration. Please set DB_HOST, DB_PORT, DB_USER, and DB_NAME environment variables, or provide a valid DATABASE_URL.');
      }
      
      // URL encode password to handle special characters (/, +, =, @, etc.)
      const encodedPassword = encodeURIComponent(dbPassword);
      
      // Add connection pool parameters to keep connections warm and reduce cold start delays
      // connection_limit: Maximum number of connections in the pool (Prisma default is num_physical_cpus * 2 + 1)
      // pool_timeout: How long to wait for a connection (default 10s)
      // connect_timeout: How long to wait when establishing a connection (default 5s)
      // This helps prevent the 9+ second delay on first request after idle period
      databaseUrl = `postgresql://${dbUser}:${encodedPassword}@${dbHost}:${dbPort}/${dbName}?schema=public&connection_limit=10&pool_timeout=5&connect_timeout=2`;
      process.env.DATABASE_URL = databaseUrl;
    } else {
      // DATABASE_URL is valid, but ensure it has connection pool parameters for faster cold starts
      // Only add if not already present
      if (databaseUrl && !databaseUrl.includes('connection_limit=')) {
        const separator = databaseUrl.includes('?') ? '&' : '?';
        databaseUrl = `${databaseUrl}${separator}connection_limit=10&pool_timeout=5&connect_timeout=2`;
        process.env.DATABASE_URL = databaseUrl;
      }
    }

    // Pass datasources explicitly to PrismaClient to ensure correct URL is used
    super({
      datasources: {
        db: {
          url: databaseUrl,
        },
      },
      log: [
        { emit: 'event', level: 'query' },
        { emit: 'event', level: 'error' },
        { emit: 'event', level: 'info' },
        { emit: 'event', level: 'warn' },
      ],
    });
  }

  async onModuleInit() {
    const initStartTime = Date.now();
    const timestamp = new Date().toISOString();
    this.logger.log(`[${timestamp}] [TIMING] Prisma onModuleInit START`);
    
    try {
      const connectStartTime = Date.now();
      await this.$connect();
      const connectDuration = Date.now() - connectStartTime;
      this.logger.log(`[${new Date().toISOString()}] [TIMING] Prisma Client connected to database (${connectDuration}ms)`);
      
      // Warm up the connection pool with a simple query to prevent cold start delays
      // This ensures the connection is ready and reduces the 9+ second delay on first request
      try {
        const warmupStartTime = Date.now();
        await this.$queryRaw`SELECT 1`;
        const warmupDuration = Date.now() - warmupStartTime;
        this.logger.log(`[${new Date().toISOString()}] [TIMING] Prisma connection pool warmed up (${warmupDuration}ms)`);
      } catch (warmupError) {
        // Non-critical - connection is still established, just warmup query failed
        this.logger.warn(`[${new Date().toISOString()}] [TIMING] Prisma connection warmup query failed (non-critical)`, warmupError);
      }
      
      const totalInitDuration = Date.now() - initStartTime;
      this.logger.log(`[${new Date().toISOString()}] [TIMING] Prisma onModuleInit COMPLETE (${totalInitDuration}ms)`);
    } catch (error) {
      const totalInitDuration = Date.now() - initStartTime;
      this.logger.error(`[${new Date().toISOString()}] [TIMING] Failed to connect to database (${totalInitDuration}ms)`, error);
      throw error;
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
    this.logger.log('Prisma Client disconnected from database');
  }
}

