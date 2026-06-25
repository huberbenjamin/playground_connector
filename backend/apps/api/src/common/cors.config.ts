const DEFAULT_DEV_ORIGINS = [
  'http://localhost:8080',
  'http://127.0.0.1:8080',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
];

export function resolveCorsOrigin():
  | boolean
  | string[]
  | ((origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => void) {
  const configured = process.env.CORS_ORIGINS?.trim();
  if (configured) {
    return configured.split(',').map((origin) => origin.trim()).filter(Boolean);
  }

  if (process.env.NODE_ENV !== 'production') {
    return (origin, callback) => {
      if (!origin) {
        callback(null, true);
        return;
      }

      if (DEFAULT_DEV_ORIGINS.includes(origin) || origin.endsWith('.ngrok-free.app')) {
        callback(null, true);
        return;
      }

      callback(null, true);
    };
  }

  return false;
}

export const CORS_OPTIONS = {
  credentials: true,
  methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'Accept',
    'Origin',
    'X-Requested-With',
    'ngrok-skip-browser-warning',
  ],
  exposedHeaders: ['Content-Type', 'Authorization'],
  preflightContinue: false,
  optionsSuccessStatus: 204,
};
