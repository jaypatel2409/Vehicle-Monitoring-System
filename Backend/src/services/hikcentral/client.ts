/**
 * services/hikcentral/client.ts
 *
 * Configured Axios instance for HikCentral Artemis API.
 * - Self-signed certificate support (rejectUnauthorized: false)
 * - Artemis base URL from config
 * - Request interceptor that attaches fresh auth headers per request
 * - Response interceptor for structured logging
 */

import axios, { AxiosInstance, InternalAxiosRequestConfig } from 'axios';
import https from 'https';
import hikCentralConfig from '../../config/hikcentral';
import { logger } from '../../utils/logger';
import { generateNonce, generateSignature } from './signer';

/**
 * Create a new Axios instance pre-configured for HikCentral Artemis.
 */
function createArtemisAxios(): AxiosInstance {
    const httpsAgent = new https.Agent({
        keepAlive: true,
        // Allow self-signed certificates on the HikCentral server.
        // Controlled via HIKCENTRAL_ALLOW_SELF_SIGNED=true in .env.
        rejectUnauthorized: !hikCentralConfig.allowSelfSigned,
    });

    const instance = axios.create({
        baseURL: hikCentralConfig.baseUrl, // e.g. https://127.0.0.1/artemis
        timeout: hikCentralConfig.timeoutMs,
        httpsAgent,
        // validateStatus: allow all HTTP statuses through so we can log & handle them ourselves
        validateStatus: () => true,
        headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
        },
    });

    // ── Request interceptor: attach fresh Artemis auth headers on every request ──
    instance.interceptors.request.use((config: InternalAxiosRequestConfig) => {
        const method = (config.method ?? 'GET').toUpperCase();
        const apiPath = config.url ?? '';
        const bodyString =
            config.data && typeof config.data === 'string'
                ? config.data
                : config.data
                    ? JSON.stringify(config.data)
                    : '';

        const authHeaders = generateSignature(
            method,
            apiPath,
            bodyString,
            hikCentralConfig.appKey,
            hikCentralConfig.appSecret,
        );

        // Merge auth headers, also adding the required userId header
        config.headers = config.headers ?? {};
        Object.assign(config.headers, authHeaders, { userId: 'admin' });

        logger.info(`[HikCentral] → ${method} ${apiPath}`);

        return config;
    });

    // ── Response interceptor: structured logging of status + HikCentral codes ──
    instance.interceptors.response.use(
        (response) => {
            const method = (response.config.method ?? 'GET').toUpperCase();
            const url = response.config.url ?? '';
            const hkCode = response.data?.code;
            const hkMsg = response.data?.msg ?? response.data?.message ?? '';

            if (response.status >= 200 && response.status < 300) {
                if (hkCode !== undefined && hkCode !== 0 && hkCode !== '0') {
                    logger.warn(`[HikCentral] ← ${response.status} ${method} ${url} | code=${hkCode} msg="${hkMsg}"`);
                } else {
                    logger.info(`[HikCentral] ← ${response.status} ${method} ${url} | code=${hkCode ?? 'n/a'}`);
                }
            } else {
                logger.error(`[HikCentral] ← ${response.status} ${method} ${url} | code=${hkCode ?? 'n/a'} msg="${hkMsg}"`, {
                    responseData: response.data,
                });
            }

            return response;
        },
        (error) => {
            logger.error('[HikCentral] Request failed (network/tls error)', { error: error?.message, code: error?.code });
            return Promise.reject(error);
        },
    );

    return instance;
}

/**
 * Singleton Axios instance for HikCentral Artemis.
 * Import this in vehicle.service.ts and other services that call HikCentral.
 */
export const artemisClient = createArtemisAxios();
