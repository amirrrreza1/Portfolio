import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";

export interface PublicMediaReader {
  read(storageKey: string): Promise<Uint8Array>;
}

export interface PublicMediaReaderConfig {
  readonly endpoint: string;
  readonly region: string;
  readonly bucket: string;
  readonly accessKeyId: string;
  readonly secretAccessKey: string;
  readonly forcePathStyle: boolean;
}

/** Private-bucket reader. Object keys and credentials never enter public DTOs. */
export function createPublicMediaReader(
  config: PublicMediaReaderConfig
): PublicMediaReader {
  const client = new S3Client({
    endpoint: config.endpoint,
    region: config.region,
    forcePathStyle: config.forcePathStyle,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });

  return {
    async read(storageKey) {
      assertStorageKey(storageKey);
      const response = await client.send(
        new GetObjectCommand({ Bucket: config.bucket, Key: storageKey })
      );
      if (response.Body === undefined) {
        throw new Error("The media object response did not contain a body.");
      }
      return response.Body.transformToByteArray();
    },
  };
}

function assertStorageKey(value: string): void {
  if (!/^media\/[0-9a-f-]{36}\.(?:pdf|jpg|png|webp)$/i.test(value)) {
    throw new Error("The database contains an invalid media storage key.");
  }
}
