'use strict';

import { logVerbose } from '../logging.js?id=fc364d';
// Import auth functions needed for refresh and logout
import { refreshAccessToken  } from './auth.js?id=fc364d';

let dbx = null; // Dropbox API instance (Dropbox class)
let dbxAuth = null; // DropboxAuth instance (manages tokens)

/**
 * Initializes or updates the main Dropbox API object using the DropboxAuth instance.
 * Also triggers the initial sync check upon successful initialization.
 * @param {Dropbox.DropboxAuth | null} authInstance - The initialized DropboxAuth object, or null to de-initialize.
 */
export async function initializeDropboxApi(authInstance) {
  dbxAuth = authInstance; // Store the auth instance

  if (!authInstance) {
    logVerbose('De-initializing Dropbox API (authInstance is null).');
    dbx = null;
    return;
  }

  if (typeof Dropbox === 'undefined') {
    console.error('Dropbox SDK not loaded, cannot initialize API.');
    dbx = null; // Ensure dbx is null
    return;
  }

  // Check if we have an access token in the auth instance
  const currentAccessToken = authInstance.getAccessToken();
  if (!currentAccessToken) {
    logVerbose('Cannot initialize Dropbox API: No access token in auth instance.');
    dbx = null;
    return;
  }

  // Avoid re-initialization if the underlying access token hasn't changed
  // Note: This check might be less critical now as dbxAuth manages state,
  // but can prevent unnecessary object creation.
  if (dbx && dbx.auth.getAccessToken() === currentAccessToken) {
    logVerbose('Dropbox API appears to be initialized with the same token state.');
    return;
  }

  logVerbose('Initializing/Updating Dropbox API instance...');
  try {
    // Initialize Dropbox API with the DropboxAuth instance
    // The SDK will use this auth instance to get the access token for requests
    // and potentially handle refreshing automatically if configured,
    // but we'll add explicit refresh handling for robustness.
    dbx = new Dropbox.Dropbox({ auth: authInstance });
    logVerbose('Dropbox API initialized/updated successfully.');

    // Trigger initial sync check via the coordinator ONLY if dbx was newly created or updated
    // This prevents redundant syncs if initializeDropboxApi is called multiple times
    // without the underlying token actually changing (e.g., during refresh logic).
    // We might need a flag or compare old/new token to be more precise.
    // For now, let's assume if we reach here with a valid dbx, a sync check is warranted.
    // This assumes initializeDropboxApi is called *after* coordinator is initialized
    try {
      const { coordinateSync } = await import('../sync-coordinator.js');
      await coordinateSync();
    } catch (coordError) {
      console.error("Failed to trigger initial sync via coordinator:", coordError);
    }

  } catch (error) {
    console.error('Error initializing Dropbox API object:', error);
    dbx = null; // Ensure dbx is null if initialization failed
  }
}

/**
 * Returns the initialized Dropbox API instance (Dropbox class).
 * @returns {Dropbox.Dropbox | null} The Dropbox instance or null if not initialized.
 */
export function getDbxInstance() {
  // Maybe add a check here? If !dbx but dbxAuth exists and has tokens, try init?
  // For now, keep it simple.
  return dbx;
}

// --- API Call Wrapper with Refresh Logic ---

/**
 * Checks if an error object indicates an invalid/expired access token.
 * @param {any} error - The error object from a Dropbox API call.
 * @returns {boolean} True if the error is an authentication error.
 */
function isAuthError(error) {
  // Based on Dropbox SDK v10+ error structure (check documentation for specifics)
  // Errors often have a `status` (HTTP) and an `error` field (Dropbox-specific JSON or string)
  const status = error?.status;
  const errorData = error?.error;

  // Check for HTTP 401 Unauthorized
  if (status === 401) return true;

  // Check for specific Dropbox error tags related to auth/token issues
  if (typeof errorData === 'object' && errorData?.['.tag']?.includes('auth')) return true;
  if (typeof errorData === 'object' && errorData?.error?.['.tag'] === 'expired_access_token') return true;
  if (typeof errorData === 'object' && errorData?.error?.['.tag'] === 'invalid_access_token') return true;

  // Check for older/string-based error summaries (less reliable)
  const errorSummary = errorData?.error_summary || (typeof errorData === 'string' ? errorData : '');
  if (errorSummary.includes('invalid_access_token') || errorSummary.includes('expired_access_token')) return true;

  return false;
}


/**
 * Wraps a Dropbox API call to handle automatic token refresh on auth errors.
 * @template T
 * @param {() => Promise<T>} apiCallFunction - A function that performs the Dropbox API call (e.g., () => dbx.filesListFolder({...})).
 * @param {string} operationName - A descriptive name of the operation for logging (e.g., 'filesListFolder').
 * @returns {Promise<T>} A promise that resolves with the result of the API call or rejects if refresh fails or the error is not auth-related.
 */
async function callApiWithRefresh(apiCallFunction, operationName) {
  if (!dbx || !dbxAuth) {
    console.error(`Cannot perform ${operationName}: Dropbox API or Auth not initialized.`);
    // Should we attempt re-initialization here? Might be too complex.
    // Let's assume initialization should happen beforehand.
    throw new Error('Dropbox connection not ready.');
  }

  try {
    // Attempt the API call
    logVerbose(`Executing Dropbox API call: ${operationName}`);
    return await apiCallFunction();
  } catch (error) {
    logVerbose(`API call ${operationName} failed initially. Error:`, error);

    // Check if it's an authentication error
    if (isAuthError(error)) {
      logVerbose(`Authentication error detected during ${operationName}. Attempting token refresh...`);
      try {
        // Attempt to refresh the token using the function from auth.js
        // refreshAccessToken should update dbxAuth and call initializeDropboxApi internally
        await refreshAccessToken();
        logVerbose(`Token refresh successful. Retrying API call: ${operationName}...`);

        // Retry the original API call *once*
        // The dbx instance should now be using the refreshed token via the updated dbxAuth
        return await apiCallFunction();
      } catch (refreshError) {
        console.error(`Failed to refresh token or retry ${operationName} after refresh:`, refreshError);
        // If refresh fails, refreshAccessToken should have already logged the user out.
        // Rethrow an error indicating the operation ultimately failed.
        throw new Error(`Dropbox operation '${operationName}' failed after token refresh attempt.`);
      }
    } else {
      // If it's not an auth error, just rethrow the original error
      logVerbose(`Error during ${operationName} was not an auth error. Rethrowing.`);
      throw error;
    }
  }
}

// --- End API Call Wrapper ---


/**
 * Fetches metadata for a specific file from Dropbox.
 * @param {string} filePath - The full path of the file on Dropbox (e.g., '/path/to/file.txt').
 * @returns {Promise<DropboxTypes.files.FileMetadataReference | DropboxTypes.files.FolderMetadataReference | DropboxTypes.files.DeletedMetadataReference | null>} A promise that resolves with the file metadata object, or null if an error occurs or the file doesn't exist.
 */
export async function getDropboxFileMetadata(filePath) {
  if (!dbx) {
    console.warn('Dropbox API not initialized. Cannot get metadata.');
    return null;
  }
  if (!filePath) {
    console.error('getDropboxFileMetadata called without filePath.');
    return null;
  }

  // Use the wrapper function for the API call
  try {
    const response = await callApiWithRefresh(
      () => dbx.filesGetMetadata({ path: filePath }),
      `filesGetMetadata(${filePath})`
    );
    logVerbose(`Successfully fetched metadata for ${filePath}:`, response.result);
    return response.result;
  } catch (error) {
    // Handle specific non-auth errors after the wrapper has done its job
    if (error?.error?.error_summary?.startsWith('path/not_found')) {
      logVerbose(`File ${filePath} not found on Dropbox. No metadata available.`);
    } else {
      // Log errors that persisted after potential refresh attempt
      console.error(`Final error fetching metadata for ${filePath} after potential refresh:`, error);
    }
    return null; // Return null on final errors or if not found
  }
}

/**
 * Downloads a specific file from Dropbox.
 * @param {string} filePath - The full path of the file on Dropbox (e.g., '/path/to/file.txt').
 * @returns {Promise<{success: boolean, content: string | null}>} A promise resolving with success status and content, or null content on failure/not found.
 */
export async function downloadFileFromDropbox(filePath) {
  if (!dbx) {
    console.warn('Dropbox API not initialized. Cannot download.');
    return { success: false, content: null };
  }
  if (!filePath) {
    console.error('downloadFileFromDropbox called without filePath.');
    return { success: false, content: null };
  }

  // Use the wrapper function for the API call
  try {
    const response = await callApiWithRefresh(
      () => dbx.filesDownload({ path: filePath }),
      `filesDownload(${filePath})`
    );
    logVerbose(`Successfully received download response for ${filePath}:`, response);

    const fileBlob = response.result.fileBlob;
    if (fileBlob) {
      const text = await fileBlob.text();
      logVerbose(`Read downloaded content for ${filePath} (${text.length} chars).`);
      return { success: true, content: text };
    } else {
      console.warn(`Downloaded file blob is missing for ${filePath}.`);
      return { success: false, content: null };
    }
  } catch (error) {
    // Handle specific non-auth errors after the wrapper
    if (error?.error?.error_summary?.startsWith('path/not_found')) {
      logVerbose(`File ${filePath} not found on Dropbox during download. Assuming first sync.`);
      return { success: true, content: null }; // Treat as success, file doesn't exist yet
    } else {
      console.error(`Final error downloading ${filePath} after potential refresh:`, error);
      return { success: false, content: null };
    }
  }
}


/**
 * Uploads the provided content (string or Blob) to a specific file path on Dropbox.
 * Handles API errors including authentication issues.
 * @param {string} filePath - The full path of the file on Dropbox (e.g., '/path/to/file.txt').
 * @param {string | Blob} fileContent - The string or Blob content to upload.
 * @returns {Promise<boolean>} A promise resolving with true on success, false on failure.
 */
export async function uploadFileToDropbox(filePath, fileContent) {
  if (!filePath) {
    console.error('uploadFileToDropbox called without filePath.');
    return false;
  }
  if (typeof fileContent !== 'string' && !(fileContent instanceof Blob)) {
    console.error('uploadFileToDropbox called without string or Blob content.');
    return false;
  }

  // Check online status first - Coordinator should ideally check before calling,
  // but double-check here for robustness.
  if (!navigator.onLine) {
    console.warn(`Upload attempt for ${filePath} cancelled: Application is offline.`);
    // Coordinator should have set pending flag already if needed.
    return false; // Indicate failure (cannot upload offline)
  }

  // Check online status first
  if (!navigator.onLine) {
    console.warn(`Upload attempt for ${filePath} cancelled: Application is offline.`);
    return false;
  }

  // Check if API is ready (via wrapper check)
  logVerbose(`Attempting to upload content to ${filePath} via wrapper...`);

  // Use the wrapper function for the API call
  try {
    const contentSize = typeof fileContent === 'string' ? fileContent.length : fileContent.size;
    logVerbose(`Uploading content (${contentSize} ${typeof fileContent === 'string' ? 'chars' : 'bytes'}) to ${filePath}...`);

    const response = await callApiWithRefresh(
      () => dbx.filesUpload({
        path: filePath,
        contents: fileContent,
        mode: 'overwrite', // Conflict checks assumed done by coordinator
        autorename: false,
        mute: true // Don't trigger desktop notifications from Dropbox
      }),
      `filesUpload(${filePath})`
    );

    logVerbose(`Successfully uploaded content to ${filePath} on Dropbox:`, response);
    return true; // Indicate success

  } catch (error) {
    // Log final errors after potential refresh attempt
    console.error(`Final error uploading ${filePath} after potential refresh:`, error);
    return false; // Indicate failure
  }
}


/**
 * Renames a file on Dropbox.
 * @param {string} oldPath - The current full path of the file on Dropbox.
 * @param {string} newPath - The desired new full path of the file on Dropbox.
 * @returns {Promise<boolean>} A promise that resolves with true if successful, false otherwise.
 */
export async function renameDropboxFile(oldPath, newPath) {
  if (!dbx) {
    console.warn('Dropbox API not initialized. Cannot rename file.');
    return false;
  }
  if (!oldPath || !newPath) {
    console.error('renameDropboxFile called without oldPath or newPath.');
    return false;
  }
  if (oldPath === newPath) {
    console.warn('Rename cancelled: old path and new path are the same.');
    return false; // No action taken
  }

  logVerbose(`Attempting to rename Dropbox file from "${oldPath}" to "${newPath}" via wrapper...`);

  // Use the wrapper function for the API call
  try {
    const response = await callApiWithRefresh(
      () => dbx.filesMoveV2({
        from_path: oldPath,
        to_path: newPath,
        allow_shared_folder: false,
        autorename: false, // Fail if target exists
        allow_ownership_transfer: false
      }),
      `filesMoveV2(${oldPath} -> ${newPath})`
    );
    logVerbose(`Successfully renamed file on Dropbox:`, response.result);
    return true;
  } catch (error) {
    // Handle specific non-auth errors after the wrapper
    let userMessage = `Failed to rename file on Dropbox.`;
    if (error?.error?.error_summary?.includes('to/conflict/file')) {
      userMessage = `Failed to rename: A file already exists at "${newPath}".`;
    } else if (error?.error?.error_summary?.includes('from_lookup/not_found')) {
      userMessage = `Failed to rename: The original file "${oldPath}" was not found.`;
    } else {
      userMessage = `Failed to rename file on Dropbox: ${error?.error?.error_summary || error.message || error}`;
    }
    console.error(`Final error renaming file from "${oldPath}" to "${newPath}" after potential refresh: ${userMessage}`, error);
    // Potentially show userMessage in UI?
    return false;
  }
}

/**
 * Deletes a file on Dropbox.
 * @param {string} filePath - The full path of the file to delete on Dropbox.
 * @returns {Promise<boolean>} A promise that resolves with true if successful, false otherwise.
 */
export async function deleteDropboxFile(filePath) {
  if (!dbx) {
    console.warn('Dropbox API not initialized. Cannot delete file.');
    return false;
  }
  if (!filePath) {
    console.error('deleteDropboxFile called without filePath.');
    return false;
  }

  logVerbose(`Attempting to delete Dropbox file: "${filePath}" via wrapper...`);

  // Use the wrapper function for the API call
  try {
    const response = await callApiWithRefresh(
      () => dbx.filesDeleteV2({ path: filePath }),
      `filesDeleteV2(${filePath})`
    );
    logVerbose(`Successfully deleted file on Dropbox:`, response.result);
    return true;
  } catch (error) {
    // Handle specific non-auth errors after the wrapper
    let userMessage = `Failed to delete file on Dropbox.`;
    if (error?.error?.error_summary?.includes('path_lookup/not_found')) {
      // If file not found, maybe treat as success for deletion intent?
      logVerbose(`File "${filePath}" not found during delete attempt. Treating as success.`);
      return true; // File is already gone, goal achieved.
    } else {
      userMessage = `Failed to delete file on Dropbox: ${error?.error?.error_summary || error.message || error}`;
    }
    console.error(`Final error deleting file "${filePath}" after potential refresh: ${userMessage}`, error);
    // Potentially show userMessage in UI?
    return false;
  }
}
