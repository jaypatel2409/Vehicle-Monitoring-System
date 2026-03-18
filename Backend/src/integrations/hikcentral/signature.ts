import crypto from 'crypto';

export interface HikCentralSignatureParams {
  method: string;
  contentType: string;
  /**
   * Raw request body string used for signing.
   * For JSON, this must match the exact payload bytes sent.
   */
  body: string;
  /**
   * Full API path used for signing (must match request path exactly),
   * e.g. `/api/pms/v1/crossRecords/page`.
   */
  apiPath: string;
  appKey: string;
  appSecret: string;
  timestampMs: number;
  nonce: string;
}

/**
 * Build the canonical string-to-sign for HikCentral Artemis HMAC-SHA256 authentication.
 *
 * Artemis 2.x signing format (per HikCentral OpenAPI Developer Guide):
 *
 *   HTTPMethod\n
 *   Content-Type\n
 *   X-Ca-Nonce:{nonce}\n
 *   X-Ca-Timestamp:{timestampMs}\n
 *   {apiPath}
 *
 * NOTE: X-Ca-Nonce and X-Ca-Timestamp MUST be present in the signed string.
 * Omitting them causes a 401 "Signature mismatch" error from HikCentral.
 */
export function buildHikCentralStringToSign(params: HikCentralSignatureParams): string {
  const method = params.method.toUpperCase();
  return [
    method,
    params.contentType,
    `X-Ca-Nonce:${params.nonce}`,
    `X-Ca-Timestamp:${params.timestampMs}`,
    params.apiPath,
  ].join('\n');
}

export function signHikCentralStringToBase64(stringToSign: string, appSecret: string): string {
  return crypto.createHmac('sha256', appSecret).update(stringToSign, 'utf8').digest('base64');
}

export function createHikCentralAuthHeaders(params: HikCentralSignatureParams): Record<string, string> {
  const stringToSign = buildHikCentralStringToSign(params);
  const signature = signHikCentralStringToBase64(stringToSign, params.appSecret);

  return {
    'Content-Type': params.contentType,
    'X-Ca-Key': params.appKey,
    'X-Ca-Signature': signature,
    'X-Ca-Timestamp': String(params.timestampMs),
    'X-Ca-Nonce': params.nonce,
  };
}
