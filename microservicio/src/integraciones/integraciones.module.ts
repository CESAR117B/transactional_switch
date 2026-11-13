import { Global, Module } from '@nestjs/common';
import { FirstokenService } from './firstoken.service';
import { ProdubancoSoapService } from './produbanco-soap.service';
import { HttpModule } from '@nestjs/axios';
import { ConfigDbModule } from '../config-db/config-db.module';

@Global()
@Module({
  imports: [HttpModule, ConfigDbModule],
  providers: [FirstokenService, ProdubancoSoapService],
  exports: [FirstokenService, ProdubancoSoapService],
})
export class IntegracionesModule {}
