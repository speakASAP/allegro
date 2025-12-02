/**
 * Global HTTP Exception Filter
 * Catches all exceptions and formats them properly
 */

import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';
    let code = 'INTERNAL_ERROR';

    // Debug logging
    const exceptionName = exception?.constructor?.name;
    const isHttpException = exception instanceof HttpException;
    const isUnauthorizedException = exception instanceof UnauthorizedException;
    
    this.logger.log(`[ExceptionFilter] Exception: ${exceptionName}, isHttpException: ${isHttpException}, isUnauthorizedException: ${isUnauthorizedException}`);
    
    if (exception instanceof Error) {
      this.logger.log(`[ExceptionFilter] Error message: ${exception.message}`);
    }

    // Handle UnauthorizedException specifically
    // Check both instanceof and status code (in case instanceof doesn't work across modules)
    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();
      
      this.logger.log(`[ExceptionFilter] HttpException status: ${status}, HttpStatus.UNAUTHORIZED: ${HttpStatus.UNAUTHORIZED}, status === 401: ${status === 401}`);
      
      // Check if it's an UnauthorizedException by status or instanceof
      // Use numeric comparison (401) since HttpStatus.UNAUTHORIZED should be 401
      if (status === 401 || exception instanceof UnauthorizedException) {
        status = 401;
        code = 'UNAUTHORIZED';
        if (typeof exceptionResponse === 'string') {
          message = exceptionResponse;
        } else if (typeof exceptionResponse === 'object' && exceptionResponse !== null) {
          const responseObj = exceptionResponse as any;
          message = responseObj.message || exception.message || 'Authentication required';
        } else {
          message = exception.message || 'Authentication required';
        }
      } else {
        // Set code based on status for other HttpExceptions
        if (status === 403) {
          code = 'FORBIDDEN';
        } else if (status === 404) {
          code = 'NOT_FOUND';
        } else if (status === 409) {
          code = 'CONFLICT';
        } else if (status === 503) {
          code = 'SERVICE_UNAVAILABLE';
        }
        
        if (typeof exceptionResponse === 'string') {
          message = exceptionResponse;
        } else if (typeof exceptionResponse === 'object' && exceptionResponse !== null) {
          const responseObj = exceptionResponse as any;
          message = responseObj.message || exception.message || message;
          // Only override code if it's not already set by status
          if (!code || code === 'INTERNAL_ERROR') {
            code = responseObj.code || responseObj.error || code;
          }
        } else {
          message = exception.message || message;
        }
      }
    } else if (exception instanceof Error) {
      message = exception.message || message;
      this.logger.error(`Unhandled exception: ${exception.message}`, exception.stack);
    }

    const errorResponse = {
      success: false,
      error: {
        code,
        message,
        statusCode: status,
      },
      path: request.url,
      timestamp: new Date().toISOString(),
    };

    // Log the error
    this.logger.error(
      `${request.method} ${request.url} - ${status} - ${message}`,
      exception instanceof Error ? exception.stack : JSON.stringify(exception),
    );

    response.status(status).json(errorResponse);
  }
}

