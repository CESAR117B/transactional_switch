import { Module, Global } from '@nestjs/common';

import { CronLogService } from './cron-log.service';

@Global() // Opcional: Hace que el servicio esté disponible globalmente si lo necesitas
@Module({
  providers: [CronLogService],
  exports: [CronLogService],
})
export class LogsModule {}