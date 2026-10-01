import { randomBytes } from 'node:crypto';

export interface ShipmentRequest {
  orderNumber: string;
  district: string | null;
}

/** A logistics partner. Status changes come from the partner (webhooks or polling) or from staff. */
export interface DeliveryProvider {
  readonly key: string;
  createShipment(request: ShipmentRequest): Promise<{ trackingNumber: string }>;
}

/**
 * Bambino's own riders. Creates a tracking number; staff move the delivery through its
 * statuses in the admin dashboard. A courier integration implements the same interface.
 */
export class InHouseDeliveryProvider implements DeliveryProvider {
  readonly key = 'IN_HOUSE';

  async createShipment(): Promise<{ trackingNumber: string }> {
    return { trackingNumber: `BMB-T-${randomBytes(5).toString('hex').toUpperCase()}` };
  }
}
