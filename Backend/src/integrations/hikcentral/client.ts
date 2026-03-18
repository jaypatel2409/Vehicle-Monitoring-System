import axios, { AxiosError, AxiosInstance } from "axios";
import https from "https";
import crypto from "crypto";
import hikCentralConfig from "../../config/hikcentral";
import { logger } from "../../utils/logger";
import { HikCentralIntegrationError } from "./errors";
import { createHikCentralAuthHeaders } from "./signature";
import { extractPagedList } from "./types";

export interface HikCentralRequestOptions<TBody> {
  method: "GET" | "POST" | "PUT" | "DELETE";
  apiPath: string;
  body?: TBody;
}

class HikCentralClient {
  private axios: AxiosInstance;

  constructor() {
    const httpsAgent = new https.Agent({
      keepAlive: true,
      rejectUnauthorized: !hikCentralConfig.allowSelfSigned,
    });

    this.axios = axios.create({
      baseURL: hikCentralConfig.baseUrl,
      timeout: hikCentralConfig.timeoutMs,
      httpsAgent,
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      validateStatus: () => true,
    });
  }

  private async sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private computeDelay(attempt: number) {
    const base = hikCentralConfig.retryBaseDelayMs;
    const max = hikCentralConfig.retryMaxDelayMs;
    return Math.min(max, base * Math.pow(2, attempt));
  }

  async requestJson<TData, TBody = unknown>(
    options: HikCentralRequestOptions<TBody>
  ): Promise<TData> {
    const { method, apiPath, body } = options;

    const bodyString = body ? JSON.stringify(body) : "";
    const maxAttempts = hikCentralConfig.maxRetries + 1;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const nonce = crypto.randomBytes(16).toString("hex");
        const timestamp = Date.now();

        const headers = createHikCentralAuthHeaders({
          method,
          apiPath,
          body: bodyString,
          contentType: "application/json",
          appKey: hikCentralConfig.appKey,
          appSecret: hikCentralConfig.appSecret,
          timestampMs: timestamp,
          nonce,
        });

        // Ensure required headers for Cross Records API
        const requestHeaders = {
          ...headers,
          "Content-Type": "application/json",
          userId: "admin",
        };

        const response = await this.axios.request({
          method,
          url: apiPath,
          headers: requestHeaders,
          data: bodyString || undefined,
        });

        if (response.status < 200 || response.status >= 300) {
          logger.error("HikCentral HTTP error response", {
            status: response.status,
            url: `${hikCentralConfig.baseUrl}${apiPath}`,
            data: response.data,
          });

          throw new HikCentralIntegrationError("HikCentral HTTP error", {
            status: response.status,
            apiPath,
          });
        }

        const payload: any = response.data;

        if (payload && payload.code && payload.code !== "0") {
          throw new HikCentralIntegrationError("HikCentral API error", {
            code: payload.code,
            message: payload.msg || payload.message,
          });
        }

        if (payload?.data !== undefined) {
          return payload.data as TData;
        }

        return payload as TData;
      } catch (error) {
        const err = error as AxiosError;

        const isNetworkError =
          err.code === "ECONNRESET" ||
          err.code === "ETIMEDOUT" ||
          err.code === "ECONNREFUSED" ||
          err.code === "ENOTFOUND";

        if (attempt < maxAttempts && isNetworkError) {
          const delay = this.computeDelay(attempt);
          logger.warn("Retrying HikCentral request", {
            attempt,
            delay,
          });
          await this.sleep(delay);
          continue;
        }

        throw error;
      }
    }

    throw new Error("HikCentral request failed after retries");
  }

  async requestPagedList<TItem, TBody = unknown>(
    options: HikCentralRequestOptions<TBody>
  ): Promise<TItem[]> {
    const data = await this.requestJson<any, TBody>(options);

    const list = extractPagedList<TItem>(data);

    if (!list) return [];

    return list;
  }
}

export const hikCentralClient = new HikCentralClient();