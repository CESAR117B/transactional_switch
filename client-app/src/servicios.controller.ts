import { Controller, Get, Req } from '@nestjs/common';
import { AppService } from './app.service';
import { ApiOperation, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { RequireService } from './require-service.decorator';

@ApiTags('Servicios')
@ApiSecurity('AppId')
@ApiSecurity('AppKey')
@RequireService('fdv')
@Controller('servicios')
export class ServiciosController {
  constructor(private readonly appService: AppService) {}

  @ApiOperation({
    summary: 'Obtiene los servicios asociados a la app autenticada.',
  })
  @Get('mis-servicios')
  async obtenerMisServicios(@Req() request: any) {
    // 1. Extraemos el ID de la app que el Guard inyectó
    const appId = request.appAuth.id_app;

    return this.appService.obtenerServiciosPorApp(appId);
  }
}
