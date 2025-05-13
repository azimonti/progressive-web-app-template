/* NOTE: This file (TEMPLATE.js) should primarily contain imports and top-level initialization.   */
/* Avoid adding complex function definitions directly here. Use separate modules and import them. */
'use strict';

import { initializeDropboxSync } from './dropbox-sync.js?id=fc364d';
import { logVerbose } from './logging.js?id=fc364d';
import { setupDeleteFileConfirmListener } from './storage/files.js?id=fc364d';
import { initializeFileManagementUI } from './file-management-ui.js?id=fc364d';

// --- Generic initialization logic below ---
$(document).ready(function () {

  logVerbose("Document ready: Initializing UI and listeners.");
  initializeDropboxSync();
  setupDeleteFileConfirmListener(); // Keep this here as it relates to the delete confirmation modal logic
  initializeFileManagementUI(); // Initialize the file management button listeners

});
