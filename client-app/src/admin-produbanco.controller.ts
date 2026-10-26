import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Query,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequireService } from './require-service.decorator';
import { RequireCmd } from './require-cmd.decorator';
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
 * X-Encryption-Key: el microservicio descifra con la encryptionKey de la app
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
      'idApp, identificadorApp y nombreApp por ítem. Los filtros cedula/cuenta ' +
      'requieren idApp porque el hash de búsqueda usa la llave de esa app.',
  })
  @RequireCmd('transacciones_admin')
  @Get('transacciones')
  async listarTransacciones(
    @Req() req: ReqConAppAuth,
    @Query() query: ListarTransaccionesAdminQueryDto,
  ) {
    if (!req.appAuth?.id_app) {
      throw new BadRequestException(
        'No se pudo identificar la App desde el token',
      );
    }
    return this.appService.transaccionesAdmin(query);
  }

  @ApiOperation({
    summary:
      'Estado de una transacción Produbanco de cualquier app por idTransaccion ' +
      'o referenciaLote. Consulta el banco en vivo y sincroniza la BD. ' +
      'idApp (query, opcional) acota la búsqueda a una app.',
  })
  @RequireCmd('estado_transaccion_admin')
  @Get('transacciones/estado/:dato')
  async estadoTransaccion(
    @Req() req: ReqConAppAuth,
    @Param('dato') dato: string,
    @Query('idApp') idAppRaw?: string,
  ) {
    if (!req.appAuth?.id_app) {
      throw new BadRequestException(
        'No se pudo identificar la App desde el token',
      );
    }
    if (!dato || !dato.trim()) {
      throw new BadRequestException(
        'dato es requerido (idTransaccion o referenciaLote)',
      );
    }

    let idApp: number | undefined;
    if (idAppRaw !== undefined && idAppRaw !== '') {
      idApp = Number(idAppRaw);
      if (!Number.isInteger(idApp) || idApp <= 0) {
        throw new BadRequestException('idApp debe ser un entero positivo');
      }
    }

    return this.appService.estadoTransaccionAdmin(dato.trim(), idApp);
  }
}

/** Request con el appAuth inyectado por el ApiKeyGuard global (JWT). */
interface ReqConAppAuth {
  appAuth?: { id_app?: number };
}
