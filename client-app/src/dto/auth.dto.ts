import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({
    description: 'El identificador único asignado a la aplicación cliente.',
    example: 'app_symfony_pay_01',
    type: String,
    required: true,
  })
  @IsString({ message: 'El app_id debe ser una cadena de texto.' })
  @IsNotEmpty({ message: 'El app_id es obligatorio para iniciar sesión.' })
  @MaxLength(100, { message: 'El app_id no puede exceder 100 caracteres.' })
  app_id: string;

  @ApiProperty({
    description:
      'La llave secreta (App Key o API Key) vinculada a la aplicación.',
    example: 'd3b07384d113edec49eaa6238ad5ff00',
    type: String,
    required: true,
  })
  @IsString({ message: 'El app_key debe ser una cadena de texto.' })
  @IsNotEmpty({ message: 'El app_key es obligatorio para iniciar sesión.' })
  @MaxLength(300, { message: 'La app_key no puede exceder 300 caracteres.' })
  app_key: string;
}
