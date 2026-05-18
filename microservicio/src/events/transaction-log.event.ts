

export class TransactionLogEvent {
  servicio: string;
  entidadId?: bigint;
  entidadName?: string;
  idApp: bigint;
  operation: string;
  reference: string;
  requestPayload: any;
  responsePayload: any;
  status: number;
  errorMessage?: string;
}