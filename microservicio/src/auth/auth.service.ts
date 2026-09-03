import { Injectable } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import { PrismaService } from '../prisma/prisma.service';


@Injectable()
export class AuthService {
  constructor(private prisma: PrismaService) {}

  async validarCredencialesApp(identificador: string, key: string) {
    // 1. Buscamos la App y viajamos por todas las relaciones hasta llegar al controlador
    const app = await this.prisma.app.findUnique({
      where: { identificador_app: identificador },
      include: {
        app_servicios: {
          include: {
            servicios: {
              include: {
                servicios_controladores: {
                  include: { controladores: true } // Aquí está el 'cmp'
                }
              }
            }
          }
        }
      }
    });

    // Validaciones de seguridad básicas
    if (!app || app.activo === false) {
      throw new RpcException({ status: 401, message: 'App no registrada o inactiva' });
    }
    if (app.key !== key) {
      throw new RpcException({ status: 401, message: 'Credenciales inválidas' });
    }

    // 2. Extraemos los comandos ('cmp') asignados a la App.
    // Usamos un 'Set' de JavaScript para evitar duplicados si dos servicios comparten el mismo controlador.
    const comandosPermitidos = new Set<string>();
    const serviciosPermitidos = new Set<string>(); // <-- NUEVO: Para guardar los códigos

    app.app_servicios.forEach((appServ) => {
      // Guardamos el código del servicio (ej. 'CATALOGO_SRV')
      if (appServ.servicios?.codigo) {
        serviciosPermitidos.add(appServ.servicios.codigo);
      }

      // Guardamos los controladores individuales
      appServ.servicios?.servicios_controladores.forEach((servCtrl) => {
        if (servCtrl.controladores?.cmp) {
          comandosPermitidos.add(servCtrl.controladores.cmp);
        }
      });
    });

    // ... (lógica de controladores públicos) ...

    return { 
      id_app: app.id_app, 
      identificador: app.identificador_app,
      permisos: Array.from(comandosPermitidos),
      servicios: Array.from(serviciosPermitidos) // <-- Lo enviamos a la App Cliente
    };
  }
}