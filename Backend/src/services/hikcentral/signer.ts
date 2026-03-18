/**
 * services/hikcentral/signer.ts
 *
 * Artemis authentication helpers.
 * Thin wrappers around the core signing logic in integrations/hikcentral/signature.ts.
 */

import crypto from 'crypto';
import {
    createHikCentralAuthHeaders,
    buildHikCentralStringToSign,
    signHikCentralStringToBase64,
    HikCentralSignatureParams,
} from '../../integrations/hikcentral/signature';

export type { HikCentralSignatureParams };

/**
 * Generate a cryptographically random nonce for X-Ca-Nonce.
 * Returns a 32-character lowercase hex string.
 */
export function generateNonce(): string {
    return crypto.randomBytes(16).toString('hex');
}

/**
 * Generate the current Unix timestamp in milliseconds as a string for X-Ca-Timestamp.
 */
export function generateTimestamp(): string {
    return String(Date.now());
}

/**
 * Generate the full set of Artemis authentication headers for a request.
 *
 * @param method   HTTP method ('POST', 'GET', etc.)
 * @param apiPath  Full request path, e.g. '/api/pms/v1/crossRecords/page'
 * @param body     Serialized request body string (empty string for GET)
 * @param appKey   HikCentral App Key (X-Ca-Key)
 * @param appSecret HikCentral App Secret (used for HMAC-SHA256)
 *
 * @returns Headers object including Content-Type, X-Ca-Key, X-Ca-Signature,
 *          X-Ca-Timestamp, and X-Ca-Nonce.
 */
export function generateSignature(
    method: string,
    apiPath: string,
    body: string,
    appKey: string,
    appSecret: string,
): Record<string, string> {
    const nonce = generateNonce();
    const timestampMs = Date.now();

    return createHikCentralAuthHeaders({
        method,
        contentType: 'application/json',
        body,
        apiPath,
        appKey,
        appSecret,
        timestampMs,
        nonce,
    });
}

export { buildHikCentralStringToSign, signHikCentralStringToBase64, createHikCentralAuthHeaders };
