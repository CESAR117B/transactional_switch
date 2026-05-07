import { ApiProperty } from '@nestjs/swagger';
import { 
  IsString, 
  IsNotEmpty, 
  Length, 
  Matches, 
  MaxLength, 
  IsBoolean
} from 'class-validator';

export class TokenizeCardDto {
  
  @ApiProperty({
    description: 'Número de la tarjeta de crédito (PAN) sin espacios ni caracteres especiales.',
    example: '36545400000008',
    type: String,
    minLength: 13,
    maxLength: 19,
    pattern: '^[0-9]{13,19}$'
  })
  @IsString({ message: 'El número de tarjeta debe ser un texto' })
  @IsNotEmpty({ message: 'El número de tarjeta es obligatorio' })
  @Matches(/^[0-9]{13,19}$/, { message: 'El número de tarjeta debe contener entre 13 y 19 dígitos numéricos' })
  card_number: string;


  @ApiProperty({
    description: 'Nombre completo del titular de la tarjeta, tal como aparece impreso en el plástico.',
    example: 'SANTIAGO SUAREZ',
    type: String,
    maxLength: 100,
    pattern: '^[a-zA-Z\\s]+$'
  })
  @IsString({ message: 'El nombre del titular debe ser un texto' })
  @IsNotEmpty({ message: 'El nombre del titular es obligatorio' })
  @MaxLength(100, { message: 'El nombre del titular excede el máximo de 100 caracteres' })
  @Matches(/^[a-zA-Z\s]+$/, { message: 'El nombre solo puede contener letras y espacios' })
  card_holder: string;


  @ApiProperty({
    description: 'Mes de expiración de la tarjeta en formato de dos dígitos (01 al 12).',
    example: '02',
    type: String,
    minLength: 2,
    maxLength: 2,
    pattern: '^(0[1-9]|1[0-2])$'
  })
  @IsString()
  @IsNotEmpty()
  @Length(2, 2, { message: 'El mes debe tener exactamente 2 dígitos' })
  @Matches(/^(0[1-9]|1[0-2])$/, { message: 'El mes de expiración debe estar entre 01 y 12' })
  card_month: string;


  @ApiProperty({
    description: 'Año de expiración de la tarjeta en formato de cuatro dígitos (ej. 2028).',
    example: '2028',
    type: String,
    minLength: 4,
    maxLength: 4,
    pattern: '^(20)\\d{2}$'
  })
  @IsString()
  @IsNotEmpty()
  @Length(4, 4, { message: 'El año debe tener exactamente 4 dígitos' })
  @Matches(/^(20)\d{2}$/, { message: 'El año de expiración no es válido' })
  card_year: string;

  @ApiProperty({
    description: 'Indica si el token a generar es temporal (true) o permanente (false).',
    example: false,
    type: Boolean
  })
  @IsBoolean()
  @IsNotEmpty()
  temporal: boolean
}