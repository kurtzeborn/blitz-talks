import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { getAuthUser, isGamekeeper, formatDisplayName } from '../shared/auth.js';

app.http('getMe', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'me',
  handler: async (request: HttpRequest, _context: InvocationContext): Promise<HttpResponseInit> => {
    const user = getAuthUser(request);
    if (!user) {
      return {
        status: 200,
        jsonBody: { isAuthenticated: false, isGamekeeper: false },
      };
    }

    const keeperStatus = await isGamekeeper(user.userDetails);
    const suggestedName = user.displayName ? formatDisplayName(user.displayName) : undefined;

    return {
      status: 200,
      jsonBody: {
        isAuthenticated: true,
        user: {
          userId: user.userId,
          userDetails: user.userDetails,
          identityProvider: user.identityProvider,
          userRoles: user.userRoles,
        },
        isGamekeeper: keeperStatus,
        suggestedName,
      },
    };
  },
});
