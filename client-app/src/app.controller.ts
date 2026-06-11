import { Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { AppService } from './app.service';
import { ApiOperation, ApiBearerAuth, ApiTags } from '@nestjs/swagger'; // 👈 Cambiamos ApiSecurity por ApiBearerAuth
import { ApiKeyGuard } from './api-key.guard';

@ApiTags('App') 
@ApiBearerAuth() 
@UseGuards(ApiKeyGuard) 
@Controller('app')
export class AppController {
  constructor(private readonly appService: AppService) {}

  @ApiOperation({ summary: 'Prueba de autenticación.' })
  @Get('')
  async getAppData(@Req() request: any): Promise<string> {
    // 2. Extrae el ID del objeto appAuth inyectado por el Guard de JWT
    const appId = request.appAuth.id_app; 
    return this.appService.get_data(appId);
  }

  @ApiOperation({ summary: 'Generar claves de encriptación para todas las aplicaciones.' })
  @Post('migrate-encryption-keys')
  async migrateEncryptionKeys(@Req() request: any) {
    const appId = request.appAuth.id_app;
    return this.appService.encrypkeyApp(appId);
  }
}