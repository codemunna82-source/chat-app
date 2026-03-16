import { Response } from 'express';
import AWS from 'aws-sdk';
import { v4 as uuidv4 } from 'uuid';

// Configure AWS with environment variables (or defaults for graceful local dev)
const s3 = new AWS.S3({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID || 'dummy_key',
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || 'dummy_secret',
  region: process.env.AWS_REGION || 'us-east-1',
  signatureVersion: 'v4',
});

// @desc    Generate a secure pre-signed URL for direct S3 client uploads
// @route   GET /api/upload/presignedUrl
// @access  Private
// @scale   10M CCU Critical Strategy: Offloads all binary data upload bandwidth entirely away from Node.js
export const getPresignedUrl = async (req: any, res: Response): Promise<void> => {
  try {
    const { fileType, extension } = req.query;

    if (!fileType || !extension) {
      res.status(400).json({ message: 'fileType and extension are required query parameters' });
      return;
    }

    const bucketName = process.env.AWS_S3_BUCKET_NAME || 'chat-app-media-bucket';
    // Generate a secure unique UUID to prevent file overriding attacks
    const key = `uploads/${req.user._id}/${uuidv4()}.${extension}`;

    const params = {
      Bucket: bucketName,
      Key: key,
      Expires: 300, // URL expires in 5 minutes
      ContentType: fileType,
      ACL: 'public-read', // Deprecated in modern S3, but often used in older tutorials. Best practice is private bucket with CloudFront.
    };

    // Note: If AWS env vars aren't setup, this will return a URL, but the client upload will fail.
    // That is expected until the infrastructure team provides the actual AWS keys.
    const uploadUrl = s3.getSignedUrl('putObject', params);

    res.status(200).json({
      uploadUrl,
      key,
    });
  } catch (error: any) {
    console.error('Presigned URL Error:', error);
    res.status(500).json({ message: 'Error generating upload URL', error: error.message });
  }
};
