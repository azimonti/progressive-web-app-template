'use strict';

import { getKnownFiles, getActiveFile  } from './storage/storage.js?id=fc364d';
import { logVerbose } from './logging.js?id=fc364d';
import { setupAddFileModalListeners, setupRenameFileModalListeners } from './storage/files.js?id=fc364d';

const addFileButton = $('#addFileButton');
const renameFileButton = $('#renameFileButton');
const deleteFileButton = $('#deleteFileButton');
const newFileNameInput = $('#newFileNameInput');
const currentFileNameToRename = $('#currentFileNameToRename');
const newRenameFileNameInput = $('#newRenameFileNameInput');

let addFileModalInstance = null;
let renameFileModalInstance = null;

export function initializeFileManagementUI() {
  logVerbose("Initializing File Management UI listeners.");

  // Setup listeners needed for modals *before* they are shown for the first time
  // Note: setupDeleteFileConfirmListener is called in TEMPLATE.js's ready block,
  // ensure it's called appropriately if moved or duplicated.
  // Let's keep setupDeleteFileConfirmListener in TEMPLATE.js for now as it was originally.

  // --- File Management Button Click Handlers (Modal Openers) ---
  addFileButton.click(function() {
    try {
      const addModalElement = document.getElementById('addFileModal');
      if (!addModalElement) {
        console.error("Add File Modal element not found in HTML.");
        alert("Error: Add file dialog component is missing.");
        return;
      }
      if (typeof window.bootstrap === 'undefined' || !window.bootstrap.Modal) {
        console.error("Bootstrap Modal component not found.");
        alert("Error: UI library component (Modal) not loaded.");
        return;
      }

      if (!addFileModalInstance) {
        logVerbose("Initializing Add File Modal instance and listeners for the first time.");
        addFileModalInstance = new window.bootstrap.Modal(addModalElement);
        setupAddFileModalListeners(); // Setup listeners when modal is first created
      } else {
        logVerbose("Add File Modal instance already exists.");
      }

      newFileNameInput.val('');
      addFileModalInstance.show();

    } catch (e) {
      console.error("Error showing Add File modal:", e);
      alert("Error opening Add file dialog.");
    }
  });

  renameFileButton.click(async function() {
    try {
      const renameModalElement = document.getElementById('renameFileModal');
      if (!renameModalElement) {
        console.error("Rename File Modal element not found in HTML.");
        alert("Error: Rename file dialog component is missing.");
        return;
      }
      if (typeof window.bootstrap === 'undefined' || !window.bootstrap.Modal) {
        console.error("Bootstrap Modal component not found.");
        alert("Error: UI library component (Modal) not loaded.");
        return;
      }

      if (!renameFileModalInstance) {
        logVerbose("Initializing Rename File Modal instance and listeners for the first time.");
        renameFileModalInstance = new window.bootstrap.Modal(renameModalElement);
        setupRenameFileModalListeners(); // Setup listeners when modal is first created
      } else {
        logVerbose("Rename File Modal instance already exists.");
      }

      const currentFilePath = getActiveFile();
      const knownFiles = getKnownFiles();
      const currentFile = knownFiles.find(f => f.path === currentFilePath);

      if (!currentFile) {
        console.error("Cannot rename: Active file not found in known files list.");
        alert("Error: Could not find the current file details.");
        return;
      }

      currentFileNameToRename.text(currentFile.name);
      newRenameFileNameInput.val(currentFile.name);
      renameFileModalInstance.show();

    } catch (e) {
      console.error("Error showing Rename File modal:", e);
      alert("Error opening Rename file dialog.");
    }
  });

  deleteFileButton.click(async function() {
    const filePathToDelete = getActiveFile();
    const knownFiles = getKnownFiles();
    const fileToDelete = knownFiles.find(f => f.path === filePathToDelete);

    if (!fileToDelete) {
      console.error("Cannot delete: Active file not found in known files list.");
      if (typeof showNotification === 'function') {
        showNotification("Error: Could not find the current file details.", 'alert');
      } else {
        console.warn("showNotification function not found. Cannot display delete error for missing file.");
        alert("Error: Could not find the current file details.");
      }
      return;
    }

    logVerbose(`Requesting delete confirmation for file: ${fileToDelete.name} (${filePathToDelete})`);

    $('#fileNameToDelete').text(fileToDelete.name);
    $('#deleteFileModalConfirm').data('filePathToDelete', filePathToDelete);
    $('#deleteFileModalConfirm').data('fileNameToDelete', fileToDelete.name);

    const deleteModalEl = document.getElementById('deleteFileModalConfirm');
    if (deleteModalEl) {
      const deleteModal = bootstrap.Modal.getOrCreateInstance(deleteModalEl);
      deleteModal.show();
    } else {
      console.error("Delete confirmation modal element (#deleteFileModalConfirm) not found!");
      if (typeof showNotification === 'function') {
        showNotification("Error: Delete confirmation dialog component is missing.", 'alert');
      } else {
        console.warn("showNotification function not found. Cannot display delete error for missing modal.");
        alert("Error: Delete confirmation dialog component is missing.");
      }
    }
  });
}
