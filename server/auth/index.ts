export { AuthError, type AuthErrorCode } from "./errors.js";
export {
  IntegrationCredentialService,
  type IntegrationCredentialDto,
  type IntegrationCredentialServiceOptions,
  type IssuedIntegrationCredential,
} from "./integration-credential.js";
export { hashPassword, verifyPassword } from "./password.js";
export {
  SetupChallengeService,
  type IssuedSetupChallenge,
} from "./setup-challenge.js";
export {
  LocalAuthService,
  type AuthenticatedSession,
  type IssuedAuthSession,
  type LocalAuthServiceOptions,
} from "./service.js";
