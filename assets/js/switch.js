'use strict';

$(document).ready(function() {
  // Initialize all switches on page load
  $(".form-check-input").each(function() {
    const switchElement = $(this);
    const label = $(`label[for="${switchElement.attr("id")}"]`);
    const checkedLabel = switchElement.data("checked") || "ON";
    const uncheckedLabel = switchElement.data("unchecked") || "OFF";
    // Set initial label
    label.text(switchElement.is(":checked") ? checkedLabel : uncheckedLabel);
    // Add event listener to toggle label on change
    switchElement.change(function() {
      label.text(switchElement.is(":checked") ? checkedLabel : uncheckedLabel);
    });
  });
});
