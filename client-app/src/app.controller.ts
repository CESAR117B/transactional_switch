import { Controller, Get, Req } from '@nestjs/common';
import { AppService } from './app.service';
import { ApiOperation, ApiBearerAuth, ApiTags } from '@nestjs/swagger';

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
}
