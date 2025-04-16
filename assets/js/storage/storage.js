'use strict';

import { logVerbose, warnVerbose } from '../logging.js';

// --- Constants ---
const KNOWN_FILES_KEY = 'knownFiles'; // Stores array of { name: string, path: string }
const ACTIVE_FILE_KEY = 'activeFile'; // Stores the path (string) of the active file
export const DEFAULT_FILE_PATH = '/default.txt'; // Default file if none active or found

// Storage key prefixes
const CONTENT_KEY_PREFIX = 'content_';
const LOCAL_MOD_KEY_PREFIX = 'contentLastModifiedLocal_';
const SYNC_TIME_KEY_PREFIX = 'lastSyncTime_';


// --- Helper Functions ---

// Generates a storage key for a file's content
function getContentStorageKey(filePath) {
  if (!filePath) return null;
  const safePath = filePath.replace(/\//g, '_');
  return `${CONTENT_KEY_PREFIX}${safePath}`;
}

// Generates a storage key for a file's local modification timestamp
function getLocalModStorageKey(filePath) {
  if (!filePath) return null;
  const safePath = filePath.replace(/\//g, '_');
  return `${LOCAL_MOD_KEY_PREFIX}${safePath}`;
}

// Generates a storage key for a file's last sync timestamp
function getLastSyncStorageKey(filePath) {
  if (!filePath) return null;
  const safePath = filePath.replace(/\//g, '_');
  return `${SYNC_TIME_KEY_PREFIX}${safePath}`;
}


// --- Active File Management ---

export function getActiveFile() {
  return localStorage.getItem(ACTIVE_FILE_KEY) || DEFAULT_FILE_PATH;
}

export function setActiveFile(filePath) {
  if (!filePath || typeof filePath !== 'string') {
    console.error("Invalid file path provided to setActiveFile:", filePath);
    return;
  }
  // Optional: Validate if filePath exists in known files?
  localStorage.setItem(ACTIVE_FILE_KEY, filePath);
  logVerbose(`Active file set to: ${filePath}`);
  // Potentially trigger UI update or data reload here
}

// --- Known Files Management ---

export function getKnownFiles() {
  const filesJSON = localStorage.getItem(KNOWN_FILES_KEY);
  try {
    const files = filesJSON ? JSON.parse(filesJSON) : [];
    // Ensure default file is always present
    if (!files.some(file => file.path === DEFAULT_FILE_PATH)) {
      const defaultFileName = DEFAULT_FILE_PATH.substring(DEFAULT_FILE_PATH.lastIndexOf('/') + 1);
      const defaultFile = { name: defaultFileName, path: DEFAULT_FILE_PATH };
      if (files.length === 0) {
        // If list is empty, add default and save
        saveKnownFiles([defaultFile]);
        return [defaultFile];
      } else {
        // If list exists but missing default, add it temporarily for the return value
        warnVerbose("Default file path missing from known files list, adding temporarily.");
        files.unshift(defaultFile);
      }
    }
    return files;
  } catch (e) {
    console.error("Error parsing known files from localStorage:", e);
    // Provide default if parsing fails
    const defaultFileName = DEFAULT_FILE_PATH.substring(DEFAULT_FILE_PATH.lastIndexOf('/') + 1);
    const defaultFile = { name: defaultFileName, path: DEFAULT_FILE_PATH };
    saveKnownFiles([defaultFile]); // Attempt to fix storage
    return [defaultFile];
  }
}

export function saveKnownFiles(filesArray) {
  if (!Array.isArray(filesArray)) {
    console.error("Attempted to save non-array as known files:", filesArray);
    return;
  }
  // Ensure default file is always present
  if (!filesArray.some(file => file.path === DEFAULT_FILE_PATH)) {
    warnVerbose("Default file path missing from saveKnownFiles input, adding it.");
    const defaultFileName = DEFAULT_FILE_PATH.substring(DEFAULT_FILE_PATH.lastIndexOf('/') + 1);
    filesArray.unshift({ name: defaultFileName, path: DEFAULT_FILE_PATH });
  }
  localStorage.setItem(KNOWN_FILES_KEY, JSON.stringify(filesArray));
}

export function addKnownFile(name, path) {
  if (!name || !path) {
    console.error("Cannot add known file without name and path.");
    return false;
  }
  const files = getKnownFiles();
  if (files.some(file => file.path === path)) {
    warnVerbose(`File with path "${path}" already exists.`);
    return false;
  }
  files.push({ name, path });
  saveKnownFiles(files);
  return true;
}

export function renameKnownFile(oldPath, newName, newPath) {
  if (!oldPath || !newName || !newPath) {
    console.error("Cannot rename known file without oldPath, newName, and newPath.");
    return false;
  }
  const files = getKnownFiles();
  const index = files.findIndex(file => file.path === oldPath);
  if (index === -1) {
    warnVerbose(`Cannot find file with path "${oldPath}" to rename.`);
    return false;
  }
  if (files.some(file => file.path === newPath && file.path !== oldPath)) {
    warnVerbose(`File with new path "${newPath}" already exists.`);
    return false;
  }
  // Move associated data in localStorage
  const oldContentKey = getContentStorageKey(oldPath);
  const newContentKey = getContentStorageKey(newPath);
  const oldLocalModKey = getLocalModStorageKey(oldPath);
  const newLocalModKey = getLocalModStorageKey(newPath);
  const oldSyncTimeKey = getLastSyncStorageKey(oldPath);
  const newSyncTimeKey = getLastSyncStorageKey(newPath);

  if (oldContentKey && newContentKey) {
    const contentData = localStorage.getItem(oldContentKey);
    if (contentData) {
      localStorage.setItem(newContentKey, contentData);
      localStorage.removeItem(oldContentKey);
      logVerbose(`Moved content data from ${oldContentKey} to ${newContentKey}`);

      // Move timestamps
      const localModTimestamp = localStorage.getItem(oldLocalModKey);
      if (localModTimestamp && newLocalModKey) {
        localStorage.setItem(newLocalModKey, localModTimestamp);
        localStorage.removeItem(oldLocalModKey);
        logVerbose(`Moved local modified timestamp from ${oldLocalModKey} to ${newLocalModKey}`);
      }
      const syncTimestamp = localStorage.getItem(oldSyncTimeKey);
      if (syncTimestamp && newSyncTimeKey) {
        localStorage.setItem(newSyncTimeKey, syncTimestamp);
        localStorage.removeItem(oldSyncTimeKey);
        logVerbose(`Moved last sync timestamp from ${oldSyncTimeKey} to ${newSyncTimeKey}`);
      }
    } else {
      warnVerbose(`No content data found for ${oldPath} (key: ${oldContentKey}) to move during rename.`);
      // Ensure old keys are removed even if no data existed
      if (oldLocalModKey) localStorage.removeItem(oldLocalModKey);
      if (oldSyncTimeKey) localStorage.removeItem(oldSyncTimeKey);
    }
  } else {
    console.error(`Failed to generate storage keys during rename from ${oldPath} to ${newPath}. Data not moved.`);
  }

  // Update the known files list entry
  files[index].name = newName;
  files[index].path = newPath;
  saveKnownFiles(files); // Save the updated list

  // If the renamed file was the active one, update the active file path
  if (getActiveFile() === oldPath) {
    setActiveFile(newPath);
  }
  return true;
}

export function removeKnownFile(pathToRemove) {
  if (!pathToRemove) {
    console.error("Cannot remove known file without a path.");
    return false;
  }
  if (pathToRemove === DEFAULT_FILE_PATH) {
    warnVerbose("Cannot remove the default file.");
    return false;
  }
  let files = getKnownFiles();
  const initialLength = files.length;
  files = files.filter(file => file.path !== pathToRemove);

  if (files.length < initialLength) {
    saveKnownFiles(files);
    // If the removed file was the active one, switch to default
    if (getActiveFile() === pathToRemove) {
      setActiveFile(DEFAULT_FILE_PATH);
      logVerbose(`Removed active file "${pathToRemove}", switched to default.`);
      // TODO: Consider triggering a reload of the UI/data for the new active file
    }
    // Remove associated data from localStorage
    const contentKey = getContentStorageKey(pathToRemove);
    const localModKey = getLocalModStorageKey(pathToRemove);
    const syncTimeKey = getLastSyncStorageKey(pathToRemove);

    if (contentKey) localStorage.removeItem(contentKey);
    if (localModKey) localStorage.removeItem(localModKey);
    if (syncTimeKey) localStorage.removeItem(syncTimeKey);

    logVerbose(`Removed stored content and metadata for file: ${pathToRemove}`);
    return true;
  } else {
    warnVerbose(`Could not find file with path "${pathToRemove}" to remove.`);
    return false;
  }
}


// --- Generic Content Storage (Per-File) ---

/**
 * Retrieves the raw string content for the active file from localStorage.
 * @returns {string} The stored content string, or an empty string if none exists.
 */
export function getContentFromStorage() {
  const activeFilePath = getActiveFile();
  const storageKey = getContentStorageKey(activeFilePath);
  if (!storageKey) return '';

  return localStorage.getItem(storageKey) || '';
}

/**
 * Saves the raw string content for the active file to localStorage.
 * Also updates the local modification timestamp and dispatches an event.
 * @param {string} contentString - The string content to save.
 */
export function saveContentToStorage(contentString) {
  const activeFilePath = getActiveFile();
  const storageKey = getContentStorageKey(activeFilePath);
  const timestampKey = getLocalModStorageKey(activeFilePath);

  if (!storageKey || !timestampKey) {
    console.error("Cannot save content: failed to generate storage keys for path:", activeFilePath);
    return;
  }

  // Ensure we are saving a string
  if (typeof contentString !== 'string') {
    console.error(`Attempted to save non-string content to localStorage for key "${storageKey}":`, contentString);
    return; // Only save strings
  }

  localStorage.setItem(storageKey, contentString);
  const saveTimestamp = new Date().toISOString();
  localStorage.setItem(timestampKey, saveTimestamp);

  // Dispatch event indicating data change
  document.dispatchEvent(new CustomEvent('localDataChanged', {
    detail: {
      filePath: activeFilePath,
      timestamp: saveTimestamp
    }
  }));
  logVerbose(`Dispatched localDataChanged event for ${activeFilePath}`);
}

/**
 * Retrieves the timestamp of the last local save operation for the active file.
 * @returns {string | null} ISO 8601 timestamp string or null.
 */
export function getLocalLastModified() {
  const activeFilePath = getActiveFile();
  const timestampKey = getLocalModStorageKey(activeFilePath);
  if (!timestampKey) return null;
  return localStorage.getItem(timestampKey);
}

// --- Last Sync Time Storage (Per-File) ---

/**
 * Stores the timestamp of the last successful sync operation for a specific file.
 * @param {string} filePath - The path of the synced file.
 */
export function setLastSyncTime(filePath) {
  const timestampKey = getLastSyncStorageKey(filePath);
  if (!timestampKey) {
    console.error("Cannot set last sync time: failed to generate storage key for path:", filePath);
    return;
  }
  const now = new Date().toISOString();
  localStorage.setItem(timestampKey, now);
  logVerbose(`Last sync time set for ${filePath}: ${now}`);
}

/**
 * Retrieves the timestamp of the last successful sync operation for a specific file.
 * @param {string} filePath - The path of the file to check.
 * @returns {string | null} ISO 8601 timestamp string or null.
 */
export function getLastSyncTime(filePath) {
  const timestampKey = getLastSyncStorageKey(filePath);
  if (!timestampKey) return null;
  return localStorage.getItem(timestampKey);
}
