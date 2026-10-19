/**
 * Backfill de los hash de búsqueda de `transacciones_bancarias_detalle`
 * (beneficiarioIdentificacionHash / beneficiarioCuentaHash): descifra los
 * detalles con la encryptionKey de su app y calcula el hash determinista.
 *
 * Idempotente: sólo toca filas con hash NULL (creadas antes de este cambio);
 * los lotes nuevos ya escriben el hash en los 4 puntos de inserción.
 *
 * Uso:  pnpm build && node dist/scripts/backfill-beneficiario-hash.js
 */
import { config } from 'dotenv';
config();

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { createDecipheriv } from 'crypto';
import { hashBusqueda } from '../servicios/hash-busqueda';

/** Descifrado local (mismo formato IV:authTag:cipher que
 * UniversalCryptoService, que no se instancia aquí para no arrancar Nest). */
function descifrar(paquete: string, secretKey: string): string {
  const parts = paquete.split(':');
  if (parts.length !== 3) {
    throw new Error(
      'Formato de encriptación inválido (se esperaba IV:authTag:Texto)',
    );
  }
  const decipher = createDecipheriv(
    'aes-256-gcm',
    Buffer.from(secretKey, 'utf8'),
    Buffer.from(parts[0], 'base64'),
  );
  decipher.setAuthTag(Buffer.from(parts[1], 'base64'));
  return decipher.update(parts[2], 'base64', 'utf8') + decipher.final('utf8');
}

async function main() {
  // Prisma 7 requiere driver adapter (mismo patrón que PrismaService)
  const adapter = new PrismaPg(
    new Pool({ connectionString: process.env.DATABASE_URL }),
  );
  const prisma = new PrismaClient({ adapter });
  try {
    const pendientes = await prisma.transaccionesBancariasDetalle.findMany({
      where: {
        OR: [
          { beneficiarioIdentificacionHash: null },
          {
            beneficiarioCuenta: { not: null },
            beneficiarioCuentaHash: null,
          },
        ],
      },
      include: { transaccionServicio: { select: { idApp: true } } },
    });
    console.log(`Detalles pendientes de backfill: ${pendientes.length}`);

    const llaves = new Map<number, string>();
    let actualizados = 0;
    for (const d of pendientes) {
      const idApp = d.transaccionServicio.idApp;
      let key = llaves.get(idApp);
      if (key === undefined) {
        const app = await prisma.app.findUnique({
          where: { id_app: idApp },
          select: { encryptionKey: true },
        });
        key = app?.encryptionKey ?? '';
        if (key.length !== 32) {
          console.warn(
            `app ${idApp} sin encryptionKey válida (32 chars); se omite`,
          );
        }
        llaves.set(idApp, key);
      }
      if (key.length !== 32) continue;

      const data: {
        beneficiarioIdentificacionHash?: string;
        beneficiarioCuentaHash?: string;
      } = {};
      if (d.beneficiarioIdentificacionHash === null) {
        data.beneficiarioIdentificacionHash = hashBusqueda(
          descifrar(d.beneficiarioIdentificacion, key),
          key,
        );
      }
      if (d.beneficiarioCuentaHash === null && d.beneficiarioCuenta) {
        data.beneficiarioCuentaHash = hashBusqueda(
          descifrar(d.beneficiarioCuenta, key),
          key,
        );
      }
      if (Object.keys(data).length > 0) {
        await prisma.transaccionesBancariasDetalle.update({
          where: { id_detalle: d.id_detalle },
          data,
        });
        actualizados++;
      }
    }
    console.log(
      `Backfill completo: ${actualizados} detalle(s) actualizado(s) de ${pendientes.length} pendiente(s).`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
