/* global i18next */
'use strict';
$(document).ready(function() {
  // Initialize all switches on page load
  $(".form-check-input").each(function() {
    const switchElement = $(this);
    const label = $(`label[for="${switchElement.attr("id")}"]`);
    // Use i18next.t() for default labels, falling back to data attributes or hardcoded defaults if keys not found
    const checkedLabel = switchElement.data("checked") || i18next.t('switch.on', 'ON');
    const uncheckedLabel = switchElement.data("unchecked") || i18next.t('switch.off', 'OFF');
    // Set initial label
    label.text(switchElement.is(":checked") ? checkedLabel : uncheckedLabel);
    // Add event listener to toggle label on change
    switchElement.change(function() {
      label.text(switchElement.is(":checked") ? checkedLabel : uncheckedLabel);
    });
  });
});

window.showPrimaryNotification = function() {
  showNotification(i18next.t('notification.disappearingAlert', 'Disappearing alert notification'), 'alert', i18next.t('notification.disappearingAlertTitle', 'Alert'));
};

window.showComplementaryNotification = function() {
  showNotification(i18next.t('notification.fixedSuccess', 'Fixed success notification'), 'success', i18next.t('notification.fixedSuccessTitle', 'Success'), 0);
};
