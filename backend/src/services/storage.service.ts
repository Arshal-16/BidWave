import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { env } from '../config/env';
import { logger } from '../config/logger';

export class StorageService {
  private s3Client: S3Client | null = null;

  constructor() {
    if (env.S3_ENDPOINT && env.S3_ACCESS_KEY_ID && env.S3_SECRET_ACCESS_KEY) {
      this.s3Client = new S3Client({
        region: 'auto',
        endpoint: env.S3_ENDPOINT,
        credentials: {
          accessKeyId: env.S3_ACCESS_KEY_ID,
          secretAccessKey: env.S3_SECRET_ACCESS_KEY,
        },
      });
    }
  }

  async generateUploadUrl(filename: string, contentType: string) {
    const key = `uploads/${Date.now()}-${filename.replace(/[^a-zA-Z0-9.-]/g, '_')}`;

    if (!this.s3Client) {
      // Return a simulated URL when S3 is not configured
      return {
        uploadUrl: `http://localhost:4000/api/v1/mock-upload/${key}`,
        publicUrl: `https://images.unsplash.com/photo-1526170375885-4d8ecf77b99f?auto=format&fit=crop&w=1200&q=80`,
        key,
      };
    }

    try {
      const command = new PutObjectCommand({
        Bucket: env.S3_BUCKET,
        Key: key,
        ContentType: contentType,
      });

      const uploadUrl = await getSignedUrl(this.s3Client, command, { expiresIn: 3600 });
      const publicUrl = `${env.S3_ENDPOINT}/${env.S3_BUCKET}/${key}`;

      return { uploadUrl, publicUrl, key };
    } catch (err) {
      logger.error({ err, key }, 'Failed to generate S3 presigned URL');
      throw err;
    }
  }
}

export const storageService = new StorageService();
