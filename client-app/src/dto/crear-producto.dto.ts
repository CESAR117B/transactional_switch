import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNumber, IsOptional, IsNotEmpty, Min } from 'class-validator';

export class CreateProductDto {
  @ApiProperty({
    description: 'El nombre comercial del producto',
    example: 'Laptop Gamer Pro',
  })
  @IsString({ message: 'El nombre debe ser un texto' })
  @IsNotEmpty({ message: 'El nombre no puede estar vacío' })
  name: string;

  @ApiPropertyOptional({
    description: 'Una breve descripción de las características del producto',
    example: 'Pantalla 4K, 32GB RAM, SSD 1TB',
  })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({
    description: 'El precio de venta unitario en USD',
    example: 1200.50,
    minimum: 0,
  })
  @IsNumber({}, { message: 'El precio debe ser un número' })
  @Min(0, { message: 'El precio no puede ser negativo' })
  price: number;
}