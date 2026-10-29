import { Injectable, Logger } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import { PrismaService } from '../prisma/prisma.service';
import { createHash, randomBytes, scrypt, timingSafeEqual } from 'crypto';
import { promisify } from 'util';

const scryptAsync = promisify(scrypt);

/** Formato de hash de app.key: scrypt$<salt hex>$<hash hex>. */
const SCRYPT_PREFIJO = 'scrypt';
const SCRYPT_LONGITUD = 64; // bytes derivados (512 bits)

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * Hash scrypt con salt aleatorio para almacenar app.key.
   *
   * PÚBLICO: lo reutiliza AppsService para guardar la key generada en el
   * alta de una app (el hash es irreversible, por eso la key cruda sólo
   * se devuelve en la respuesta de creación).
   */
  async hashKey(key: string): Promise<string> {
    const salt = randomBytes(16);
    const derived = (await scryptAsync(key, salt, SCRYPT_LONGITUD)) as Buffer;
    return `${SCRYPT_PREFIJO}$${salt.toString('hex')}$${derived.toString('hex')}`;
  }

  /**
   * Verificación constante en el tiempo. Soporta el hash scrypt (formato
   * nuevo) y la key en claro (legacy, se migra en el primer login).
   */
  private async verificarKey(
    keyEnviada: string,
    almacenada: string,
  ): Promise<boolean> {
    if (almacenada.startsWith(`${SCRYPT_PREFIJO}$`)) {
      const [, saltHex, hashHex] = almacenada.split('$');
      if (!saltHex || !hashHex) return false;
      const salt = Buffer.from(saltHex, 'hex');
      const esperado = Buffer.from(hashHex, 'hex');
      const obtenido = (await scryptAsync(
        keyEnviada,
        salt,
        esperado.length,
      )) as Buffer;
      return (
        obtenido.length === esperado.length &&
        timingSafeEqual(obtenido, esperado)
      );
    }

    // Legacy en claro: se compara por sha256 (normaliza el largo) con
    // timingSafeEqual para evitar el timing de app.key !== key.
    const a = createHash('sha256').update(keyEnviada, 'utf8').digest();
    const b = createHash('sha256').update(almacenada, 'utf8').digest();
    return timingSafeEqual(a, b);
  }

  async validarCredencialesApp(identificador: string, key: string) {
    // 1. Buscamos la App y viajamos por todas las relaciones hasta llegar al controlador
    const app = await this.prisma.app.findUnique({
      where: { identificador_app: identificador },
      include: {
        app_servicios: {
          include: {
            servicios: {
              where: { activo: true },
              include: {
                servicios_controladores: {
                  include: {controladores: true}
                },
              },
            },
          },
        },
      },
    });

    // Un SOLO mensaje para no revelar si el identificador existe, si está
    // inactiva o si la key está mal (evita enumeración de apps).
    const CREDENCIALES_INVALIDAS = 'Credenciales inválidas';
    if (!app || app.activo === false) {
      throw new RpcException({ status: 401, message: CREDENCIALES_INVALIDAS });
    }

    const keyOk = await this.verificarKey(key, app.key);
    if (!keyOk) {
      throw new RpcException({ status: 401, message: CREDENCIALES_INVALIDAS });
    }

    // Migración on-the-fly: la key en claro (legacy) se reemplaza por su
    // hash scrypt tras el primer login válido. Un fallo no bloquea el login.
    if (!app.key.startsWith(`${SCRYPT_PREFIJO}$`)) {
      try {
        const keyHash = await this.hashKey(key);
        await this.prisma.app.update({
          where: { id_app: app.id_app },
          data: { key: keyHash },
        });
        this.logger.log(
          `app.key de ${app.identificador_app} migrada a hash scrypt`,
        );
      } catch (error: unknown) {
        this.logger.warn(
          `No se pudo migrar app.key de ${app.identificador_app}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    // 2. Extraemos los comandos ('cmp') asignados a la App.
    // Usamos un 'Set' de JavaScript para evitar duplicados si dos servicios comparten el mismo controlador.
    const comandosPermitidos = new Set<string>();
    const serviciosPermitidos = new Set<string>();

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

    return {
      id_app: app.id_app,
      identificador: app.identificador_app,
      permisos: Array.from(comandosPermitidos),
      servicios: Array.from(serviciosPermitidos),
    };
  }
}
