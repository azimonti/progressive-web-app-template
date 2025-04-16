/* global Dropbox */
import { logVerbose, warnVerbose } from '../logging.js';

let dbx = null; // Dropbox API instance

/**
 * Initializes the main Dropbox API object with the access token.
 * Also triggers the initial sync check.
 * @param {string | null} token - The Dropbox access token, or null to de-initialize.
 */
export async function initializeDropboxApi(token) {
  if (!token) {
    logVerbose('De-initializing Dropbox API (token is null).');
    dbx = null;
    // Status should be handled by logout function or initial state
    return;
  }

  if (typeof Dropbox === 'undefined') {
    console.error('Dropbox SDK not loaded, cannot initialize API.');
    return;
  }

  if (dbx && dbx.accessToken === token) {
    logVerbose('Dropbox API already initialized with the same token.');
    return; // Avoid re-initialization if token hasn't changed
  }

  logVerbose('Initializing Dropbox API...');
  try {
    dbx = new Dropbox.Dropbox({ accessToken: token });
    logVerbose('Dropbox API initialized successfully.');

    // Trigger initial sync check via the coordinator (needs to be called from auth/init)
    // Dynamically import and call the coordinator's sync function
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
 * Returns the initialized Dropbox API instance.
 * @returns {Dropbox | null} The Dropbox instance or null if not initialized.
 */
export function getDbxInstance() {
  return dbx;
}

/**
 * Fetches metadata for a specific file from Dropbox.
 * @param {string} filePath - The full path of the file on Dropbox (e.g., '/path/to/file.txt').
 * @returns {Promise<DropboxTypes.files.FileMetadataReference | DropboxTypes.files.FolderMetadataReference | DropboxTypes.files.DeletedMetadataReference | null>} A promise that resolves with the file metadata object, or null if an error occurs or the file doesn't exist.
 */
export async function getDropboxFileMetadata(filePath) {
  if (!dbx) {
    warnVerbose('Dropbox API not initialized. Cannot get metadata.');
    return null;
  }
  if (!filePath) {
    console.error('getDropboxFileMetadata called without filePath.');
    return null;
  }

  try {
    logVerbose(`Fetching metadata for ${filePath} from Dropbox...`);
    const response = await dbx.filesGetMetadata({ path: filePath });
    logVerbose(`Successfully fetched metadata for ${filePath}:`, response.result);
    return response.result; // Contains server_modified, size, etc.
  } catch (error) {
    // Handle specific errors, e.g., file not found
    if (error?.error?.error_summary?.startsWith('path/not_found')) {
      logVerbose(`File ${filePath} not found on Dropbox. No metadata available.`);
      return null; // Return null if file doesn't exist yet
    }
    // Log the full error object for more details
    console.error(`Full error object fetching metadata for ${filePath}:`, error);
    const errorSummary = error?.error?.error_summary || String(error);
    console.error(`Error fetching metadata for ${filePath} from Dropbox:`, errorSummary);

    // Check for invalid access token error using the specific error tag or summary string
    const isInvalidToken = error?.error?.['.tag'] === 'invalid_access_token' || errorSummary.includes('invalid_access_token');
    if (isInvalidToken) {
      console.warn(`Invalid access token detected while fetching metadata for ${filePath}. Logging out.`);
      // Dynamically import logout function
      const { logoutFromDropbox } = await import('./auth.js');
      logoutFromDropbox();
    }
    return null; // Return null on errors
  }
}

/**
 * Downloads a specific file from Dropbox.
 * @param {string} filePath - The full path of the file on Dropbox (e.g., '/path/to/file.txt').
 * @returns {Promise<{success: boolean, content: string | null}>} A promise resolving with success status and content, or null content on failure/not found.
 */
export async function downloadFileFromDropbox(filePath) {
  if (!dbx) {
    warnVerbose('Dropbox API not initialized. Cannot download.');
    return { success: false, content: null };
  }
  if (!filePath) {
    console.error('downloadFileFromDropbox called without filePath.');
    return { success: false, content: null };
  }

  try {
    logVerbose(`Downloading ${filePath} from Dropbox...`);
    const response = await dbx.filesDownload({ path: filePath });
    logVerbose(`Successfully downloaded metadata for ${filePath}:`, response);

    // filesDownload returns metadata, the content is a blob that needs to be read
    const fileBlob = response.result.fileBlob;
    if (fileBlob) {
      const text = await fileBlob.text();
      logVerbose(`Downloaded content for ${filePath} (${text.length} chars).`);
      return { success: true, content: text };
    } else {
      console.warn(`Downloaded file blob is missing for ${filePath}.`);
      return { success: false, content: null };
    }
  } catch (error) {
    // Handle specific errors, e.g., file not found
    if (error?.error?.error_summary?.startsWith('path/not_found')) {
      logVerbose(`File ${filePath} not found on Dropbox. Assuming first sync.`);
      return { success: true, content: null }; // Success, but no content (file doesn't exist)
    }
    const errorSummary = error?.error?.error_summary || String(error);
    console.error(`Error downloading ${filePath} from Dropbox:`, errorSummary);

    // Check for invalid access token error using the specific error tag or summary string
    const isInvalidToken = error?.error?.['.tag'] === 'invalid_access_token' || errorSummary.includes('invalid_access_token');
    if (isInvalidToken) {
      console.warn(`Invalid access token detected while downloading ${filePath}. Logging out.`);
      const { logoutFromDropbox } = await import('./auth.js');
      logoutFromDropbox();
    }
    return { success: false, content: null };
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
    warnVerbose(`Upload attempt for ${filePath} cancelled: Application is offline.`);
    // Coordinator should have set pending flag already if needed.
    return false; // Indicate failure (cannot upload offline)
  }

  // Check if Dropbox API is initialized
  if (!dbx) {
    warnVerbose(`Dropbox API not initialized. Cannot upload ${filePath}.`);
    return false;
  }

  logVerbose(`Attempting to upload content to ${filePath} (Online)...`);

  try {
    // Conflict checks are handled by the coordinator before calling this.
    const contentSize = typeof fileContent === 'string' ? fileContent.length : fileContent.size;
    logVerbose(`Uploading content (${contentSize} ${typeof fileContent === 'string' ? 'chars' : 'bytes'}) to ${filePath} on Dropbox...`);
    const response = await dbx.filesUpload({
      path: filePath,
      contents: fileContent,
      mode: 'overwrite',
      autorename: false,
      mute: true
    });
    logVerbose(`Successfully uploaded content to ${filePath} on Dropbox:`, response);
    return true; // Indicate success

  } catch (error) {
    console.error(`Error during upload API call for ${filePath}:`, error);

    // Check for invalid access token error
    const errorSummary = error?.error?.error_summary || String(error);
    const isInvalidToken = error?.error?.['.tag'] === 'invalid_access_token' || errorSummary.includes('invalid_access_token');
    if (isInvalidToken) {
      console.warn(`Invalid access token detected during upload for ${filePath}. Logging out.`);
      const { logoutFromDropbox } = await import('./auth.js');
      logoutFromDropbox();
    }
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
    warnVerbose('Dropbox API not initialized. Cannot rename file.');
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

  logVerbose(`Attempting to rename Dropbox file from "${oldPath}" to "${newPath}"...`);
  try {
    // Use filesMoveV2 for renaming
    const response = await dbx.filesMoveV2({
      from_path: oldPath,
      to_path: newPath,
      allow_shared_folder: false, // Adjust as needed
      autorename: false, // Do not autorename if target exists
      allow_ownership_transfer: false
    });
    logVerbose(`Successfully renamed file on Dropbox:`, response.result);
    return true;
  } catch (error) {
    console.error(`Error renaming file from "${oldPath}" to "${newPath}" on Dropbox:`, error?.error?.error_summary || error);
    // Provide more specific feedback if possible
    let userMessage = `Failed to rename file on Dropbox.`;
    if (error?.error?.error_summary?.includes('to/conflict/file')) {
      userMessage = `Failed to rename: A file already exists at "${newPath}".`;
    } else if (error?.error?.error_summary?.includes('from_lookup/not_found')) {
      userMessage = `Failed to rename: The original file "${oldPath}" was not found.`;
    }
    // Check for invalid access token error using the specific error tag or summary string
    const errorSummary = error?.error?.error_summary || String(error);
    const isInvalidToken = error?.error?.['.tag'] === 'invalid_access_token' || errorSummary.includes('invalid_access_token');
    if (isInvalidToken) {
      console.warn(`Invalid access token detected during rename from ${oldPath} to ${newPath}. Logging out.`);
      const { logoutFromDropbox } = await import('./auth.js');
      logoutFromDropbox();
      userMessage = 'Dropbox connection error: Your session has expired. Please reconnect.';
    }

    console.error(userMessage);
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
    warnVerbose('Dropbox API not initialized. Cannot delete file.');
    return false;
  }
  if (!filePath) {
    console.error('deleteDropboxFile called without filePath.');
    return false;
  }

  logVerbose(`Attempting to delete Dropbox file: "${filePath}"...`);
  try {
    const response = await dbx.filesDeleteV2({ path: filePath });
    logVerbose(`Successfully deleted file on Dropbox:`, response.result);
    return true;
  } catch (error) {
    console.error(`Error deleting file "${filePath}" on Dropbox:`, error?.error?.error_summary || error);
    // Provide more specific feedback if possible
    let userMessage = `Failed to delete file on Dropbox.`;
    if (error?.error?.error_summary?.includes('path_lookup/not_found')) {
      // If file not found, maybe treat as success for deletion? Or specific error?
      // For now, let's treat not found as a failure to delete what was intended.
      userMessage = `Failed to delete: The file "${filePath}" was not found on Dropbox.`;
    }
    // Check for invalid access token error using the specific error tag or summary string
    const errorSummary = error?.error?.error_summary || String(error);
    const isInvalidToken = error?.error?.['.tag'] === 'invalid_access_token' || errorSummary.includes('invalid_access_token');
    if (isInvalidToken) {
      console.warn(`Invalid access token detected during delete for ${filePath}. Logging out.`);
      const { logoutFromDropbox } = await import('./auth.js');
      logoutFromDropbox();
      userMessage = 'Dropbox connection error: Your session has expired. Please reconnect.';
    }

    console.error(userMessage);
    return false;
  }
}
