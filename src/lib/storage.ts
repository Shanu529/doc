import { S3Client, HeadObjectCommand, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
/** Provider-neutral interface: swap R2 for S3/GCS without touching routes. */
export interface ObjectStorage {
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<Buffer>;
  signedGetUrl(key: string, filename: string, seconds?: number, inlineMime?: string): Promise<string>;
  remove(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
}
class R2Storage implements ObjectStorage {
  private c = new S3Client({ region: "auto", endpoint: process.env.R2_ENDPOINT || `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`, forcePathStyle: !!process.env.R2_ENDPOINT, credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID!, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY! } });
  private b = process.env.R2_BUCKET!;
  async put(Key: string, Body: Buffer, ContentType: string) { await this.c.send(new PutObjectCommand({ Bucket: this.b, Key, Body, ContentType })); }
  async get(Key: string) { const r = await this.c.send(new GetObjectCommand({ Bucket: this.b, Key })); return Buffer.from(await r.Body!.transformToByteArray()); }
  signedGetUrl(Key: string, filename: string, seconds = 60, inlineMime?: string) {
    return getSignedUrl(this.c, new GetObjectCommand({ Bucket: this.b, Key,
      ResponseContentDisposition: `${inlineMime ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(filename)}`, ...(inlineMime ? { ResponseContentType: inlineMime } : {}) }), { expiresIn: seconds });
  }
  async exists(Key: string) { try { await this.c.send(new HeadObjectCommand({ Bucket: this.b, Key })); return true; } catch (e: any) { if (e?.$metadata?.httpStatusCode === 404 || e?.name === "NotFound") return false; throw e; } }
  async remove(Key: string) { await this.c.send(new DeleteObjectCommand({ Bucket: this.b, Key })); }
}
export const storage: ObjectStorage = new R2Storage();
