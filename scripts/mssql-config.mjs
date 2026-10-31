/** @param {NodeJS.ProcessEnv} env */
export function sqlServerConfig(env = process.env) {
  /** @param {string} name */
  const required = name => {
    const value = env[name];
    if (!value) throw new Error(`Isi ${name} pada konfigurasi server.`);
    return value;
  };
  /** @param {string} name @param {number} fallback @param {number} max */
  const integer = (name, fallback, max) => {
    const raw = env[name];
    const value = raw === undefined || raw === '' ? fallback : Number(raw);
    if (!Number.isInteger(value) || value < 1 || value > max) throw new Error(`${name} harus berupa angka 1 sampai ${max}.`);
    return value;
  };
  /** @param {string} name @param {boolean} fallback */
  const boolean = (name, fallback) => {
    if (env[name] === undefined || env[name] === '') return fallback;
    if (env[name] === 'true') return true;
    if (env[name] === 'false') return false;
    throw new Error(`${name} harus true atau false.`);
  };
  const instanceName = env.MSSQL_INSTANCE?.trim();
  if (instanceName && env.MSSQL_PORT) throw new Error('Isi MSSQL_PORT atau MSSQL_INSTANCE, pilih salah satu.');
  return {
    server: required('MSSQL_SERVER').trim(),
    database: required('MSSQL_DATABASE').trim(),
    user: required('MSSQL_USER').trim(),
    password: required('MSSQL_PASSWORD'),
    ...(instanceName ? {} : { port: integer('MSSQL_PORT', 1433, 65535) }),
    connectionTimeout: integer('MSSQL_CONNECTION_TIMEOUT', 15000, 120000),
    requestTimeout: integer('MSSQL_REQUEST_TIMEOUT', 15000, 120000),
    pool: { max: integer('MSSQL_POOL_MAX', 10, 100), min: 0, idleTimeoutMillis: 30000 },
    options: {
      encrypt: boolean('MSSQL_ENCRYPT', true),
      trustServerCertificate: boolean('MSSQL_TRUST_SERVER_CERTIFICATE', false),
      abortTransactionOnError: true,
      ...(instanceName ? { instanceName } : {}),
    },
  };
}
