/**
 * Import Job DTO
 */

export class ImportJobDto {
  id: string;
  fileName: string;
  status: string;
  totalRows: number;
  processedRows: number;
  successfulRows: number;
  failedRows: number;
  skippedRows: number;
  startedAt?: Date;
  completedAt?: Date;
  errorMessage?: string;
}

