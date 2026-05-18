// src/events/transaction-log.event.ts
import { TransactionStatus } from '@prisma/client';

export class TransactionLogEvent {
  servicio: string;
  entidadId?: bigint;
  entidadName?: string;
  idApp: bigint;
  operation: string;
  reference: string;
  requestPayload: any;
  responsePayload: any;
  status: TransactionStatus;
  errorMessage?: string;
}