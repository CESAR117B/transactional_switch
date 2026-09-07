"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const crypto = __importStar(require("crypto"));
function encrypt(text, secretKey) {
    if (secretKey.length !== 32)
        throw new Error('key 32 chars');
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', Buffer.from(secretKey, 'utf8'), iv);
    let enc = cipher.update(text, 'utf8', 'base64');
    enc += cipher.final('base64');
    const tag = cipher.getAuthTag().toString('base64');
    return `${iv.toString('base64')}:${tag}:${enc}`;
}
function isEncrypted(v) {
    if (!v)
        return true;
    return v.split(':').length === 3 && v.includes(':');
}
function sha256(v) {
    return crypto.createHash('sha256').update(v, 'utf8').digest('hex');
}
const prisma = new client_1.PrismaClient();
async function main() {
    console.log('🔍 Buscando apps con encryptionKey...');
    const apps = await prisma.app.findMany({ select: { id_app: true, encryptionKey: true } });
    const keyByApp = new Map();
    for (const a of apps) {
        if (a.encryptionKey && a.encryptionKey.length === 32)
            keyByApp.set(a.id_app, a.encryptionKey);
        else
            console.warn(`⚠️ app ${a.id_app} sin encryptionKey válida, se saltará`);
    }
    console.log('\n📦 TransaccionesServicios...');
    const txs = await prisma.transaccionesServicios.findMany({
        select: { idTransaccion: true, idApp: true, reference: true, referenceHash: true, requestPayload: true },
    });
    let txUpdated = 0;
    for (const tx of txs) {
        const key = keyByApp.get(tx.idApp);
        if (!key)
            continue;
        const payload = tx.requestPayload;
        let needUpdate = false;
        let newReference = tx.reference;
        let newHash = tx.referenceHash;
        let newPayload = payload;
        if (!isEncrypted(tx.reference)) {
            newReference = encrypt(tx.reference, key);
            newHash = sha256(tx.reference);
            needUpdate = true;
        }
        else if (!newHash) {
            if (payload?.referenciaLote && !isEncrypted(payload.referenciaLote)) {
                newHash = sha256(payload.referenciaLote);
                needUpdate = true;
            }
        }
        if (payload?.cuentaEmpresa && !isEncrypted(payload.cuentaEmpresa)) {
            newPayload = { ...payload, cuentaEmpresa: encrypt(payload.cuentaEmpresa, key) };
            if (payload.detalles && Array.isArray(payload.detalles)) {
                newPayload.detalles = payload.detalles.map((d) => ({
                    ...d,
                    identificacion: d.identificacion && !isEncrypted(d.identificacion) ? encrypt(d.identificacion, key) : d.identificacion,
                    cuenta: d.cuenta && !isEncrypted(d.cuenta) ? encrypt(d.cuenta, key) : d.cuenta,
                    beneficiarioCuenta: d.beneficiarioCuenta && !isEncrypted(d.beneficiarioCuenta) ? encrypt(d.beneficiarioCuenta, key) : d.beneficiarioCuenta,
                }));
            }
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
    console.log('\n📄 TransaccionesBancariasDetalle...');
    const detalles = await prisma.transaccionesBancariasDetalle.findMany({
        select: { id_detalle: true, idTransaccion: true, beneficiarioIdentificacion: true, beneficiarioCuenta: true, codigoSwiftAba: true },
    });
    const txAppMap = new Map();
    const txIds = [...new Set(detalles.map(d => d.idTransaccion.toString()))];
    for (const id of txIds) {
        const t = await prisma.transaccionesServicios.findUnique({ where: { idTransaccion: BigInt(id) }, select: { idApp: true } });
        if (t)
            txAppMap.set(id, t.idApp);
    }
    let detUpdated = 0;
    for (const d of detalles) {
        const idApp = txAppMap.get(d.idTransaccion.toString());
        if (!idApp)
            continue;
        const key = keyByApp.get(idApp);
        if (!key)
            continue;
        let need = false;
        const data = {};
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
//# sourceMappingURL=backfill-encrypt-pago.js.map