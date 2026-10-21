import { Injectable } from '@nestjs/common';
import * as crypto from 'crypto';

@Injectable()
export class ApplicationService {
  /**
   * Genera una llave de encriptación aleatoria y segura de 32 caracteres
   * (16 bytes en hex = 32 chars).
   *
   * Es la ÚNICA vía de obtener una encryptionKey: la usa el alta de apps
   * (AppsService.crearApp), que la emite por defecto junto con la key de
   * login. Nunca se regenera una llave ya existente (rotarla rompería el
   * descifrado de todos los registros ya cifrados con ella).
   */
  generarLlaveEncriptacion(): string {
    return crypto.randomBytes(16).toString('hex');
  }
}
