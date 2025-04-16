/* global i18next, i18nextBrowserLanguageDetector, i18nextHttpBackend */
'use strict';

import { logVerbose, warnVerbose } from './logging.js';

// Function to update the content based on loaded translations
function updateContent() {
  logVerbose('Updating content for language:', i18next.language);
  const elements = document.querySelectorAll('[data-i18n]');
  elements.forEach(el => {
    const key = el.getAttribute('data-i18n');
    let translation = ''; // Initialize translation variable

    // Check if the key indicates a specific attribute like 'title' or 'placeholder'
    let attribute = null;
    let actualKey = key;
    if (key.startsWith('[')) {
      const match = key.match(/^\[(.*?)\](.*)/);
      if (match) {
        attribute = match[1];
        actualKey = match[2];
        translation = i18next.t(actualKey); // Get translation for the actual key
      } else {
        // Handle cases where key might start with [ but not match the pattern, treat as normal key
        actualKey = key;
        translation = i18next.t(actualKey);
      }
    } else {
      // Not an attribute key
      actualKey = key;
      translation = i18next.t(actualKey);
    }


    if (attribute) {
      // Update the specified attribute
      el.setAttribute(attribute, translation);
      logVerbose(`Updated attribute "${attribute}" for element with key "${actualKey}"`);
    } else {
      // Update text content, preserving child elements (like icons)
      let textNodeFound = false;
      for (const node of el.childNodes) {
        // Update only non-empty text nodes to avoid messing with spacing nodes
        if (node.nodeType === Node.TEXT_NODE && node.textContent.trim().length > 0) {
          node.textContent = translation;
          textNodeFound = true;
          logVerbose(`Updated text node for element with key "${actualKey}"`);
          break; // Update only the first significant text node found
        }
      }

      // Fallback for elements that might be initially empty or only contain text
      // Check if the element has no element children and no text node was updated
      if (!textNodeFound && !el.querySelector(':scope > *')) {
        el.textContent = translation;
        logVerbose(`Set textContent for element with key "${actualKey}" as fallback`);
      } else if (!textNodeFound && el.querySelector(':scope > *')) {
        // If it has element children but we didn't find a text node to update, log a warning.
        // This might indicate a structure where translation needs more specific handling.
        warnVerbose(`Could not find a primary text node to update for element with key "${actualKey}". Translation skipped to preserve child elements.`);
      }
    }
  });
}

// Function to update the language display in the dropdown
function updateLanguageDisplay() {
  const currentLang = i18next.language;
  const langDisplayElement = document.getElementById('currentLangDisplay');
  if (langDisplayElement) {
    let displayLang = currentLang.toUpperCase();
    // Special case for Japanese display name
    if (currentLang === 'ja') {
      displayLang = '日本語';
    }
    langDisplayElement.textContent = displayLang;
    logVerbose(`Updated language display to: ${displayLang}`);
  } else {
    warnVerbose('Language display element (#currentLangDisplay) not found.');
  }
}

$(document).ready(function() {
  i18next
    .use(i18nextBrowserLanguageDetector)
    .use(i18nextHttpBackend) // Add the backend
    .init({
      defaultNS: 'translation',
      backend: {
        loadPath: '/assets/locales/{{lng}}/{{ns}}.json' // Absolute path from root
      },
      detection: {
        order: ['querystring', 'localStorage', 'navigator'],
        lookupQuerystring: 'lang',
        caches: ['localStorage']
      },
      fallbackLng: 'en', // Default language
      supportedLngs: ['en', 'it', 'ja'], // List of allowed languages
      debug: false // Set to true for debugging
    })
    .then(function() {
      // Translations loaded successfully
      logVerbose('i18next initialized and translations loaded.');
      updateContent(); // Initial content update
      updateLanguageDisplay(); // Update language display initially
      // Add 'localized' class to body to make content visible smoothly
      document.body.classList.add('localized');
      logVerbose('Added .localized class to body.');
    })
    .catch(function(err) {
      console.error('Error initializing i18next or loading translations:', err); // Keep console.error
      // Make body visible even if translations fail, to avoid blank page
      document.body.classList.add('localized');
      warnVerbose('Added .localized class to body despite translation error.');
    });

  // Update content and display when language changes
  i18next.on('languageChanged', () => {
    logVerbose('Language changed event detected.');
    updateContent();
    updateLanguageDisplay(); // Update dropdown display on language change
  });

  // Add click event listener for language selection links
  // Use event delegation to handle clicks on dynamically added elements if needed
  $(document).on('click', '.lang-select', function(e) {
    e.preventDefault(); // Prevent default link behavior
    const selectedLang = $(this).data('lang');
    logVerbose(`Language selected: ${selectedLang}`);
    if (selectedLang && selectedLang !== i18next.language) {
      i18next.changeLanguage(selectedLang)
        .then(() => {
          logVerbose(`Language successfully changed to ${selectedLang}`);
          // updateContent and updateLanguageDisplay are called by the 'languageChanged' event listener
        })
        .catch(err => {
          console.error(`Error changing language to ${selectedLang}:`, err);
        });
    } else if (selectedLang === i18next.language) {
      logVerbose(`Selected language (${selectedLang}) is already active.`);
    } else {
      warnVerbose('Could not determine selected language from clicked element.');
    }
  });
});
