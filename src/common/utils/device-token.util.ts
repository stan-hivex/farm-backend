export function verifyDeviceToken(token: string) {
  if (!token) return null;
  try {
    return JSON.parse(token);
  } catch {
    return null;
  }
}
