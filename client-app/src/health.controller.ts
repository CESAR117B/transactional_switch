import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Public } from './public.decorator';
import {
  crearAlertaMicroservicioNoDisponible,
  MicroserviceRpcService,
} from './microservice-rpc.service';

/**
 * Endpoint público para verificar la conexión con el microservicio.
 * No requiere JWT: sirve también para balanceadores/monitoreo.
 */
@ApiTags('Salud')
@Public()
@Controller('health')
export class HealthController {
  constructor(private readonly rpc: MicroserviceRpcService) {}

  @ApiOperation({
    summary: 'Estado de la conexión con el microservicio.',
    description:
      'Devuelve 200 si hay conexión TCP con el microservicio y 503 con la ' +
      'alerta MICROSERVICIO_NO_DISPONIBLE si no se puede conectar.',
  })
  @ApiResponse({ status: 200, description: 'Microservicio conectado.' })
  @ApiResponse({
    status: 503,
    description: 'Microservicio no disponible.',
  })
  @Get()
  async estado() {
    const conectado = await this.rpc.verificarConexion();

    if (!conectado) {
      throw crearAlertaMicroservicioNoDisponible();
    }

    return {
      status: 'ok',
      microservicio: 'conectado',
      timestamp: new Date().toISOString(),
    };
  }
}
