import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AppsController } from './apps.controller';
import { AppsService } from './apps.service';

/**
 * Funciones del App administrador. Por ahora: alta de apps
 * (cmd RPC 'crear_app' → POST /admin/apps en el gateway).
 *
 * Importa AuthModule para reutilizar AuthService.hashKey (hash scrypt
 * de app.key). PrismaService y ApplicationService llegan por los
 * módulos @Global (PrismaModule / ServiciosModule).
 */
@Module({
  imports: [AuthModule],
  controllers: [AppsController],
  providers: [AppsService],
  exports: [AppsService],
})
export class AdminModule {}
