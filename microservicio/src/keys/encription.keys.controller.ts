import { Controller } from '@nestjs/common';
import { ApplicationService } from '../servicios/application.service';
import { MessagePattern, Payload } from '@nestjs/microservices';

@Controller('encription-keys')
export class EncriptionKeysController {
    constructor(private readonly applicationService: ApplicationService) { }

    @MessagePattern({ cmd: 'migrate_apps_encryption_keys' })
    async migrateApps() {
        return await this.applicationService.migrateAllExistingApps();
    }

    @MessagePattern({ cmd: 'add_app_encryption_key' })
    async addKey(@Payload() data: { idApp: number }) {
        return await this.applicationService.addEncryptionKeyToApp(data.idApp);
    }
}
