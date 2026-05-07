import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { AppService } from './app.service';
import { ApiOperation, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { ApiKeyGuard } from './api-key.guard';
import { RequireService } from './require-service.decorator';

@ApiTags('App') // Etiqueta general para agrupar los endpoints de esta clase
@ApiSecurity('AppId') 
@ApiSecurity('AppKey')
@UseGuards(ApiKeyGuard) // Protegemos esta ruta con nuestro guard de API Key
@Controller('app')
export class AppController {
  constructor(private readonly appService: AppService) {}

  @ApiOperation({ summary: 'Prueba de autenticación.' })
  @Get('')
  async getAppData(@Req() request: any): Promise<String> {
      
    const appId = request.appAuth.id_app; 
    return this.appService.get_data(appId);
  }
}
