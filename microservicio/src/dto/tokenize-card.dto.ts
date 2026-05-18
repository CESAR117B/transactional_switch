// tokenize-card.dto.ts (Dentro del Microservicio)
import { IsString, IsNotEmpty, Length, Matches, IsBoolean } from 'class-validator';

export class TokenizeCardDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/^[0-9]{13,19}$/)
  card_number: string;

  @IsString()
  @IsNotEmpty()
  card_holder: string;

  @IsString()
  @IsNotEmpty()
  @Length(2, 2)
  card_month: string;

  @IsString()
  @IsNotEmpty()
  @Length(4, 4)
  card_year: string;

  @IsString()
  @IsNotEmpty()
  @Length(3, 3)
  card_cvv?: string;

  @IsBoolean()
  @IsNotEmpty()
  temporal: boolean
}