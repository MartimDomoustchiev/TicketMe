import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";

const localStorageDir = path.join(process.cwd(), ".data", "storage", "tickets");

export function ticketStorageKey(id: string): string {
  if (!/^[A-Za-z0-9_-]{1,128}$/u.test(id)) {
    throw new Error("INVALID_TICKET_STORAGE_ID");
  }
  return `tickets/${id}.pdf`;
}

function hasS3Config(): boolean {
  return Boolean(
    process.env.S3_BUCKET &&
      process.env.S3_REGION &&
      process.env.S3_ACCESS_KEY_ID &&
      process.env.S3_SECRET_ACCESS_KEY,
  );
}

function ensureStorageConfigured(): void {
  if (process.env.NODE_ENV === "production" && !hasS3Config()) {
    throw new Error(
      "Cloud ticket storage is not configured. Set the S3-compatible storage variables.",
    );
  }
}

function s3Client(): S3Client {
  return new S3Client({
    region: process.env.S3_REGION,
    endpoint: process.env.S3_ENDPOINT || undefined,
    forcePathStyle: Boolean(process.env.S3_ENDPOINT),
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY_ID!,
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY!,
    },
  });
}

export async function storeTicketPdf(input: {
  id: string;
  pdf: Uint8Array;
  baseUrl: string;
}): Promise<{ storageKey: string; storageUrl: string }> {
  const storageKey = ticketStorageKey(input.id);
  ensureStorageConfigured();

  if (hasS3Config()) {
    await s3Client().send(
      new PutObjectCommand({
        Bucket: process.env.S3_BUCKET!,
        Key: storageKey,
        Body: input.pdf,
        ContentType: "application/pdf",
      }),
    );

    return {
      storageKey,
      storageUrl: `${input.baseUrl}/api/tickets/${input.id}/download`,
    };
  }

  await mkdir(localStorageDir, { recursive: true });
  await writeFile(path.join(localStorageDir, `${input.id}.pdf`), input.pdf);

  return {
    storageKey,
    storageUrl: `${input.baseUrl}/api/tickets/${input.id}/download`,
  };
}

export async function readTicketPdf(input: {
  id: string;
  storageKey: string;
}): Promise<Uint8Array | null> {
  // The authenticated ticket ID is the storage namespace boundary. Never let
  // a corrupted or manually edited database row select another ticket object.
  let expectedStorageKey: string;
  try {
    expectedStorageKey = ticketStorageKey(input.id);
  } catch {
    return null;
  }
  if (input.storageKey !== expectedStorageKey) {
    return null;
  }

  ensureStorageConfigured();

  if (hasS3Config()) {
    try {
      const response = await s3Client().send(
        new GetObjectCommand({
          Bucket: process.env.S3_BUCKET!,
          Key: input.storageKey,
        }),
      );

      if (!response.Body) {
        return null;
      }

      return await response.Body.transformToByteArray();
    } catch (error) {
      const name = (error as { name?: string }).name;
      if (name === "NoSuchKey" || name === "NotFound") {
        return null;
      }
      throw error;
    }
  }

  try {
    return await readFile(path.join(localStorageDir, `${input.id}.pdf`));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }
    throw error;
  }
}
