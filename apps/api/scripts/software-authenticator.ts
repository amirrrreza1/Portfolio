import {
  createHash,
  createSign,
  generateKeyPairSync,
  randomBytes,
  type KeyObject,
} from "node:crypto";

/**
 * A minimal software WebAuthn authenticator, for tests and the live drill.
 *
 * It exists so the passkey path can be verified against **real signatures**
 * rather than against a stubbed verifier. A mocked "verified: true" proves the
 * code calls a library; it proves nothing about whether a forged assertion,
 * one from the wrong origin, or a replayed one would be refused — which is the
 * entire security property.
 *
 * ES256 (P-256) only. That is the algorithm the platform authenticators this
 * product targets use, and supporting one algorithm well is better than
 * supporting three approximately.
 */

export interface SoftwareCredential {
  readonly credentialId: string;
  /** COSE_Key encoding of the public key, as an authenticator would store it. */
  readonly cosePublicKey: Buffer;
  readonly privateKey: KeyObject;
}

export function createSoftwareCredential(): SoftwareCredential {
  const { publicKey, privateKey } = generateKeyPairSync("ec", {
    namedCurve: "prime256v1",
  });
  const raw = publicKey.export({ format: "jwk" });
  const x = Buffer.from(String(raw.x), "base64url");
  const y = Buffer.from(String(raw.y), "base64url");
  return {
    credentialId: randomBytes(32).toString("base64url"),
    cosePublicKey: encodeCoseEc2(x, y),
    privateKey,
  };
}

export interface AssertionOptions {
  readonly credential: SoftwareCredential;
  readonly challenge: string;
  readonly origin: string;
  readonly rpId: string;
  readonly counter: number;
  /** Cleared to forge an assertion no user actually approved. */
  readonly userVerified?: boolean;
}

export interface AssertionJson {
  readonly id: string;
  readonly rawId: string;
  readonly type: "public-key";
  readonly response: {
    readonly clientDataJSON: string;
    readonly authenticatorData: string;
    readonly signature: string;
    readonly userHandle: string | null;
  };
  readonly clientExtensionResults: Record<string, unknown>;
}

/** Produces exactly what `navigator.credentials.get()` would hand a page. */
export function createAssertion(options: AssertionOptions): AssertionJson {
  const clientData = Buffer.from(
    JSON.stringify({
      type: "webauthn.get",
      challenge: options.challenge,
      origin: options.origin,
      crossOrigin: false,
    }),
    "utf8"
  );

  const flags = 0x01 | (options.userVerified === false ? 0 : 0x04);
  const authenticatorData = Buffer.concat([
    createHash("sha256").update(options.rpId, "utf8").digest(),
    Buffer.from([flags]),
    counterBytes(options.counter),
  ]);

  const signed = Buffer.concat([
    authenticatorData,
    createHash("sha256").update(clientData).digest(),
  ]);
  const signature = createSign("SHA256")
    .update(signed)
    .sign(options.credential.privateKey);

  return {
    id: options.credential.credentialId,
    rawId: options.credential.credentialId,
    type: "public-key",
    response: {
      clientDataJSON: clientData.toString("base64url"),
      authenticatorData: authenticatorData.toString("base64url"),
      signature: signature.toString("base64url"),
      userHandle: null,
    },
    clientExtensionResults: {},
  };
}

function counterBytes(counter: number): Buffer {
  const bytes = Buffer.alloc(4);
  bytes.writeUInt32BE(counter, 0);
  return bytes;
}

/**
 * COSE_Key for an EC2 P-256 public key.
 *
 * Hand-encoded rather than pulled from a CBOR library because the shape is
 * fixed and five entries long: a canonical map of kty=2, alg=-7, crv=1, and
 * the two 32-byte coordinates. Writing it out makes the encoding auditable
 * next to the thing it encodes.
 */
function encodeCoseEc2(x: Buffer, y: Buffer): Buffer {
  return Buffer.concat([
    Buffer.from([0xa5]), // map of 5 pairs
    Buffer.from([0x01, 0x02]), // 1 (kty): 2 (EC2)
    Buffer.from([0x03, 0x26]), // 3 (alg): -7 (ES256)
    Buffer.from([0x20, 0x01]), // -1 (crv): 1 (P-256)
    Buffer.from([0x21, 0x58, 0x20]), // -2 (x): byte string of 32
    pad32(x),
    Buffer.from([0x22, 0x58, 0x20]), // -3 (y): byte string of 32
    pad32(y),
  ]);
}

function pad32(value: Buffer): Buffer {
  if (value.length === 32) return value;
  if (value.length > 32) return value.subarray(value.length - 32);
  return Buffer.concat([Buffer.alloc(32 - value.length), value]);
}

export interface RegistrationOptions {
  readonly credential: SoftwareCredential;
  readonly challenge: string;
  readonly origin: string;
  readonly rpId: string;
}

export interface RegistrationJson {
  readonly id: string;
  readonly rawId: string;
  readonly type: "public-key";
  readonly response: {
    readonly clientDataJSON: string;
    readonly attestationObject: string;
    readonly transports: string[];
  };
  readonly clientExtensionResults: Record<string, unknown>;
}

/**
 * What `navigator.credentials.create()` would hand a page, with `none`
 * attestation.
 *
 * `none` is deliberate rather than lazy: this product does not care which
 * manufacturer made the authenticator, and asking for attestation would
 * collect a hardware identifier it has no use for while giving the owner a
 * consent prompt to dismiss.
 */
export function createRegistration(
  options: RegistrationOptions
): RegistrationJson {
  const clientData = Buffer.from(
    JSON.stringify({
      type: "webauthn.create",
      challenge: options.challenge,
      origin: options.origin,
      crossOrigin: false,
    }),
    "utf8"
  );

  const credentialId = Buffer.from(
    options.credential.credentialId,
    "base64url"
  );
  const attestedCredentialData = Buffer.concat([
    Buffer.alloc(16), // AAGUID, all zeroes for a self-attested software key
    twoByteLength(credentialId.length),
    credentialId,
    options.credential.cosePublicKey,
  ]);
  const authData = Buffer.concat([
    createHash("sha256").update(options.rpId, "utf8").digest(),
    Buffer.from([0x01 | 0x04 | 0x40]), // user present, user verified, attested data
    Buffer.alloc(4), // sign counter starts at zero
    attestedCredentialData,
  ]);

  return {
    id: options.credential.credentialId,
    rawId: options.credential.credentialId,
    type: "public-key",
    response: {
      clientDataJSON: clientData.toString("base64url"),
      attestationObject: encodeNoneAttestation(authData).toString("base64url"),
      transports: ["internal"],
    },
    clientExtensionResults: {},
  };
}

function twoByteLength(value: number): Buffer {
  const bytes = Buffer.alloc(2);
  bytes.writeUInt16BE(value, 0);
  return bytes;
}

/** CBOR `{"fmt": "none", "attStmt": {}, "authData": <bytes>}`. */
function encodeNoneAttestation(authData: Buffer): Buffer {
  return Buffer.concat([
    Buffer.from([0xa3]), // map of 3 pairs
    cborText("fmt"),
    cborText("none"),
    cborText("attStmt"),
    Buffer.from([0xa0]), // empty map
    cborText("authData"),
    cborByteString(authData),
  ]);
}

function cborText(value: string): Buffer {
  const bytes = Buffer.from(value, "utf8");
  if (bytes.length >= 24) throw new Error("Only short CBOR keys are encoded.");
  return Buffer.concat([Buffer.from([0x60 | bytes.length]), bytes]);
}

function cborByteString(value: Buffer): Buffer {
  if (value.length < 256) {
    return Buffer.concat([Buffer.from([0x58, value.length]), value]);
  }
  const header = Buffer.alloc(3);
  header.writeUInt8(0x59, 0);
  header.writeUInt16BE(value.length, 1);
  return Buffer.concat([header, value]);
}
