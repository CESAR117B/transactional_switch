
import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { AppService } from './app.service';
import { ApiOperation, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { ApiKeyGuard } from './api-key.guard';
import { RequireService } from './require-service.decorator';
import { TokenizeCardDto } from './dto/tokenize-card.dto';

@ApiTags('Servicios') // Etiqueta general para agrupar los endpoints de esta clase
@ApiSecurity('AppId') 
@ApiSecurity('AppKey')
@UseGuards(ApiKeyGuard) // Protegemos esta ruta con nuestro guard de API Key
@RequireService('SRV_FIRSTOKEN') // Requerimos que la app tenga acceso al servicio 'SRV_FIRSTOKEN' para cualquier endpoint de este controlador
@Controller()
export class SaveCardsController {
  constructor(private readonly appService: AppService) {}

  @ApiOperation({summary: 'Guarda una tarjeta utilizando el servicio de tokenización.'})
  @Post('guardar-tarjeta')
  async guardarTarjeta(@Body() cardData: TokenizeCardDto) {
    return this.appService.guardarTarjeta(cardData);
  }
}
