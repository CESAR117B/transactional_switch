export class TransactionLogEvent {
  servicio: string;
  entidadId?: bigint;
  entidadName?: string;
  idApp: number;
  operation: string;
  reference: string;
  requestPayload: unknown;
  responsePayload: unknown;
  status: number;
  errorMessage?: string;
}
