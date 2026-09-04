import { Controller, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { ApiKeyGuard } from './api-key.guard';
import { RequireService } from "./require-service.decorator";

@ApiTags('Servicios') // Etiqueta general para agrupar los endpoints de esta clase
@ApiBearerAuth() 
@UseGuards(ApiKeyGuard) // Protegemos esta ruta con nuestro guard de API Key
@RequireService('SPR_PRODUBANCO')
@Controller('tramas-produbanco')
export class TramasProdubancoController{

    async generarPago() {
        // Aquí iría la lógica para obtener las tramas de Produbanco
        return { message: 'Tramas de Produbanco obtenidas correctamente' };
    }

    async generarTransferencia() {
        // Aquí iría la lógica para obtener las tramas de Produbanco
        return { message: 'Tramas de Produbanco obtenidas correctamente' };
    }

    

} 