// src/auditoria/auditoria.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TransactionLogEvent } from '../events/transaction-log.event';
import * as crypto from 'crypto';

@Injectable()
export class AuditoriaService {
  private readonly logger = new Logger(AuditoriaService.name);

  constructor(private readonly prisma: PrismaService) {}

  // 🎧 Este decorador hace que la función se ejecute en segundo plano
  // cada vez que alguien emita el evento 'audit.record'
  @OnEvent('audit.record', { async: true }) // async: true es clave para no bloquear el hilo principal
  async handleAuditLogEvent(payload: TransactionLogEvent) {
    const transactionReference = crypto.randomUUID();
    const referenceHash = crypto
      .createHash('sha256')
      .update(transactionReference, 'utf8')
      .digest('hex');
    try {
      // 1. Sanitizamos el request payload (quitar CVV, PAN completo, etc.)
      const sanitizedRequest = this.sanitizePayload(payload.requestPayload);

      // 2. Guardamos en la base de datos
      // Opcion 1: reference plaintext (UUID no sensible) + referenceHash para mantener unique/index compat con PRODUBANCO cifrado
      // Mantiene referenceHash nullable en schema para no romper Firstoken si luego se hace NOT NULL
      await this.prisma.transaccionesServicios.create({
        data: {
          servicio: payload.servicio,
          entidadId: payload.entidadId,
          entidadName: payload.entidadName,
          idApp: payload.idApp,
          operation: payload.operation,
          reference: transactionReference,
          referenceHash,
          requestPayload: sanitizedRequest as Prisma.InputJsonValue,
          responsePayload: (payload.responsePayload ??
            {}) as Prisma.InputJsonValue,
          status: payload.status,
          errorMessage: payload.errorMessage,
        },
      });

      this.logger.debug(
        `📝 Auditoría guardada en 2do plano [Ref: ${transactionReference}]`,
      );
    } catch (error) {
      // Si la auditoría falla, NO rompe la transacción principal de la tarjeta
      this.logger.error(
        `❌ Error guardando auditoría [Ref: ${transactionReference}]:`,
        error.message,
      );
    }
  }

  // Helper para proteger datos sensibles de PCI DSS antes de ir a BD
  private sanitizePayload(payload: unknown): Record<string, unknown> {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      return {};
    }
    const clean: Record<string, unknown> = {
      ...(payload as Record<string, unknown>),
    };
    delete clean.card_cvv;
    const cardNumber = clean.card_number;
    if (typeof cardNumber === 'string') {
      clean.card_number = `****-****-****-${cardNumber.slice(-4)}`;
    }
    return clean;
  }
}
