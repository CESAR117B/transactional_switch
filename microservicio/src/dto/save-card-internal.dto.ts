import { IsNumber, IsNotEmpty } from 'class-validator';
import { TokenizeCardDto } from './tokenize-card.dto';

// Extendemos el DTO original para incluir el id_app
export class SaveCardInternalDto extends TokenizeCardDto {
  @IsNumber({}, { message: 'El id_app debe ser un número válido' })
  @IsNotEmpty()
  id_app: number;
}
