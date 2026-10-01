import { operation } from '../client';
import type { FitOutcome } from './baby';
import type { Money, SizeSummary } from './catalogue';
import type { Delivery, OrderStatus } from './commerce';

export type GarmentStatus =
  | 'PROCURED'
  | 'AVAILABLE'
  | 'RESERVED'
  | 'WITH_CUSTOMER'
  | 'RETURN_REQUESTED'
  | 'RETURNED'
  | 'INSPECTION'
  | 'REFURBISHING'
  | 'AVAILABLE_FOR_REUSE'
  | 'RESALE'
  | 'RECYCLE'
  | 'RETIRED';
export type ReturnStatus =
  | 'REQUESTED'
  | 'APPROVED'
  | 'IN_TRANSIT'
  | 'RECEIVED'
  | 'INSPECTING'
  | 'ACCEPTED'
  | 'REJECTED'
  | 'REFURBISHING'
  | 'COMPLETED';
export type ReturnReason = 'OUTGROWN' | 'WRONG_SIZE' | 'DEFECTIVE' | 'NOT_AS_EXPECTED' | 'OTHER';
export type ExchangeStatus = 'REQUESTED' | 'APPROVED' | 'FULFILLING' | 'COMPLETED' | 'REJECTED' | 'CANCELLED';
export type GarmentCondition = 'NEW' | 'EXCELLENT' | 'GOOD' | 'FAIR' | 'DAMAGED' | 'RECYCLE';

export interface CustomerGarment {
  id: string;
  tagCode: string;
  status: GarmentStatus;
  color: string;
  receivedAt: string | null;
  size: SizeSummary;
  product: { id: string; slug: string; name: string };
}
const SIZE = '{ code label sortOrder }';
const GARMENT_FIELDS = `id tagCode status color receivedAt size ${SIZE} product { id slug name }`;

export interface ReturnRequest {
  id: string;
  returnNumber: string;
  status: ReturnStatus;
  reason: ReturnReason;
  customerNote: string | null;
  rejectionReason: string | null;
  createdAt: string;
  completedAt: string | null;
  pickup: Delivery | null;
  items: {
    id: string;
    reportedFit: FitOutcome | null;
    inspectedCondition: GarmentCondition | null;
    outcome: 'ACCEPTED' | 'REJECTED' | null;
    creditEarned: Money | null;
    garment: CustomerGarment;
  }[];
}
const RETURN_FIELDS = `
  id returnNumber status reason customerNote rejectionReason createdAt completedAt
  pickup { id direction status provider trackingNumber estimatedDeliveryDate deliveredAt events { status note occurredAt } }
  items { id reportedFit inspectedCondition outcome creditEarned { amount currency } garment { ${GARMENT_FIELDS} } }
`;

export interface Exchange {
  id: string;
  exchangeNumber: string;
  status: ExchangeStatus;
  createdAt: string;
  completedAt: string | null;
  returnRequest: { id: string; returnNumber: string } | null;
  items: {
    id: string;
    requestedVariant: { id: string; color: string; size: SizeSummary };
    product: { name: string };
  }[];
  replacementOrder: { id: string; orderNumber: string; status: OrderStatus; totals: { total: Money } } | null;
}
const EXCHANGE_FIELDS = `
  id exchangeNumber status createdAt completedAt
  returnRequest { id returnNumber }
  items { id requestedVariant { id color size ${SIZE} } product { name } }
  replacementOrder { id orderNumber status totals { total { amount currency } } }
`;

export const MyGarmentsQuery = operation<{ myGarments: CustomerGarment[] }>(
  'MyGarments',
  `query MyGarments { myGarments { ${GARMENT_FIELDS} } }`,
);

export const MyReturnsQuery = operation<{ myReturns: ReturnRequest[] }>(
  'MyReturns',
  `query MyReturns { myReturns { ${RETURN_FIELDS} } }`,
);

export const MyExchangesQuery = operation<{ myExchanges: Exchange[] }>(
  'MyExchanges',
  `query MyExchanges { myExchanges { ${EXCHANGE_FIELDS} } }`,
);

export interface CreditEntry {
  id: string;
  type: 'EARNED' | 'REDEEMED' | 'EXPIRED' | 'ADJUSTMENT';
  amount: Money;
  note: string | null;
  createdAt: string;
}

export const MyExchangeCreditsQuery = operation<{
  myExchangeCredits: { balance: Money; entries: CreditEntry[] };
}>(
  'MyExchangeCredits',
  'query MyExchangeCredits { myExchangeCredits { balance { amount currency } entries { id type amount { amount currency } note createdAt } } }',
);

export const RequestReturnMutation = operation<
  { requestReturn: ReturnRequest },
  {
    input: {
      items: { garmentId: string; reportedFit?: FitOutcome | null }[];
      reason: ReturnReason;
      customerNote?: string | null;
      pickupAddressId?: string | null;
    };
  }
>(
  'RequestReturn',
  `mutation RequestReturn($input: RequestReturnInput!) { requestReturn(input: $input) { ${RETURN_FIELDS} } }`,
);

export const CreateExchangeMutation = operation<
  { createExchange: Exchange },
  {
    input: {
      idempotencyKey: string;
      returnRequestId?: string | null;
      items: { returnItemId?: string | null; requestedVariantId: string }[];
      shippingAddressId: string;
      deliveryOptionCode: string;
    };
  }
>(
  'CreateExchange',
  `mutation CreateExchange($input: CreateExchangeInput!) { createExchange(input: $input) { ${EXCHANGE_FIELDS} } }`,
);
