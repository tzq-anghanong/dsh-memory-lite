const PREFIX = "[dsh-memory-lite]";
export const log = {
  warn: (...a) => console.warn(PREFIX, ...a),
  error: (...a) => console.error(PREFIX, ...a),
};