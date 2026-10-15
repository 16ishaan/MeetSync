import { supabase } from './supabase';

const RECORDINGS_BUCKET = 'meeting-recordings';

export async function saveRecording({ blob, durationMs, userId }) {
  if (!supabase) {
    throw new Error('Connect Supabase before saving recordings.');
  }

  if (!userId) {
    throw new Error('Sign in before saving a recording.');
  }

  const recordingId = crypto.randomUUID();
  const extension = blob.type.includes('mp4') ? 'mp4' : 'webm';
  const storagePath = `${userId}/${recordingId}.${extension}`;

  const { error: uploadError } = await supabase.storage
    .from(RECORDINGS_BUCKET)
    .upload(storagePath, blob, {
      contentType: blob.type || 'audio/webm',
      upsert: false,
    });

  if (uploadError) {
    if (uploadError.message?.toLowerCase().includes('bucket not found')) {
      throw new Error(
        'Cloud storage is not set up yet. Run supabase/recordings.sql in the Supabase SQL editor.',
      );
    }
    throw uploadError;
  }

  const { data, error: insertError } = await supabase
    .from('recordings')
    .insert({
      id: recordingId,
      user_id: userId,
      storage_path: storagePath,
      mime_type: blob.type || 'audio/webm',
      duration_ms: Math.round(durationMs),
    })
    .select('id, storage_path, created_at')
    .single();

  if (insertError) {
    await supabase.storage.from(RECORDINGS_BUCKET).remove([storagePath]);
    throw insertError;
  }

  const { data: signedUrlData, error: signedUrlError } = await supabase.storage
    .from(RECORDINGS_BUCKET)
    .createSignedUrl(storagePath, 60 * 60);

  if (signedUrlError) {
    throw signedUrlError;
  }

  return { ...data, signedUrl: signedUrlData.signedUrl };
}

export async function deleteRecording({ recordingId, storagePath, userId }) {
  if (!supabase || !userId || !recordingId || !storagePath) return;

  const { error: rowError } = await supabase
    .from('recordings')
    .delete()
    .eq('id', recordingId)
    .eq('user_id', userId);

  if (rowError) throw rowError;

  const { error: storageError } = await supabase.storage
    .from(RECORDINGS_BUCKET)
    .remove([storagePath]);

  if (storageError) throw storageError;
}