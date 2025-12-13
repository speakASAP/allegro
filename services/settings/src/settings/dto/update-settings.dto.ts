/**
 * Update Settings DTO
 */

import { IsOptional, IsString, IsObject, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class UpdateSettingsDto {
  @IsOptional()
  @IsString()
  allegroClientId?: string;

  @IsOptional()
  @IsString()
  allegroClientSecret?: string;

  @IsOptional()
  @IsObject()
  supplierConfigs?: any;

  @IsOptional()
  @IsObject()
  preferences?: any;
}

export class SupplierConfigDto {
  @IsString()
  id: string;

  @IsString()
  name: string;

  @IsString()
  apiEndpoint: string;

  @IsString()
  apiKey: string;

  @IsOptional()
  @IsObject()
  apiConfig?: any;
}

export class AddSupplierConfigDto {
  @IsString()
  name: string;

  @IsString()
  apiEndpoint: string;

  @IsString()
  apiKey: string;

  @IsOptional()
  @IsObject()
  apiConfig?: any;
}

export class UpdateSupplierConfigDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  apiEndpoint?: string;

  @IsOptional()
  @IsString()
  apiKey?: string;

  @IsOptional()
  @IsObject()
  apiConfig?: any;
}

export class ValidateAllegroKeysDto {
  @IsString()
  clientId: string;

  @IsString()
  clientSecret: string;
}

export class AllegroOAuthCallbackDto {
  @IsString()
  code: string;

  @IsString()
  state: string;
}

export class AllegroOAuthStatusDto {
  authorized: boolean;
  expiresAt?: Date;
  scopes?: string;
}

