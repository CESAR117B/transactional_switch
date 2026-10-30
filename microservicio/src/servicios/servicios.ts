import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class Servicios {
  constructor(private prisma: PrismaService) {}

  async getServicios(appId: number) {
    // Sólo servicios vigentes en ambos niveles: global (`servicios.activo`) y
    // por app (`app_servicios.activo`). NULL se considera activo.
    const servicios = await this.prisma.servicios.findMany({
      where: {
        OR: [{ activo: true }, { activo: null }],
        app_servicios: {
          some: {
            id_app: appId,
            OR: [{ activo: true }, { activo: null }],
          },
        },
      },
    });

    const serviciosMap = servicios.map((servicio) => ({
      nombre: servicio.nombre,
      codigo: servicio.codigo,
      descripcion: servicio.descripcion,
      activo: servicio.activo,
    }));

    return serviciosMap;
  }
}
