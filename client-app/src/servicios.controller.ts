import { Controller, Get, Req } from '@nestjs/common';
import { AppService } from './app.service';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

@ApiTags('Servicios')
@ApiBearerAuth()
@Controller('servicios')
export class ServiciosController {
  constructor(private readonly appService: AppService) {}

  @ApiOperation({
    summary: 'Obtiene los servicios asignados a la app autenticada.',
    description:
      'Accesible para cualquier app registrada con JWT válido; no requiere ' +
      'servicios ni permisos adicionales asignados (igual que GET /app).',
  })
  @Get('mis-servicios')
  async obtenerMisServicios(@Req() request: any) {
    // 1. Extraemos el ID de la app que el Guard inyectó
    const appId = request.appAuth.id_app;

    return this.appService.obtenerServiciosPorApp(appId);
  }
}
