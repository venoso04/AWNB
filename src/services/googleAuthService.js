const { OAuth2Client } = require("google-auth-library");

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

/**
 * Verifies a Google ID token sent from the mobile app and returns
 * the decoded payload (sub, email, name, picture, email_verified).
 *
 * Throws if the token is invalid, expired, or its audience doesn't
 * match our configured GOOGLE_CLIENT_ID.
 *
 * @param {string} idToken - The raw ID token from Google Sign-In on the client
 * @returns {Promise<{googleId: string, email: string, name: string, picture: string, emailVerified: boolean}>}
 */
const verifyGoogleToken = async (idToken) => {
  if (!idToken) {
    throw new Error("Google ID token is required");
  }

  const ticket = await client.verifyIdToken({
    idToken,
    audience: process.env.GOOGLE_CLIENT_ID,
  });

  const payload = ticket.getPayload();

  if (!payload) {
    throw new Error("Invalid Google token payload");
  }

  if (!payload.email) {
    throw new Error("Google account has no email address");
  }

  return {
    googleId: payload.sub,
    email: payload.email.toLowerCase(),
    name: payload.name || payload.email.split("@")[0],
    picture: payload.picture || null,
    emailVerified: payload.email_verified === true,
  };
};

module.exports = { verifyGoogleToken };
