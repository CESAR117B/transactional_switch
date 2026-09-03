import { Injectable } from "@nestjs/common";
import { ProdubancoSoapService } from "../Integraciones/ProdubancoSoap.service";


@Injectable()
export class TramasProdubancoService {
    constructor(private readonly soapProdubanco: ProdubancoSoapService) {}

    async generarPago(idApp: number, data: any) {
        // Llamamos al servicio SOAP para generar la trama de pago
        const tramaPago = await this.soapProdubanco.autenticarYEncriptar(data);
        return tramaPago;
    }

    async generarTransferencia(idApp: number, data: any) {
        // Llamamos al servicio SOAP para generar la trama de transferencia
        const tramaTransferencia = await this.soapProdubanco.autenticarYEncriptar(data);
        return tramaTransferencia;
    }
}