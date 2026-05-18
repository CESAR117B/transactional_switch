
import { BadRequestException, Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
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

  @ApiOperation({ summary: 'Guarda una tarjeta utilizando el servicio de tokenización.' })
  @Post('guardar-tarjeta')
  async guardarTarjeta(@Req() req: any, @Body() cardData: TokenizeCardDto) {
    
    // 1. Extraemos el ID de la app que inyectó tu ApiKeyGuard
    // (Asegúrate de que 'req.app.id' coincida con cómo tu Guard guarda la info)
    const idApp = req.appAuth.id_app; 

    if (!idApp) {
        throw new BadRequestException('No se pudo identificar la App desde la API Key');
    }

    // 2. Le pasamos AMBOS parámetros a tu servicio
    return this.appService.guardarTarjeta(idApp, cardData);
  }
}
