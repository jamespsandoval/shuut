import {
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from "@simplewebauthn/server";

export const webauthnVerifier = {
  verifyRegistration: verifyRegistrationResponse,
  verifyAuthentication: verifyAuthenticationResponse,
};