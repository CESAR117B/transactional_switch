import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AppAuth, AppAuthConId } from './app-auth.decorator';

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
  async obtenerMisServicios(@AppAuth() auth: AppAuthConId) {
    return this.appService.obtenerServiciosPorApp(auth.id_app);
  }
}
