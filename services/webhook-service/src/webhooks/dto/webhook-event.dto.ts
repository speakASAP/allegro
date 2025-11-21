/**
 * Webhook Event DTO
 */

export class WebhookEventDto {
  type: string;
  eventType: string;
  payload: any;
  secret?: string;
}

