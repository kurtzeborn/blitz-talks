import { HttpRequest } from '@azure/functions';
import { gamekeepersTable } from './storage.js';

export interface AuthUser {
  userId: string;
  userDetails: string; // email
  identityProvider: string;
  userRoles: string[];
  displayName?: string;
}

export function getAuthUser(request: HttpRequest): AuthUser | null {
  const clientPrincipal = request.headers.get('x-ms-client-principal');
  if (!clientPrincipal) {
    return null;
  }

  try {
    const decoded = Buffer.from(clientPrincipal, 'base64').toString('utf8');
    const principal = JSON.parse(decoded);

    // Extract display name from claims if available
    let displayName: string | undefined;
    if (principal.claims) {
      const nameClaim = principal.claims.find((c: { typ: string; val: string }) =>
        c.typ === 'name' || c.typ === 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name'
      );
      if (nameClaim) {
        displayName = nameClaim.val;
      }
    }

    return {
      userId: principal.userId,
      userDetails: principal.userDetails,
      identityProvider: principal.identityProvider,
      userRoles: principal.userRoles || [],
      displayName,
    };
  } catch {
    return null;
  }
}

/**
 * Format a full name as "First L." (first name + last initial).
 */
export function formatDisplayName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length <= 1) return parts[0] || '';
  const firstName = parts[0];
  const lastInitial = parts[parts.length - 1][0];
  return `${firstName} ${lastInitial}.`;
}

export async function isGamekeeper(email: string): Promise<boolean> {
  if (!email) return false;
  try {
    const entity = await gamekeepersTable.getEntity('gamekeeper', email.toLowerCase());
    return !!entity;
  } catch (error: any) {
    if (error.statusCode === 404) return false;
    throw error;
  }
}

export function requireAuth(request: HttpRequest): AuthUser {
  const user = getAuthUser(request);
  if (!user) {
    throw new AuthError('Authentication required', 401);
  }
  return user;
}

export async function requireGamekeeper(request: HttpRequest): Promise<AuthUser> {
  const user = requireAuth(request);
  const keeper = await isGamekeeper(user.userDetails);
  if (!keeper) {
    throw new AuthError('Gamekeeper access required', 403);
  }
  return user;
}

export class AuthError extends Error {
  constructor(message: string, public statusCode: number) {
    super(message);
    this.name = 'AuthError';
  }
}
