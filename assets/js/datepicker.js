'use strict';
$(document).ready(function() {
  // Initialize the date picker
  $('.date-picker').each(function(){
    $(this).datepicker({
      templates: {
        leftArrow: '<i class="fa-solid fa-angle-left"></i>',
        rightArrow: '<i class="fa-solid fa-angle-right"></i>'
      },
      orientation: "bottom left"
    }).on('show', function() {
      $('.datepicker').addClass('open');
      const datepicker_color = $(this).data('datepicker-color');
      if (datepicker_color && datepicker_color.length !== 0) {
        $('.datepicker').addClass('datepicker-' + datepicker_color);
      }
    }).on('hide', function() {
      $('.datepicker').removeClass('open');
    });
  });

  // Set today's date for the example datepicker specifically
  const exampleDatepicker1 = $('#exampleDatepicker1');
  if (exampleDatepicker1.length) {
    const today = new Date();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    const year = today.getFullYear();
    const formattedDate = `${month}/${day}/${year}`;
    exampleDatepicker1.datepicker('update', formattedDate);
  }
  const exampleDatepicker2 = $('#exampleDatepicker2');
  if (exampleDatepicker2.length) {
    const today = new Date();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    const year = today.getFullYear();
    const formattedDate = `${month}/${day}/${year}`;
    exampleDatepicker2.datepicker('update', formattedDate);
  }
});
