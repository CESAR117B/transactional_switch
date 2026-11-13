import { CronLogResult, CronLogService } from './cron-log.service';

export function LogProceso(nombrePersonalizado?: string) {
  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor,
  ) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      const logService: CronLogService = (this as any).cronLogService;

      if (!logService) {
        // Fallback si no está inyectado
        return originalMethod.apply(this, args);
      }

      const nombreProceso =
        nombrePersonalizado || `${target.constructor.name}.${propertyKey}`;

      // 1. Inicio
      const logId = await logService.startLog(nombreProceso);

      try {
        // 2. Ejecutar método original y capturar el resultado
        const result = await originalMethod.apply(this, args);

        // Convención:
        // - string -> mensaje de éxito
        // - { exito, mensaje, request, response } -> control total del cierre
        // - cualquier otra cosa -> mensaje por defecto
        if (
          result &&
          typeof result === 'object' &&
          'mensaje' in result
        ) {
          const detalle = result as CronLogResult;
          await logService.endLog(
            logId,
            detalle.exito ?? true,
            detalle.mensaje ?? '',
            {
              request: detalle.request,
              response: detalle.response,
            },
          );
        } else {
          const mensajeFinal =
            typeof result === 'string'
              ? result
              : 'Ejecución finalizada correctamente';

          await logService.endLog(logId, true, mensajeFinal);
        }

        return result;
      } catch (error) {
        // 3. Fin (Error)
        const errorMsg =
          error instanceof Error
            ? error.stack || error.message
            : JSON.stringify(error);
        await logService.endLog(logId, false, errorMsg);
        throw error;
      }
    };

    return descriptor;
  };
}
