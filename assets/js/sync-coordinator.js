'use strict';

import {
  getActiveFile,
  getLocalLastModified,
  getContentFromStorage,
  saveContentToStorage,
  setLastSyncTime
} from './storage/storage.js';
import {
  getDbxInstance,
  getDropboxFileMetadata,
  downloadFileFromDropbox,
  uploadFileToDropbox
} from './dropbox/api.js';
import { updateSyncIndicator, showConflictModal, SyncStatus } from './dropbox/ui.js';
import { clearUploadPending, isUploadPending, setUploadPending } from './dropbox/offline.js';
import { logVerbose, warnVerbose } from './logging.js';

let syncDebounceTimer = null;
const SYNC_DEBOUNCE_DELAY = 3000; // 3 seconds delay before syncing after local change

/**
 * Performs the core sync logic for the currently active file:
 * compares local and remote timestamps and handles conflicts.
 */
export async function coordinateSync() {
  clearTimeout(syncDebounceTimer);

  const activeFilePath = getActiveFile();
  if (!activeFilePath) {
    console.error("Sync failed: Could not determine active file path.");
    updateSyncIndicator(SyncStatus.ERROR, 'Sync failed: No active file', null);
    return;
  }
  logVerbose(`Starting coordinated sync for active file: ${activeFilePath}`);

  const dbx = getDbxInstance();
  if (!dbx) {
    warnVerbose('Dropbox API not initialized. Cannot sync.');
    return;
  }

  if (!navigator.onLine) {
    warnVerbose('Cannot sync, application is offline.');
    updateSyncIndicator(SyncStatus.OFFLINE, '', activeFilePath);
    return;
  }

  updateSyncIndicator(SyncStatus.SYNCING, '', activeFilePath);
  let finalStatus = SyncStatus.IDLE;
  let errorMessage = '';

  try {
    const localTimestampStr = getLocalLastModified();
    const dropboxMeta = await getDropboxFileMetadata(activeFilePath);

    const localDate = localTimestampStr ? new Date(localTimestampStr) : null;
    const dropboxDate = (dropboxMeta && dropboxMeta['.tag'] === 'file' && dropboxMeta.server_modified)
      ? new Date(dropboxMeta.server_modified)
      : null;

    logVerbose(`Sync Check for ${activeFilePath} - Local Last Modified: ${localDate?.toISOString() || 'N/A'}`);
    logVerbose(`Sync Check for ${activeFilePath} - Dropbox Last Modified: ${dropboxDate?.toISOString() || 'N/A'}`);

    if (!dropboxMeta || !dropboxDate) {
      if (localDate) {
        logVerbose(`Sync Status for ${activeFilePath}: No file/metadata on Dropbox. Uploading local version.`);
        const localContent = getContentFromStorage();
        const uploadSuccess = await uploadFileToDropbox(activeFilePath, localContent);
        if (uploadSuccess) {
          setLastSyncTime(activeFilePath);
          clearUploadPending(activeFilePath);
          finalStatus = SyncStatus.IDLE;
        } else {
          finalStatus = SyncStatus.ERROR;
          errorMessage = `Failed initial upload for ${activeFilePath}`;
        }
      } else {
        logVerbose(`Sync Status for ${activeFilePath}: No file/metadata on Dropbox and no local data. Nothing to sync.`);
        finalStatus = SyncStatus.IDLE;
        clearUploadPending(activeFilePath);
      }
    } else if (!localDate) {
      logVerbose(`Sync Status for ${activeFilePath}: No local timestamp found. Downloading from Dropbox.`);
      const downloadResult = await downloadFileFromDropbox(activeFilePath);
      if (downloadResult.success && downloadResult.content !== null) {
        saveContentToStorage(downloadResult.content);
        setLastSyncTime(activeFilePath);
        logVerbose(`Local storage (active file) overwritten with Dropbox content for ${activeFilePath}.`);
        finalStatus = SyncStatus.IDLE;
        clearUploadPending(activeFilePath);
      } else {
        console.error(`Failed to download Dropbox content for ${activeFilePath} for initial sync.`);
        finalStatus = SyncStatus.ERROR;
        errorMessage = `Failed initial download for ${activeFilePath}`;
      }
    } else {
      const timeDiff = Math.abs(localDate.getTime() - dropboxDate.getTime());
      const buffer = 2000;

      if (timeDiff <= buffer) {
        logVerbose(`Sync Status for ${activeFilePath}: Local and Dropbox timestamps are close. Assuming synced.`);
        finalStatus = SyncStatus.IDLE;
        clearUploadPending(activeFilePath);
      } else if (dropboxDate > localDate) {
        logVerbose(`Sync Status for ${activeFilePath}: Dropbox file is newer than local. Conflict or simple update needed.`);
        if (isUploadPending(activeFilePath)) {
          logVerbose(`Conflict detected for ${activeFilePath}: Dropbox is newer, but local changes are pending.`);
          try {
            const userChoice = await showConflictModal(localDate, dropboxDate, activeFilePath);
            logVerbose(`Conflict resolved by user for ${activeFilePath}: Keep '${userChoice}'`);

            if (userChoice === 'local') {
              logVerbose(`User chose local for ${activeFilePath}. Uploading local version...`);
              const localContent = getContentFromStorage();
              const uploadSuccess = await uploadFileToDropbox(activeFilePath, localContent);
              if (uploadSuccess) {
                setLastSyncTime(activeFilePath);
                clearUploadPending(activeFilePath);
                finalStatus = SyncStatus.IDLE;
              } else {
                finalStatus = SyncStatus.ERROR;
                errorMessage = `Failed upload after conflict (local chosen) for ${activeFilePath}`;
              }
            } else if (userChoice === 'dropbox') {
              logVerbose(`User chose Dropbox for ${activeFilePath}. Downloading Dropbox version...`);
              updateSyncIndicator(SyncStatus.SYNCING);
              const downloadResult = await downloadFileFromDropbox(activeFilePath);
              if (downloadResult.success && downloadResult.content !== null) {
                saveContentToStorage(downloadResult.content);
                setLastSyncTime(activeFilePath);
                logVerbose(`Local storage overwritten with Dropbox content for ${activeFilePath}.`);
                finalStatus = SyncStatus.IDLE;
                clearUploadPending(activeFilePath);
              } else {
                console.error(`Failed to download Dropbox content for ${activeFilePath} after conflict resolution.`);
                alert(`Error: Could not download the selected Dropbox version for ${activeFilePath}.`);
                finalStatus = SyncStatus.ERROR;
                errorMessage = `Failed download ${activeFilePath} after conflict`;
              }
            } else {
              logVerbose(`Conflict resolution cancelled for ${activeFilePath}. No sync action taken.`);
              finalStatus = SyncStatus.IDLE;
              clearUploadPending(activeFilePath);
            }
          } catch (error) {
            console.error(`Error during conflict resolution for ${activeFilePath}:`, error);
            alert(`An error occurred during sync conflict resolution for ${activeFilePath}.`);
            finalStatus = SyncStatus.ERROR;
            errorMessage = `Conflict resolution error for ${activeFilePath}`;
          }
        } else {
          logVerbose(`Sync Status for ${activeFilePath}: Dropbox is newer, no pending local changes. Downloading.`);
          updateSyncIndicator(SyncStatus.SYNCING);
          const downloadResult = await downloadFileFromDropbox(activeFilePath);
          if (downloadResult.success && downloadResult.content !== null) {
            saveContentToStorage(downloadResult.content);
            setLastSyncTime(activeFilePath);
            logVerbose(`Local storage updated with newer Dropbox content for ${activeFilePath}.`);
            finalStatus = SyncStatus.IDLE;
          } else {
            console.error(`Failed to download newer Dropbox content for ${activeFilePath}.`);
            finalStatus = SyncStatus.ERROR;
            errorMessage = `Failed download of newer version for ${activeFilePath}`;
          }
        }
      } else { // localDate > dropboxDate
        logVerbose(`Sync Status for ${activeFilePath}: Local changes are newer than Dropbox. Uploading.`);
        const localContent = getContentFromStorage();
        const uploadSuccess = await uploadFileToDropbox(activeFilePath, localContent);
        if (uploadSuccess) {
          setLastSyncTime(activeFilePath);
          clearUploadPending(activeFilePath);
          finalStatus = SyncStatus.IDLE;
        } else {
          finalStatus = SyncStatus.ERROR;
          errorMessage = `Failed upload of newer local version for ${activeFilePath}`;
        }
      }
    }
  } catch (error) {
    console.error(`Error during coordinateSync for ${activeFilePath}:`, error);
    finalStatus = SyncStatus.ERROR;
    errorMessage = error.message || error?.error?.error_summary || 'Sync check failed';
  } finally {
    const currentDbx = getDbxInstance();
    if (currentDbx) {
      updateSyncIndicator(finalStatus, errorMessage, activeFilePath);
    } else {
      updateSyncIndicator(SyncStatus.NOT_CONNECTED, '', null);
    }
  }
}

/**
 * Handles the custom event dispatched when local data is saved.
 * Triggers a debounced sync operation.
 * @param {CustomEvent} event - The event object.
 */
function handleLocalDataChange(event) {
  const { filePath } = event.detail;
  const activeFilePath = getActiveFile();

  if (filePath === activeFilePath) {
    logVerbose(`Local data changed for active file (${filePath}). Debouncing sync (${SYNC_DEBOUNCE_DELAY}ms)...`);

    if (!navigator.onLine) {
      warnVerbose(`Offline: Setting upload pending flag for ${activeFilePath} due to local change.`);
      setUploadPending(activeFilePath);
    }

    clearTimeout(syncDebounceTimer);
    syncDebounceTimer = setTimeout(() => {
      logVerbose(`Debounce timer finished for ${activeFilePath}. Triggering coordinateSync.`);
      coordinateSync();
    }, SYNC_DEBOUNCE_DELAY);
  } else {
    logVerbose(`Local data changed event ignored for non-active file: ${filePath}`);
  }
}

/**
 * Initializes the sync coordinator.
 * Sets up the event listener for local data changes.
 */
export function initializeSyncCoordinator() {
  logVerbose('Initializing Sync Coordinator...');
  document.addEventListener('localDataChanged', handleLocalDataChange);
  logVerbose('Sync Coordinator initialized and listening for local data changes.');
}
