/* global showNotification */
'use strict';

import {
  getKnownFiles,
  getActiveFile,
  DEFAULT_FILE_PATH
} from './storage/storage.js';
import { initializeDropboxSync } from './dropbox-sync.js';
import { logVerbose } from './logging.js';
import {
  setupAddFileModalListeners,
  setupRenameFileModalListeners,
  setupDeleteFileConfirmListener
} from './storage/files.js';

const addFileButton = $('#addFileButton');
const renameFileButton = $('#renameFileButton');
const deleteFileButton = $('#deleteFileButton');
const newFileNameInput = $('#newFileNameInput');
const currentFileNameToRename = $('#currentFileNameToRename');
const newRenameFileNameInput = $('#newRenameFileNameInput');

let addFileModalInstance = null;
let renameFileModalInstance = null;


// --- Generic initialization logic below ---


$(document).ready(function () {

  logVerbose("Document ready: Initializing UI and listeners.");
  initializeDropboxSync();
  setupDeleteFileConfirmListener();

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
        setupAddFileModalListeners();
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
        setupRenameFileModalListeners();
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

      if (currentFilePath === DEFAULT_FILE_PATH) {
        showNotification("Error: The default todo.txt file cannot be renamed.", 'alert');
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
      showNotification("Error: Could not find the current file details.", 'alert');
      return;
    }

    if (filePathToDelete === DEFAULT_FILE_PATH) {
      showNotification("Error: The default todo.txt file cannot be deleted.", 'alert');
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
      showNotification("Error: Delete confirmation dialog component is missing.", 'alert');
    }
  });

});
