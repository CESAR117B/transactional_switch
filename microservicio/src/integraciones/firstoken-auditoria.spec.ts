import { FirstokenService } from './firstoken.service';

function crearServicio(): FirstokenService {
  return new FirstokenService(
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
  );
}

describe('FirstokenService.respuestaAuditable', () => {
  const auditable = (data: unknown) =>
    (crearServicio() as any).respuestaAuditable(data) as Record<string, any>;

  it('enmascara el token de la tarjeta', () => {
    const respuesta = auditable({
      card_holder: 'JUAN PEREZ',
      custom_field_details: {
        card: {
          token: 'token-secreto',
          card_truncated: '****-****-****-1234',
          last_four: '1234',
        },
      },
    });

    expect(respuesta.custom_field_details.card.token).toBe('[REDACTED]');
    expect(respuesta.custom_field_details.card.last_four).toBe('1234');
    expect(respuesta.card_holder).toBe('JUAN PEREZ');
  });

  it('no modifica la respuesta original', () => {
    const original = {
      custom_field_details: { card: { token: 'token-secreto' } },
    };

    auditable(original);

    expect(original.custom_field_details.card.token).toBe('token-secreto');
  });

  it('devuelve un objeto vacío si no hay respuesta', () => {
    expect(auditable(undefined)).toEqual({});
    expect(auditable(null)).toEqual({});
  });

  it('tolera respuestas sin token', () => {
    const respuesta = auditable({ custom_field_details: { card: {} } });

    expect(respuesta).toEqual({ custom_field_details: { card: {} } });
  });
});
