import { v2 as cloudinary } from "cloudinary";

// Cloudinary configuration
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME || 'dbqy4e8ez',
  api_key: process.env.CLOUDINARY_API_KEY || '629469233136264',
  api_secret: process.env.CLOUDINARY_API_SECRET || 'lP-gTaikS4uAZf_o9c7twH3Adss'
});

// Upload image to Cloudinary function (from imageUploader.js)
const uploadImageToCloud = async (fileBuffer, options = {}) => {
  try {
    console.log("📤 Starting Cloudinary upload...");
    
    // Convert buffer to base64
    const b64 = Buffer.from(fileBuffer).toString('base64');
    const dataURI = `data:${options.mimetype || 'image/jpeg'};base64,${b64}`;
    
    // Increase upload limits for Cloudinary
    const uploadOptions = {
      folder: 'linkedin-posts',
      resource_type: options.resource_type || 'auto',
      chunk_size: 7000000, // 7MB chunks
      timeout: 60000, // 60 seconds timeout
      ...options
    };
    
    console.log("🔄 Uploading to Cloudinary...");
    const result = await cloudinary.uploader.upload(dataURI, uploadOptions);
    
    console.log(`✅ Cloudinary upload successful!`);
    console.log(`🔗 URL: ${result.secure_url}`);
    console.log(`📊 Size: ${result.bytes} bytes (${(result.bytes / (1024*1024)).toFixed(2)} MB)`);
    
    return {
      url: result.secure_url,
      publicId: result.public_id,
      format: result.format,
      width: result.width,
      height: result.height,
      bytes: result.bytes,
      duration: result.duration,
      resource_type: result.resource_type
    };
  } catch (error) {
    console.error('❌ Cloudinary upload error:', error.message);
    throw new Error(`Failed to upload to Cloudinary: ${error.message}`);
  }
};

// Export both cloudinary instance and upload function
export { uploadImageToCloud };
export default cloudinary;