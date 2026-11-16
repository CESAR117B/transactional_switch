import {
  Body,
  Controller,
  Headers,
  Post,
} from '@nestjs/common';
import { AppService } from './app.service';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
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
  @ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    description:
      'UUID único por operación (máx. 100 caracteres). Reutilizalo exactamente igual en cada reintento para evitar tokenizaciones duplicadas.',
    example: '550e8400-e29b-41d4-a716-446655440000',
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
