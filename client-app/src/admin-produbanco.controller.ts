import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequireService } from './require-service.decorator';
import { RequireCmd } from './require-cmd.decorator';
import { AppAuth, AppAuthConId } from './app-auth.decorator';
import { AppService } from './app.service';
import { ListarTransaccionesAdminQueryDto } from './dto/listar-transacciones-admin-query.dto';

/**
 * Consultas administrativas de transacciones Produbanco de TODAS las apps.
 *
 * Doble candado: la app debe tener el servicio ADMIN_PRODUBANCO asignado Y el
 * comando correspondiente en la jerarquía
 * servicios → servicios_controladores → controladores:
 *  - transacciones_admin
 *  - estado_transaccion_admin
 *
 * A diferencia de /tramas-produbanco, estas rutas NO exigen el header
 * X-Encryption-Key: el microservicio descifra con la encryption_key de la app
 * dueña de cada transacción (leída en BD).
 */
@ApiTags('Admin')
@ApiBearerAuth()
@RequireService('ADMIN_PRODUBANCO')
@Controller('admin/produbanco')
export class AdminProdubancoController {
  constructor(private readonly appService: AppService) {}

  @ApiOperation({
    summary:
      'Lista transacciones Produbanco de todas las apps (paginado). Incluye ' +
      'app_id, app_user_app y app_nombre por ítem. Los filtros cedula/cuenta ' +
      'requieren id_app porque el hash de búsqueda usa la llave de esa app.',
  })
  @RequireCmd('transacciones_admin')
  @Get('transacciones')
  async listarTransacciones(
    @AppAuth() auth: AppAuthConId,
    @Query() query: ListarTransaccionesAdminQueryDto,
  ) {
    void auth;
    return this.appService.transaccionesAdmin(query);
  }

  @ApiOperation({
    summary:
      'Estado de una transacción Produbanco de cualquier app por idTransaccion ' +
      'o referencia_lote. Consulta el banco en vivo y sincroniza la BD. ' +
      'id_app (query, opcional) acota la búsqueda a una app.',
  })
  @RequireCmd('estado_transaccion_admin')
  @Get('transacciones/estado/:dato')
  async estado_transaccion(
    @AppAuth() auth: AppAuthConId,
    @Param('dato') dato: string,
    @Query('id_app') id_app_raw?: string,
  ) {
    void auth;
    if (!dato || !dato.trim()) {
      throw new BadRequestException(
        'dato es requerido (idTransaccion o referencia_lote)',
      );
    }

    let id_app: number | undefined;
    if (id_app_raw !== undefined && id_app_raw !== '') {
      id_app = Number(id_app_raw);
      if (!Number.isInteger(id_app) || id_app <= 0) {
        throw new BadRequestException('id_app debe ser un entero positivo');
      }
    }

    return this.appService.estadoTransaccionAdmin(dato.trim(), id_app);
  }
}

