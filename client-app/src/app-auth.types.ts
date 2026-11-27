/** Datos que el ApiKeyGuard inyecta en `request.appAuth` tras validar el JWT. */
export interface AppAuth {
  id_app?: number;
  user_app?: string;
  servicios?: string[];
  permisos?: string[];
}

/** Request HTTP autenticado por el ApiKeyGuard global. */
export interface RequestWithAppAuth {
  appAuth?: AppAuth;
  headers?: Record<string, string | string[] | undefined>;
}
