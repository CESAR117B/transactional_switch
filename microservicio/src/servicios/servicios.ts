import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class Servicios {
  constructor(private prisma: PrismaService) {}

  async getServicios(appId: number) {
    const servicios = await this.prisma.servicios.findMany({
      where: {
        app_servicios: {
          some: {
            id_app: appId,
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


  cuanto_paga(appId:number, codigo_servicio:string){
      return 30;
  }
  
}