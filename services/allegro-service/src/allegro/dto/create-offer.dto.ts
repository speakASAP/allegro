/**
 * Create Offer DTO
 */

export class CreateOfferDto {
  productId?: string;
  title: string;
  description?: string;
  categoryId: string;
  price: number;
  quantity: number;
  images?: string[];
  ean?: string;
  parameters?: Array<{
    id: string;
    values: string[];
  }>;
  deliveryOptions?: any;
  paymentOptions?: any;
}

