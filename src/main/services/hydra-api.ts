import axios, { AxiosError, AxiosInstance } from "axios";
import { WindowManager } from "./window-manager";
import url from "url";
import { uploadGamesBatch } from "./library-sync";
import { clearGamesRemoteIds } from "./library-sync/clear-games-remote-id";
import { networkLogger as logger } from "./logger";
import { UserNotLoggedInError, SubscriptionRequiredError } from "@shared";
import { omit } from "lodash-es";
import { appVersion } from "@main/constants";
import { getUserData } from "./user/get-user-data";
import { db } from "@main/level";
import { levelKeys } from "@main/level/sublevels";
import type { Auth, User } from "@types";
import { WSClient } from "./ws/ws-client";

interface HydraApiOptions {
  needsAuth?: boolean;
  needsSubscription?: boolean;
  ifModifiedSince?: Date;
  retryAttempts?: number;
  retryDelay?: number;
}

interface HydraApiUserAuth {
  authToken: string;
  refreshToken: string;
  expirationTimestamp: number;
  subscription: { expiresAt: Date | string | null } | null;
}

// Enhanced error types for better error handling
export class NetworkError extends Error {
  constructor(message: string, public readonly originalError?: any) {
    super(message);
    this.name = 'NetworkError';
  }
}

export class BackendUnavailableError extends Error {
  constructor(message: string = 'Backend service is currently unavailable') {
    super(message);
    this.name = 'BackendUnavailableError';
  }
}

export class HydraApi {
  private static instance: AxiosInstance;
  private static readonly DEFAULT_RETRY_ATTEMPTS = 3;
  private static readonly DEFAULT_RETRY_DELAY = 1000; // 1 second

  private static readonly EXPIRATION_OFFSET_IN_MS = 1000 * 60 * 5; // 5 minutes
  private static readonly ADD_LOG_INTERCEPTOR = true;

  private static secondsToMilliseconds(seconds: number) {
    return seconds * 1000;
  }

  private static userAuth: HydraApiUserAuth = {
    authToken: "",
    refreshToken: "",
    expirationTimestamp: 0,
    subscription: null,
  };

  public static isLoggedIn() {
    return this.userAuth.authToken !== "";
  }

  private static hasActiveSubscription() {
    const expiresAt = new Date(this.userAuth.subscription?.expiresAt ?? 0);
    return expiresAt > new Date();
  }

  // Enhanced error handling with retry logic
  private static async retryRequest<T>(
    requestFn: () => Promise<T>,
    retryAttempts: number = this.DEFAULT_RETRY_ATTEMPTS,
    retryDelay: number = this.DEFAULT_RETRY_DELAY
  ): Promise<T> {
    let lastError: any;

    for (let attempt = 0; attempt <= retryAttempts; attempt++) {
      try {
        return await requestFn();
      } catch (error) {
        lastError = error;
        
        // Don't retry on authentication errors
        if (error instanceof UserNotLoggedInError || error instanceof SubscriptionRequiredError) {
          throw error;
        }

        // Don't retry on 401 errors (handled by handleUnauthorizedError)
        if (error instanceof AxiosError && error.response?.status === 401) {
          throw error;
        }

        // Check if it's a network error that we should retry
        if (this.isRetryableError(error) && attempt < retryAttempts) {
          logger.warn(`Request failed (attempt ${attempt + 1}/${retryAttempts + 1}):`, error.message);
          await this.delay(retryDelay * Math.pow(2, attempt)); // Exponential backoff
          continue;
        }

        // If we've exhausted retries or it's not retryable, throw the error
        break;
      }
    }

    // Enhanced error logging and categorization
    if (lastError instanceof AxiosError) {
      if (lastError.code === 'ECONNREFUSED' || lastError.code === 'ENOTFOUND') {
        logger.error('Backend connection failed:', lastError.message);
        throw new BackendUnavailableError(`Backend service unavailable: ${lastError.message}`);
      }
      
      if (lastError.response?.status >= 500) {
        logger.error('Server error:', lastError.response.status, lastError.response.data);
        throw new NetworkError(`Server error: ${lastError.response.status}`, lastError);
      }
    }

    logger.error('Request failed after all retry attempts:', lastError);
    throw new NetworkError(`Request failed: ${lastError.message}`, lastError);
  }

  private static isRetryableError(error: any): boolean {
    if (error instanceof AxiosError) {
      // Retry on network errors and 5xx server errors
      return !error.response || (error.response.status >= 500 && error.response.status < 600);
    }
    
    // Retry on generic network errors
    return error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND' || error.code === 'ETIMEDOUT';
  }

  private static delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  static async handleExternalAuth(uri: string) {
    const { payload } = url.parse(uri, true).query;

    const decodedBase64 = atob(payload as string);
    const jsonData = JSON.parse(decodedBase64);

    const { accessToken, expiresIn, refreshToken } = jsonData;

    const now = new Date();

    const tokenExpirationTimestamp =
      now.getTime() +
      this.secondsToMilliseconds(expiresIn) -
      this.EXPIRATION_OFFSET_IN_MS;

    this.userAuth = {
      authToken: accessToken,
      refreshToken: refreshToken,
      expirationTimestamp: tokenExpirationTimestamp,
      subscription: null,
    };

    logger.log(
      "Sign in received. Token expiration timestamp:",
      tokenExpirationTimestamp
    );

    db.put<string, Auth>(
      levelKeys.auth,
      {
        accessToken,
        refreshToken,
        tokenExpirationTimestamp,
      },
      { valueEncoding: "json" }
    );

    await getUserData().then((userDetails) => {
      if (userDetails?.subscription) {
        this.userAuth.subscription = {
          expiresAt: userDetails.subscription.expiresAt
            ? new Date(userDetails.subscription.expiresAt)
            : null,
        };
      }
    });

    if (WindowManager.mainWindow) {
      WindowManager.mainWindow.webContents.send("on-signin");
      await clearGamesRemoteIds();
      uploadGamesBatch();
      WSClient.close();
      WSClient.connect();
    }
  }

  static handleSignOut() {
    this.userAuth = {
      authToken: "",
      refreshToken: "",
      expirationTimestamp: 0,
      subscription: null,
    };

    this.post("/auth/logout", {}, { needsAuth: false }).catch(() => {});
  }

  static async setupApi() {
    this.instance = axios.create({
      baseURL: import.meta.env.VITE_MAIN_VITE_API_URL,
      headers: { "User-Agent": `Neo Launcher v${appVersion}` },
    });

    if (this.ADD_LOG_INTERCEPTOR) {
      this.instance.interceptors.request.use(
        (request) => {
          logger.log(" ---- REQUEST -----");
          const data = Array.isArray(request.data)
            ? request.data
            : omit(request.data, ["refreshToken"]);
          logger.log(request.method, request.url, request.params, data);
          return request;
        },
        (error) => {
          logger.error("request error", error);
          return Promise.reject(error);
        }
      );
      this.instance.interceptors.response.use(
        (response) => {
          logger.log(" ---- RESPONSE -----");
          const data = Array.isArray(response.data)
            ? response.data
            : omit(response.data, ["username", "accessToken", "refreshToken"]);
          logger.log(
            response.status,
            response.config.method,
            response.config.url,
            data
          );
          return response;
        },
        (error) => {
          logger.error(" ---- RESPONSE ERROR -----");
          const { config } = error;

          const data = JSON.parse(config.data ?? null);

          logger.error(
            config.method,
            config.baseURL,
            config.url,
            omit(config.headers, [
              "accessToken",
              "refreshToken",
              "Authorization",
            ]),
            Array.isArray(data)
              ? data
              : omit(data, ["accessToken", "refreshToken"])
          );
          if (error.response) {
            logger.error(
              "Response error:",
              error.response.status,
              error.response.data
            );

            return Promise.reject(error as Error);
          }

          if (error.request) {
            const errorData = error.toJSON();
            logger.error("Request error:", errorData.code, errorData.message);
            return Promise.reject(
              new Error(
                `Request failed with ${errorData.code} ${errorData.message}`
              )
            );
          }

          logger.error("Error", error.message);
          return Promise.reject(error as Error);
        }
      );
    }

    const result = await db.getMany<string>([levelKeys.auth, levelKeys.user], {
      valueEncoding: "json",
    });

    const userAuth = result.at(0) as Auth | undefined;
    const user = result.at(1) as User | undefined;

    this.userAuth = {
      authToken: userAuth?.accessToken ?? "",
      refreshToken: userAuth?.refreshToken ?? "",
      expirationTimestamp: userAuth?.tokenExpirationTimestamp ?? 0,
      subscription: user?.subscription
        ? { expiresAt: user.subscription?.expiresAt }
        : null,
    };

    const updatedUserData = await getUserData();

    this.userAuth.subscription = updatedUserData?.subscription
      ? {
          expiresAt: updatedUserData.subscription.expiresAt,
        }
      : null;
  }

  private static sendSignOutEvent() {
    if (WindowManager.mainWindow) {
      WindowManager.mainWindow.webContents.send("on-signout");
    }
  }

  public static async refreshToken() {
    const response = await this.instance.post(`/auth/refresh`, {
      refreshToken: this.userAuth.refreshToken,
    });

    const { accessToken, expiresIn } = response.data;

    const tokenExpirationTimestamp =
      Date.now() +
      this.secondsToMilliseconds(expiresIn) -
      this.EXPIRATION_OFFSET_IN_MS;

    this.userAuth.authToken = accessToken;
    this.userAuth.expirationTimestamp = tokenExpirationTimestamp;

    logger.log(
      "Token refreshed. New expiration:",
      this.userAuth.expirationTimestamp
    );

    await db
      .get<string, Auth>(levelKeys.auth, { valueEncoding: "json" })
      .then((auth) => {
        return db.put<string, Auth>(
          levelKeys.auth,
          {
            ...auth,
            accessToken,
            tokenExpirationTimestamp,
          },
          { valueEncoding: "json" }
        );
      });

    return { accessToken, expiresIn };
  }

  private static async revalidateAccessTokenIfExpired() {
    if (this.userAuth.expirationTimestamp < Date.now()) {
      try {
        await this.refreshToken();
      } catch (err) {
        this.handleUnauthorizedError(err);
      }
    }
  }

  private static getAxiosConfig() {
    return {
      headers: {
        Authorization: `Bearer ${this.userAuth.authToken}`,
      },
    };
  }

  private static readonly handleUnauthorizedError = (err) => {
    if (err instanceof AxiosError && err.response?.status === 401) {
      logger.error(
        "401 - Current credentials:",
        this.userAuth,
        err.response?.data
      );

      this.userAuth = {
        authToken: "",
        expirationTimestamp: 0,
        refreshToken: "",
        subscription: null,
      };

      db.batch([
        {
          type: "del",
          key: levelKeys.auth,
        },
        {
          type: "del",
          key: levelKeys.user,
        },
      ]);

      this.sendSignOutEvent();
    }

    throw err;
  };

  private static async validateOptions(options?: HydraApiOptions) {
    const needsAuth = options?.needsAuth == undefined || options.needsAuth;
    const needsSubscription = options?.needsSubscription === true;

    if (needsAuth) {
      if (!this.isLoggedIn()) throw new UserNotLoggedInError();
      await this.revalidateAccessTokenIfExpired();
    }

    if (needsSubscription && !this.hasActiveSubscription()) {
      throw new SubscriptionRequiredError();
    }
  }

  static async get<T = any>(
    url: string,
    params?: any,
    options?: HydraApiOptions
  ) {
    await this.validateOptions(options);

    const headers = {
      ...this.getAxiosConfig().headers,
      "Hydra-If-Modified-Since": options?.ifModifiedSince?.toUTCString(),
    };

    return this.retryRequest(
      () => this.instance
        .get<T>(url, { params, ...this.getAxiosConfig(), headers })
        .then((response) => response.data)
        .catch(this.handleUnauthorizedError),
      options?.retryAttempts,
      options?.retryDelay
    );
  }

  static async post<T = any>(
    url: string,
    data?: any,
    options?: HydraApiOptions
  ) {
    await this.validateOptions(options);

    return this.retryRequest(
      () => this.instance
        .post<T>(url, data, this.getAxiosConfig())
        .then((response) => response.data)
        .catch(this.handleUnauthorizedError),
      options?.retryAttempts,
      options?.retryDelay
    );
  }

  static async put<T = any>(
    url: string,
    data?: any,
    options?: HydraApiOptions
  ) {
    await this.validateOptions(options);

    return this.instance
      .put<T>(url, data, this.getAxiosConfig())
      .then((response) => response.data)
      .catch(this.handleUnauthorizedError);
  }

  static async patch<T = any>(
    url: string,
    data?: any,
    options?: HydraApiOptions
  ) {
    await this.validateOptions(options);

    return this.instance
      .patch<T>(url, data, this.getAxiosConfig())
      .then((response) => response.data)
      .catch(this.handleUnauthorizedError);
  }

  static async delete<T = any>(url: string, options?: HydraApiOptions) {
    await this.validateOptions(options);

    return this.instance
      .delete<T>(url, this.getAxiosConfig())
      .then((response) => response.data)
      .catch(this.handleUnauthorizedError);
  }
}
