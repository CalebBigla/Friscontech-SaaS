# Phase F: Cloudinary Integration Plan

## Overview
Integrate Cloudinary for image uploads (product images, onboarding documents).

## Current State
- Product images: stored as URL strings in `image_url` field
- Onboarding files: stored as URLs in `onboarding_files.file_url`
- No actual file upload mechanism yet

## Cloudinary Setup

### 1. Create Cloudinary Account
1. Sign up at https://cloudinary.com (free tier: 25GB storage, 25GB bandwidth/month)
2. Get credentials from Dashboard:
   - Cloud name
   - API Key
   - API Secret

### 2. Environment Variables

Add to `.env`:
```bash
VITE_CLOUDINARY_CLOUD_NAME=your_cloud_name
VITE_CLOUDINARY_UPLOAD_PRESET=unsigned_preset_name
```

Add to `.env.example`:
```bash
# Cloudinary (Image/File Uploads)
VITE_CLOUDINARY_CLOUD_NAME=
VITE_CLOUDINARY_UPLOAD_PRESET=
```

### 3. Create Upload Preset in Cloudinary
1. Go to Settings → Upload
2. Click "Add upload preset"
3. Configure:
   - **Preset name**: e.g., `salesflow_unsigned`
   - **Signing Mode**: `Unsigned` (for client-side uploads)
   - **Folder**: `salesflow` (organizes uploads)
   - **Access mode**: `Public`
   - **Allowed formats**: jpg, png, jpeg, pdf, doc, docx
   - **Max file size**: 10 MB

## Implementation

### Files to Create

#### 1. `src/lib/cloudinary.ts`
Upload utility functions:
```typescript
export const uploadImage = async (file: File): Promise<string>
export const uploadDocument = async (file: File): Promise<string>
export const deleteImage = async (publicId: string): Promise<void>
```

#### 2. `src/components/ui/image-upload.tsx`
Reusable image upload component with preview

#### 3. `src/components/ui/file-upload.tsx`
Document upload component for onboarding

### Components to Update

#### Product Images
- `src/components/products/add-product-dialog.tsx`
  - Add image upload field
  - Upload to Cloudinary before saving product

#### Onboarding Documents
- `src/components/onboarding/onboarding-form-page.tsx`
  - Upload ID card, photo, address proof
  - Store URLs in `onboarding_files` table

## Upload Flow

```
User selects file
  → Validate (size, type)
  → Upload to Cloudinary
  → Get secure URL
  → Save URL to Supabase
  → Display image/file
```

## Security Considerations

1. **Unsigned uploads**: Safe for public uploads with preset constraints
2. **File validation**: Check size and type before upload
3. **Folder structure**: Organize by tenant/entity type
4. **URL transformation**: Use Cloudinary transformations for thumbnails

## Folder Structure in Cloudinary

```
salesflow/
  ├── products/
  │   └── {tenantId}/{productId}.jpg
  ├── onboarding/
  │   └── {tenantId}/{onboardingId}/
  │       ├── id_card.jpg
  │       ├── photo.jpg
  │       └── address_proof.pdf
  └── users/
      └── {tenantId}/{userId}/profile.jpg
```

## Next Steps

1. ✅ Create Cloudinary account
2. ✅ Get credentials and add to `.env`
3. ✅ Create unsigned upload preset
4. Create `src/lib/cloudinary.ts`
5. Create upload components
6. Update product form with image upload
7. Update onboarding forms with document upload
8. Test uploads end-to-end

## Estimated Time
- Setup: 30 minutes
- Implementation: 2-3 hours
- Testing: 1 hour
- **Total: 3-4 hours**

## Alternative: Skip Cloudinary for MVP

If you want to deploy faster:
- Keep image URLs as text inputs (users paste URLs)
- Add Cloudinary later as an enhancement
- Focus on core business logic first

**Recommendation**: Skip for now, add in Phase G (enhancements) after deployment.
