import { Global, Module } from '@nestjs/common';
import { ServicioController } from './servicio.controller';
import { ServiciosService } from './servicios.service';
import { CardSaveController } from './card-save.controller';
import { CardSaveService } from './card-save.service';
import { AuditoriaService } from './auditoria.service';
import { ApplicationService } from './application.service';
import { UniversalCryptoService } from './universal-crypto.service';
import { TramasProdubancoController } from './tramas-produbanco.controller';
import { TramasProdubancoService } from './tramas-produbanco.service';
import { TransaccionesProdubancoJobService } from './transacciones-produbanco.job';
import { TramaBuilderService } from '../produbanco/trama-builder.service';
import { LotesRepository } from '../produbanco/lotes.repository';
import { ConsultaTransaccionesService } from '../produbanco/consulta-transacciones.service';
import { CronLockService } from '../common/cron-lock.service';

@Global()
@Module({
  controllers: [
    ServicioController,
    CardSaveController,
    TramasProdubancoController,
  ],
  providers: [
    ServiciosService,
    CardSaveService,
    AuditoriaService,
    ApplicationService,
    UniversalCryptoService,
    TramaBuilderService,
    LotesRepository,
    ConsultaTransaccionesService,
    TramasProdubancoService,
    TransaccionesProdubancoJobService,
    CronLockService,
  ],
  exports: [
    ServiciosService,
    CardSaveService,
    AuditoriaService,
    ApplicationService,
    UniversalCryptoService,
    TramasProdubancoService,
  ],
})
export class ServiciosModule {}
