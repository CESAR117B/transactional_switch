import { Body, Controller, Inject, Post, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { ClientProxy } from "@nestjs/microservices";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { firstValueFrom } from "rxjs";
import { LoginDto } from "./dto/auth.dto";

@ApiTags('App')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly jwtService: JwtService,
    @Inject('MATH_SERVICE') private readonly mathClient: ClientProxy,
  ) {}

  @Post('login')
  @ApiOperation({ 
    summary: 'Iniciar sesión de la aplicación', 
    description: 'Valida las credenciales maestras de la app y retorna un token JWT válido por 1 hora.' 
  })
  @ApiResponse({ status: 401, description: 'Credenciales inválidas.' })
  async login(@Body() credentials: LoginDto) {
    // 1. Validamos las credenciales enviando el mensaje al microservicio (como hacías en el Guard)
    const appInfo = await firstValueFrom(
      this.mathClient.send({ cmd: 'validar_app' }, { identificador: credentials.app_id, key: credentials.app_key })
    );

    if (!appInfo) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    // 2. Si es válida, firmamos un token que expire en 1 hora
    const payload = { 
      id_app: appInfo.id_app,
      sub: appInfo.identificador, 
      servicios: appInfo.servicios, 
      permisos: appInfo.permisos 
    };

    return {
      access_token: this.jwtService.sign(payload, { secret: process.env.JWT_SECRET, expiresIn: '1h' }),
      expires_in: 3600
    };
  }
}