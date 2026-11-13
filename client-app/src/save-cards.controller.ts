import {
  Body,
  Controller,
  Headers,
  Post,
} from '@nestjs/common';
import { AppService } from './app.service';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequireService } from './require-service.decorator';
import { TokenizeCardDto } from './dto/tokenize-card.dto';
import { AppAuth, AppAuthConId } from './app-auth.decorator';
import { requerirIdempotencyKey } from './idempotency-key';

@ApiTags('Servicios') // Etiqueta general para agrupar los endpoints de esta clase
@ApiBearerAuth()
@RequireService('SRV_FIRSTOKEN') // Requerimos que la app tenga acceso al servicio 'SRV_FIRSTOKEN' para cualquier endpoint de este controlador
@Controller()
export class SaveCardsController {
  constructor(private readonly appService: AppService) {}

  @ApiOperation({
    summary: 'Guarda una tarjeta utilizando el servicio de tokenización.',
  })
  @Post('guardar-tarjeta')
  async guardarTarjeta(
    @AppAuth() auth: AppAuthConId,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() cardData: TokenizeCardDto,
  ) {
    return this.appService.guardarTarjeta(auth.id_app, {
      ...cardData,
      idempotencyKey: requerirIdempotencyKey(idempotencyKey),
    });
  }
}
