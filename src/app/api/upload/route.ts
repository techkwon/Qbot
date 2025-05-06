import { createServerClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { v4 as uuidv4 } from 'uuid';

// Allowed image MIME types
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
const MAX_FILE_SIZE_MB = 5;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;
const BUCKET_NAME = 'chat_images'; // Ensure this bucket exists in Supabase Storage

export async function POST(request: Request) {
    const cookieStore = cookies();
    const supabase = createServerClient(cookieStore);

    // 1. User Authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
        console.error('Upload API - Authentication error:', authError);
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    // Optionally, add role verification if only students should upload

    // 2. Get File from FormData
    let file: File | null = null;
    try {
        const formData = await request.formData();
        const fileEntry = formData.get('file'); // Client must send the file with the key 'file'

        if (!fileEntry) {
            return NextResponse.json({ error: 'No file provided in the request.' }, { status: 400 });
        }
        // Check if it's a File object
        if (!(fileEntry instanceof File)) {
             return NextResponse.json({ error: 'Invalid file data.' }, { status: 400 });
        }
        file = fileEntry;

    } catch (error) {
        console.error('Upload API - Error parsing FormData:', error);
        return NextResponse.json({ error: 'Invalid request format.' }, { status: 400 });
    }

    // 3. Validate File Type and Size
    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
        console.warn(`Upload API - Disallowed file type: ${file.type}`);
        return NextResponse.json({ error: `Invalid file type. Allowed types: ${ALLOWED_IMAGE_TYPES.join(', ')}` }, { status: 400 });
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
        console.warn(`Upload API - File size exceeds limit: ${file.size} bytes`);
        return NextResponse.json({ error: `File size exceeds the limit of ${MAX_FILE_SIZE_MB} MB.` }, { status: 400 });
    }

    // 4. Upload to Supabase Storage
    try {
        const fileExtension = file.name.split('.').pop() || 'unknown';
        // Create a unique path: user_uploads/<user_id>/<uuid>.<extension>
        const filePath = `user_uploads/${user.id}/${uuidv4()}.${fileExtension}`;

        console.log(`Upload API - Attempting to upload to: ${filePath}`);

        const { data: uploadData, error: uploadError } = await supabase.storage
            .from(BUCKET_NAME)
            .upload(filePath, file, {
                // cacheControl: '3600', // Optional: Cache control
                upsert: false, // Don't overwrite existing files (though UUID makes collisions unlikely)
            });

        if (uploadError) {
            console.error('Upload API - Supabase storage upload error:', uploadError);
            throw uploadError; // Throw to be caught by the outer try-catch
        }

        if (!uploadData?.path) {
             console.error('Upload API - Upload succeeded but no path returned');
             throw new Error('File upload succeeded but failed to get the path.');
        }

        console.log(`Upload API - File uploaded successfully: ${uploadData.path}`);

        // 5. Get Public URL
        const { data: urlData } = supabase.storage
            .from(BUCKET_NAME)
            .getPublicUrl(uploadData.path);

        if (!urlData?.publicUrl) {
            console.error(`Upload API - Failed to get public URL for path: ${uploadData.path}`);
            // Consider returning the path anyway or a specific error
            throw new Error('Failed to retrieve public URL after upload.');
        }

        console.log(`Upload API - Public URL retrieved: ${urlData.publicUrl}`);

        // 6. Return the Public URL
        return NextResponse.json({ imageUrl: urlData.publicUrl }, { status: 200 });

    } catch (error: any) {
        console.error('Upload API - Upload or URL retrieval failed:', error);
        // Provide a generic error message to the client
        return NextResponse.json({ error: `Failed to upload image: ${error.message || 'Unknown error'}` }, { status: 500 });
    }
}

// Basic OPTIONS handler
export async function OPTIONS() {
    return NextResponse.json({}, { status: 200 });
}
