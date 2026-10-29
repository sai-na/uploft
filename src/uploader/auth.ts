/**
 * Google sign-in for the uploader
 * Uses launchWebAuthFlow so people can pick whichever Google account owns
 * their Drive, not just the one Chrome is signed in with.
 */

import { GOOGLE_CLIENT_ID } from './config.js';

export const DRIVE_FILE_SCOPE = 'https://www.googleapis.com/auth/drive.file';

const TOKEN_KEY = 'driveToken';
const ACCOUNT_KEY = 'driveAccount';

/** Refresh tokens this long before Google expires them (ms) */
const EXPIRY_MARGIN = 5 * 60 * 1000;

export interface DriveAccount {
  email: string;
  name: string;
  photoLink?: string;
}

interface StoredToken {
  token: string;
  expiresAt: number;
}

export class AuthRequiredError extends Error {
  constructor(message = 'Sign in to Google Drive to continue') {
    super(message);
    this.name = 'AuthRequiredError';
  }
}

export class GoogleAuth {
  private pending: Promise<string> | null = null;

  /**
   * Current access token, refreshed silently when it's about to expire
   */
  public async getToken(): Promise<string> {
    const stored = (await chrome.storage.session.get(TOKEN_KEY))[TOKEN_KEY] as
      | StoredToken
      | undefined;
    if (stored && stored.expiresAt - EXPIRY_MARGIN > Date.now()) {
      return stored.token;
    }
    this.pending ??= this.authorize(false).finally(() => {
      this.pending = null;
    });
    return this.pending;
  }

  /**
   * Ask the user to choose an account and allow Drive access
   */
  public signIn(): Promise<string> {
    return this.authorize(true);
  }

  public async signOut(): Promise<void> {
    const stored = (await chrome.storage.session.get(TOKEN_KEY))[TOKEN_KEY] as
      | StoredToken
      | undefined;
    await chrome.storage.session.remove(TOKEN_KEY);
    await chrome.storage.local.remove(ACCOUNT_KEY);
    if (stored) {
      void fetch(
        `https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(stored.token)}`,
        { method: 'POST' }
      ).catch(() => undefined);
    }
  }

  /** Drop a token Google rejected, so the next call fetches a new one */
  public async invalidate(token: string): Promise<void> {
    const stored = (await chrome.storage.session.get(TOKEN_KEY))[TOKEN_KEY] as
      | StoredToken
      | undefined;
    if (stored?.token === token) {
      await chrome.storage.session.remove(TOKEN_KEY);
    }
  }

  public async getAccount(): Promise<DriveAccount | null> {
    const result = await chrome.storage.local.get(ACCOUNT_KEY);
    return (result[ACCOUNT_KEY] as DriveAccount | undefined) ?? null;
  }

  public async setAccount(account: DriveAccount): Promise<void> {
    await chrome.storage.local.set({ [ACCOUNT_KEY]: account });
  }

  private async authorize(interactive: boolean): Promise<string> {
    const account = await this.getAccount();
    if (!interactive && !account) {
      throw new AuthRequiredError();
    }

    const params = new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      response_type: 'token',
      redirect_uri: chrome.identity.getRedirectURL(),
      scope: DRIVE_FILE_SCOPE,
      include_granted_scopes: 'true',
      prompt: interactive ? 'select_account' : 'none',
    });
    if (account) {
      params.set('login_hint', account.email);
    }

    let redirect: string | undefined;
    try {
      // Google's page redirects with script, so silent sign-in must wait past first load
      const options = {
        url: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`,
        interactive,
        abortOnLoadForNonInteractive: false,
        timeoutMsForNonInteractive: 15000,
      } as chrome.identity.WebAuthFlowOptions;
      redirect = await chrome.identity.launchWebAuthFlow(options);
    } catch (error) {
      throw new AuthRequiredError(
        interactive ? (error as Error).message : undefined
      );
    }
    if (!redirect) {
      throw new AuthRequiredError();
    }

    const result = new URLSearchParams(new URL(redirect).hash.slice(1));
    const token = result.get('access_token');
    if (!token) {
      throw new AuthRequiredError(
        result.get('error') === 'access_denied'
          ? 'Google sign-in was cancelled'
          : undefined
      );
    }
    if (!(result.get('scope') ?? '').split(' ').includes(DRIVE_FILE_SCOPE)) {
      throw new AuthRequiredError(
        'Allow access to Google Drive files to upload with Upload Tracker'
      );
    }

    const expiresIn = Number(result.get('expires_in') ?? '3600');
    await chrome.storage.session.set({
      [TOKEN_KEY]: {
        token,
        expiresAt: Date.now() + expiresIn * 1000,
      } satisfies StoredToken,
    });
    return token;
  }
}
