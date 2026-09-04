/**
 * Backfill: cifra datos historicos en transacciones_servicios y transacciones_bancarias_detalle
 * Detecta plaintext via NOT LIKE '%:%:%' (formato iv:authTag:cipher b64 contiene ':')
 * Server cifra, Client desencripta con encryptionKey (32 chars) via UniversalCryptoService.decrypt
 *
 * Uso:
 *  npx ts-node scripts/backfill-encrypt-pago.ts
 *  # o con pnpm
 *  pnpm exec ts-node scripts/backfill-encrypt-pago.ts
 *
 * Requiere DATABASE_URL en .env y que prisma generate ya se haya ejecutado
 */
import { PrismaClient } from '@prisma/client';
import * as crypto from 'crypto';

// Duplicamos logica de UniversalCryptoService para no depender de Nest
function encrypt(text: string, secretKey: string): string {
  if (secretKey.length !== 32) throw new Error('key 32 chars');
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', Buffer.from(secretKey, 'utf8'), iv);
  let enc = cipher.update(text, 'utf8', 'base64');
  enc += cipher.final('base64');
  const tag = cipher.getAuthTag().toString('base64');
  return `${iv.toString('base64')}:${tag}:${enc}`;
}
function isEncrypted(v: string | null | undefined): boolean {
  if (!v) return true; // null no necesita cifrado
  return v.split(':').length === 3 && v.includes(':');
}
function sha256(v: string): string {
  return crypto.createHash('sha256').update(v, 'utf8').digest('hex');
}

const prisma = new PrismaClient();

async function main() {
  console.log('🔍 Buscando apps con encryptionKey...');
  const apps = await prisma.app.findMany({ select: { id_app: true, encryptionKey: true } });
  const keyByApp = new Map<number, string>();
  for (const a of apps) {
    if (a.encryptionKey && a.encryptionKey.length === 32) keyByApp.set(a.id_app, a.encryptionKey);
    else console.warn(`⚠️ app ${a.id_app} sin encryptionKey válida, se saltará`);
  }

  // 1. TransaccionesServicios - reference + referenceHash + requestPayload.cuentaEmpresa
  console.log('\n📦 TransaccionesServicios...');
  const txs = await prisma.transaccionesServicios.findMany({
    select: { idTransaccion: true, idApp: true, reference: true, referenceHash: true, requestPayload: true },
  });
  let txUpdated = 0;
  for (const tx of txs) {
    const key = keyByApp.get(tx.idApp);
    if (!key) continue;
    const payload: any = tx.requestPayload as any;
    let needUpdate = false;
    let newReference = tx.reference;
    let newHash = tx.referenceHash;
    let newPayload = payload;

    // reference plaintext -> cifrar + hash
    if (!isEncrypted(tx.reference)) {
      newReference = encrypt(tx.reference, key);
      newHash = sha256(tx.reference);
      needUpdate = true;
    } else if (!newHash) {
      // ya cifrado pero sin hash (migracion) -> no podemos recuperar plaintext, intentar desde payload si estaba plano
      // si payload.referenciaLote estaba plano, usar ese
      if (payload?.referenciaLote && !isEncrypted(payload.referenciaLote)) {
        newHash = sha256(payload.referenciaLote);
        needUpdate = true;
      }
    }
    // requestPayload.cuentaEmpresa
    if (payload?.cuentaEmpresa && !isEncrypted(payload.cuentaEmpresa)) {
      newPayload = { ...payload, cuentaEmpresa: encrypt(payload.cuentaEmpresa, key) };
      if (payload.detalles && Array.isArray(payload.detalles)) {
        newPayload.detalles = payload.detalles.map((d: any) => ({
          ...d,
          identificacion: d.identificacion && !isEncrypted(d.identificacion) ? encrypt(d.identificacion, key) : d.identificacion,
          cuenta: d.cuenta && !isEncrypted(d.cuenta) ? encrypt(d.cuenta, key) : d.cuenta,
          beneficiarioCuenta: d.beneficiarioCuenta && !isEncrypted(d.beneficiarioCuenta) ? encrypt(d.beneficiarioCuenta, key) : d.beneficiarioCuenta,
        }));
      }
      // referenciaLote en payload tambien
      if (payload.referenciaLote && !isEncrypted(payload.referenciaLote)) {
        newPayload.referenciaLote = newReference;
      }
      needUpdate = true;
    }
    if (needUpdate) {
      await prisma.transaccionesServicios.update({
        where: { idTransaccion: tx.idTransaccion },
        data: { reference: newReference, referenceHash: newHash, requestPayload: newPayload },
      });
      txUpdated++;
      console.log(`  ✓ tx ${tx.idTransaccion} cifrada`);
    }
  }
  console.log(`✅ TransaccionesServicios actualizadas: ${txUpdated}/${txs.length}`);

  // 2. TransaccionesBancariasDetalle - beneficiarioIdentificacion, beneficiarioCuenta, codigoSwiftAba
  console.log('\n📄 TransaccionesBancariasDetalle...');
  // Necesitamos idTransaccion -> idApp via join
  const detalles = await prisma.transaccionesBancariasDetalle.findMany({
    select: { id_detalle: true, idTransaccion: true, beneficiarioIdentificacion: true, beneficiarioCuenta: true, codigoSwiftAba: true },
  });
  // cache idTransaccion -> idApp
  const txAppMap = new Map<string, number>();
  const txIds = [...new Set(detalles.map(d => d.idTransaccion.toString()))];
  // fetch en lotes
  for (const id of txIds) {
    const t = await prisma.transaccionesServicios.findUnique({ where: { idTransaccion: BigInt(id) }, select: { idApp: true } });
    if (t) txAppMap.set(id, t.idApp);
  }
  let detUpdated = 0;
  for (const d of detalles) {
    const idApp = txAppMap.get(d.idTransaccion.toString());
    if (!idApp) continue;
    const key = keyByApp.get(idApp);
    if (!key) continue;
    let need = false;
    const data: any = {};
    if (!isEncrypted(d.beneficiarioIdentificacion)) {
      data.beneficiarioIdentificacion = encrypt(d.beneficiarioIdentificacion, key);
      need = true;
    }
    if (d.beneficiarioCuenta && !isEncrypted(d.beneficiarioCuenta)) {
      data.beneficiarioCuenta = encrypt(d.beneficiarioCuenta, key);
      need = true;
    }
    if (d.codigoSwiftAba && !isEncrypted(d.codigoSwiftAba)) {
      data.codigoSwiftAba = encrypt(d.codigoSwiftAba, key);
      need = true;
    }
    if (need) {
      await prisma.transaccionesBancariasDetalle.update({ where: { id_detalle: d.id_detalle }, data });
      detUpdated++;
    }
  }
  console.log(`✅ Detalles actualizados: ${detUpdated}/${detalles.length}`);

  console.log('\n🎉 Backfill completado. Verifica con:');
  console.log(`  SELECT reference, reference_hash, length(reference) FROM transacciones_servicios LIMIT 5;`);
  console.log(`  SELECT beneficiario_identificacion FROM transacciones_bancarias_detalle LIMIT 5; -- debe contener ':'`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
