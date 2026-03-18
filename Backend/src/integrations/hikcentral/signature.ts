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
   * Full API path used for signing (must include /artemis prefix),
   * e.g. `/artemis/api/pms/v1/crossRecords/page`.
   */
  apiPath: string;
  appKey: string;
  appSecret: string;
  timestampMs: number;
  nonce: string;
}

export function buildHikCentralStringToSign(
  params: HikCentralSignatureParams
): string {
  const method = params.method.toUpperCase();

  const signedHeaders = [
    `x-ca-key:${params.appKey}`,
    `x-ca-nonce:${params.nonce}`,
    `x-ca-timestamp:${params.timestampMs}`,
  ].join('\n');

  return [
    method,              // POST
    '*/*',               // Accept
    params.contentType,  // application/json
    signedHeaders,       // x-ca-key, x-ca-nonce, x-ca-timestamp
    params.apiPath,      // /artemis/api/pms/v1/crossRecords/page
  ].join('\n');
}

export function signHikCentralStringToBase64(
  stringToSign: string,
  appSecret: string
): string {
  return crypto
    .createHmac('sha256', appSecret)
    .update(stringToSign, 'utf8')
    .digest('base64');
}

export function createHikCentralAuthHeaders(
  params: HikCentralSignatureParams
): Record<string, string> {
  const stringToSign = buildHikCentralStringToSign(params);
  const signature = signHikCentralStringToBase64(
    stringToSign,
    params.appSecret
  );

  return {
    'Content-Type':             params.contentType,
    'Accept':                   '*/*',
    'x-ca-key':                 params.appKey,
    'x-ca-nonce':               params.nonce,
    'x-ca-timestamp':           String(params.timestampMs),
    'x-ca-signature':           signature,
    'x-ca-signature-headers':   'x-ca-key,x-ca-nonce,x-ca-timestamp',
  };
}
