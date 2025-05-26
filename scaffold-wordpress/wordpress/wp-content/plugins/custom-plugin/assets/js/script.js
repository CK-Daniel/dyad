/**
 * Custom Plugin JavaScript
 */

(function($) {
    'use strict';
    
    $(document).ready(function() {
        // Example AJAX request
        $('.custom-plugin-button').on('click', function(e) {
            e.preventDefault();
            
            var $button = $(this);
            $button.prop('disabled', true);
            
            $.ajax({
                url: custom_plugin_ajax.ajax_url,
                type: 'POST',
                data: {
                    action: 'custom_plugin_action',
                    nonce: custom_plugin_ajax.nonce
                },
                success: function(response) {
                    if (response.success) {
                        alert(response.message);
                    }
                },
                error: function() {
                    alert('An error occurred');
                },
                complete: function() {
                    $button.prop('disabled', false);
                }
            });
        });
    });
    
})(jQuery);