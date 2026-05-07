export type LogFields = Record<string, unknown>;

export function logInfo(msg: string, fields?: LogFields) {
  // eslint-disable-next-line no-console
  console.log(JSON.stringify({ level: "info", msg, ts: new Date().toISOString(), ...fields }));
}

export function logWarn(msg: string, fields?: LogFields) {
  // eslint-disable-next-line no-console
  console.warn(JSON.stringify({ level: "warn", msg, ts: new Date().toISOString(), ...fields }));
}

export function logError(msg: string, fields?: LogFields) {
  // eslint-disable-next-line no-console
  console.error(JSON.stringify({ level: "error", msg, ts: new Date().toISOString(), ...fields }));
}
