import { Controller, Get, Post, Req } from '@nestjs/common';
import { AppService } from './app.service';
import { ApiOperation, ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequireCmd } from './require-cmd.decorator';

@ApiTags('App')
@ApiBearerAuth()
@Controller('app')
export class AppController {
  constructor(private readonly appService: AppService) {}

  @ApiOperation({ summary: 'Prueba de autenticación.' })
  @Get('')
  async getAppData(@Req() request: any): Promise<string> {
    // Extrae el ID del objeto appAuth inyectado por el Guard global de JWT
    const appId = request.appAuth.id_app;
    return this.appService.get_data(appId);
  }

  @ApiOperation({
    summary:
      'Genera la llave de encriptación de la app (sólo si aún no tiene; ' +
      'nunca rota una llave existente)',
  })
  // El cmp 'add_app_encryption_key' no está asignado a ninguna app en BD:
  // endpoint deshabilitado para todos hasta que un admin asigne el permiso.
  @RequireCmd('add_app_encryption_key')
  @Post('migrate-encryption-keys')
  async migrateEncryptionKeys(@Req() request: any) {
    const appId = request.appAuth.id_app;
    return this.appService.encrypkeyApp(appId);
  }
}
