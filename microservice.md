## Documentación de Arquitectura de Seguridad y Uso del Switch Transaccional

Este documento describe la arquitectura técnica, el modelo de datos y los flujos de integración del ecosistema del Switch de Pagos, conectando una aplicación cliente, un **API Gateway** perimetral (NestJS) y un **Microservicio** interno de lógica de negocio (NestJS/Prisma).

---

### 1. Componentes del Ecosistema

1. **App Cliente:** Consume la API del Switch. Genera tokens criptográficos locales para resguardar la base de datos de manera simétrica y consume endpoints protegidos por JWT.
2. **API Gateway (NestJS):** Actúa como proxy reverso y guardián perimetral. Emite tokens JWT válidos por 1 hora mediante `/auth/login` y valida los accesos de los endpoints del negocio mediante el `ApiKeyGuard` de forma matemática sin consultar la base de datos en cada petición.
3. **Microservicio (NestJS Core):** Aloja la lógica dura de negocio y la conexión con pasarelas externas. Es el único componente con acceso directo a la base de datos a través de Prisma.

---

### 🔑 2. Flujo de Autenticación Basado en Tokens (JWT)

Para mitigar riesgos por exposición constante de credenciales maestras (`APP_ID` y `API_KEY`), el sistema migró a un esquema de desacoplamiento temporal.

### Intercambio Inicial (Handshake)
Una aplicación externa realiza una petición única de autenticación. El Gateway delega la verificación al microservicio y, si las credenciales existen y la App está activa, genera un JWT firmado con el secreto del servidor.

* **Payload del JWT emitido:**
```json
{
  "id_app": 1,
  "sub": "social_shopby_v445",
  "servicios": ["SRV_FIRSTOKEN"],
  "permisos": ["firstoken_cmp"],
  "iat": 1781212553,
  "exp": 1781216153
}
```

### Estándar de Criptografía Universal (AES-256-GCM)

Los datos sensibles nunca se almacenan en texto plano. Se utiliza cifrado simétrico con autenticación integrada (GCM). El formato de almacenamiento es agnóstico e intercambiable entre diferentes lenguajes de programación.