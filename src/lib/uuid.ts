/**
 * Math.random-based UUID v4. Sufficient for per-user IDs (series_id, request_id)
 * where uniqueness only needs to hold within one user's data — no crypto API
 * required, so it works in React Native without `react-native-get-random-values`.
 */
export function uuidv4(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
