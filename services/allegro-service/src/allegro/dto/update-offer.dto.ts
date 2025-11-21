/**
 * Update Offer DTO
 */

export class UpdateOfferDto {
  title?: string;
  description?: string;
  categoryId?: string;
  price?: number;
  quantity?: number;
  images?: string[];
  status?: string;
  deliveryOptions?: any;
  paymentOptions?: any;
}

