import { Injectable } from '@nestjs/common';
import * as crypto from 'crypto';

@Injectable()
export class UniversalCryptoService {
  // AES-256-GCM es el estándar de oro actual: encripta y además verifica que nadie haya manipulado el texto.
  private readonly algorithm = 'aes-256-gcm';

  /**
   * Encripta un texto en texto plano y lo empaqueta en un formato universal (IV:AuthTag:EncryptedText)
   * @param text El texto a ocultar (ej. el token de la tarjeta)
   * @param secretKey La llave de 32 caracteres generada para la App
   * @returns Un string codificado en base64 separado por ':'
   */
  encrypt(text: string, secretKey: string): string {
    if (secretKey.length !== 32) {
      throw new Error('La llave de encriptación debe tener exactamente 32 caracteres.');
    }

    // 1. Vector de Inicialización (IV): Necesario y debe ser aleatorio por cada encriptación. 
    // 12 bytes es el tamaño estándar recomendado para el algoritmo GCM.
    const iv = crypto.randomBytes(12);

    // 2. Creamos la instancia del cifrador
    const cipher = crypto.createCipheriv(
      this.algorithm, 
      Buffer.from(secretKey, 'utf8'), 
      iv
    );

    // 3. Procesamos el texto
    let encrypted = cipher.update(text, 'utf8', 'base64');
    encrypted += cipher.final('base64');

    // 4. Etiqueta de Autenticación (Auth Tag): Es la firma matemática que garantiza que el texto no fue alterado en la BD
    const authTag = cipher.getAuthTag().toString('base64');

    // 5. Empaquetamos todo en un formato universal
    return `${iv.toString('base64')}:${authTag}:${encrypted}`;
  }

  /**
   * Desencripta un paquete previamente encriptado con esta misma clase
   * @param encryptedPackage El string guardado en la base de datos (IV:AuthTag:EncryptedText)
   * @param secretKey La misma llave de 32 caracteres que se usó para encriptar
   * @returns El texto original
   */
  decrypt(encryptedPackage: string, secretKey: string): string {
    if (secretKey.length !== 32) {
      throw new Error('La llave de encriptación debe tener exactamente 32 caracteres.');
    }

    // 1. Desarmamos el paquete
    const parts = encryptedPackage.split(':');
    if (parts.length !== 3) {
      throw new Error('Formato de encriptación inválido. Se esperaba IV:AuthTag:Texto');
    }

    const iv = Buffer.from(parts[0], 'base64');
    const authTag = Buffer.from(parts[1], 'base64');
    const encryptedText = parts[2];

    // 2. Creamos la instancia del descifrador
    const decipher = crypto.createDecipheriv(
      this.algorithm, 
      Buffer.from(secretKey, 'utf8'), 
      iv
    );
    
    // 3. Le pasamos el Auth Tag para que verifique que la data es íntegra
    decipher.setAuthTag(authTag);

    // 4. Procesamos la desencriptación
    let decrypted = decipher.update(encryptedText, 'base64', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  }
}