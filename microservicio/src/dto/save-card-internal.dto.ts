import { IsNumber, IsNotEmpty } from 'class-validator';
import { TokenizeCardDto } from './tokenize-card.dto';

// Extendemos el DTO original para incluir el idApp
export class SaveCardInternalDto extends TokenizeCardDto {
  @IsNumber({}, { message: 'El idApp debe ser un número válido' })
  @IsNotEmpty()
  idApp: number;
}