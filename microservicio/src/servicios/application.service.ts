import { Injectable } from '@nestjs/common';
import * as crypto from 'crypto';

@Injectable()
export class ApplicationService {
  /**
   * Genera una llave de encriptación aleatoria y segura de 32 caracteres
   * (16 bytes en hex = 32 chars).
   *
   * La usa el alta de apps (AppsService.crearApp), que la emite por defecto
   * junto con la key de login. También puede rotarse con
   * `nuevoencryptionkey_app`; al rotarla, los registros cifrados con la
   * llave anterior dejan de poder descifrarse, así que la rotación debe
   * planificarse con cuidado.
   */
  generarLlaveEncriptacion(): string {
    return crypto.randomBytes(16).toString('hex');
  }
}
