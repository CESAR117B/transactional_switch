// src/auditoria/auditoria.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service';
import { TransactionLogEvent } from '../events/transaction-log.event';

@Injectable()
export class AuditoriaService {
  private readonly logger = new Logger(AuditoriaService.name);

  constructor(private readonly prisma: PrismaService) {}

  // 🎧 Este decorador hace que la función se ejecute en segundo plano
  // cada vez que alguien emita el evento 'audit.record'
  @OnEvent('audit.record', { async: true }) // async: true es clave para no bloquear el hilo principal
  async handleAuditLogEvent(payload: TransactionLogEvent) {
    console.log('🚨 ¡EL EVENTO SE DISPARÓ EN SEGUNDO PLANO!', payload.reference);
    try {
      // 1. Sanitizamos el request payload (quitar CVV, PAN completo, etc.)
      const sanitizedRequest = this.sanitizePayload(payload.requestPayload);

      // 2. Guardamos en la base de datos
      await this.prisma.transaccionesServicios.create({
        data: {
          servicio: payload.servicio,
          entidadId: payload.entidadId,
          entidadName: payload.entidadName,
          idApp: payload.idApp,
          operation: payload.operation,
          reference: payload.reference,
          requestPayload: sanitizedRequest,
          responsePayload: payload.responsePayload,
          status: payload.status,
          errorMessage: payload.errorMessage,
        },
      });

      this.logger.debug(`📝 Auditoría guardada en 2do plano [Ref: ${payload.reference}]`);
    } catch (error) {
      // Si la auditoría falla, NO rompe la transacción principal de la tarjeta
      this.logger.error(`❌ Error guardando auditoría [Ref: ${payload.reference}]:`, error.message);
    }
  }

  // Helper para proteger datos sensibles de PCI DSS antes de ir a BD
  private sanitizePayload(payload: any): any {
    if (!payload) return {};
    const clean = { ...payload };
    if (clean.card_cvv) delete clean.card_cvv;
    if (clean.card_number) {
      clean.card_number = `****-****-****-${clean.card_number.slice(-4)}`;
    }
    return clean;
  }
}