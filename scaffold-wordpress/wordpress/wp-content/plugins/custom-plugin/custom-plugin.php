<?php
/**
 * Plugin Name: Custom Plugin
 * Plugin URI: https://example.com/custom-plugin
 * Description: A custom WordPress plugin created with Dyad
 * Version: 1.0.0
 * Author: Your Name
 * Author URI: https://example.com
 * License: GPL v2 or later
 * License URI: https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain: custom-plugin
 * Domain Path: /languages
 */

// Prevent direct access
if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

// Define plugin constants
define( 'CUSTOM_PLUGIN_VERSION', '1.0.0' );
define( 'CUSTOM_PLUGIN_PATH', plugin_dir_path( __FILE__ ) );
define( 'CUSTOM_PLUGIN_URL', plugin_dir_url( __FILE__ ) );

/**
 * Plugin activation hook
 */
register_activation_hook( __FILE__, 'custom_plugin_activate' );
function custom_plugin_activate() {
    // Create database tables or set default options
    add_option( 'custom_plugin_version', CUSTOM_PLUGIN_VERSION );
    
    // Flush rewrite rules
    flush_rewrite_rules();
}

/**
 * Plugin deactivation hook
 */
register_deactivation_hook( __FILE__, 'custom_plugin_deactivate' );
function custom_plugin_deactivate() {
    // Clean up temporary data
    flush_rewrite_rules();
}

/**
 * Load plugin text domain for translations
 */
add_action( 'plugins_loaded', 'custom_plugin_load_textdomain' );
function custom_plugin_load_textdomain() {
    load_plugin_textdomain( 'custom-plugin', false, dirname( plugin_basename( __FILE__ ) ) . '/languages' );
}

/**
 * Enqueue plugin scripts and styles
 */
add_action( 'wp_enqueue_scripts', 'custom_plugin_enqueue_scripts' );
function custom_plugin_enqueue_scripts() {
    // Enqueue CSS
    wp_enqueue_style( 
        'custom-plugin-style', 
        CUSTOM_PLUGIN_URL . 'assets/css/style.css', 
        array(), 
        CUSTOM_PLUGIN_VERSION 
    );
    
    // Enqueue JavaScript
    wp_enqueue_script( 
        'custom-plugin-script', 
        CUSTOM_PLUGIN_URL . 'assets/js/script.js', 
        array( 'jquery' ), 
        CUSTOM_PLUGIN_VERSION, 
        true 
    );
    
    // Localize script with data
    wp_localize_script( 'custom-plugin-script', 'custom_plugin_ajax', array(
        'ajax_url' => admin_url( 'admin-ajax.php' ),
        'nonce' => wp_create_nonce( 'custom_plugin_nonce' )
    ) );
}

/**
 * Add admin menu
 */
add_action( 'admin_menu', 'custom_plugin_admin_menu' );
function custom_plugin_admin_menu() {
    add_menu_page(
        __( 'Custom Plugin', 'custom-plugin' ),
        __( 'Custom Plugin', 'custom-plugin' ),
        'manage_options',
        'custom-plugin',
        'custom_plugin_admin_page',
        'dashicons-admin-generic',
        30
    );
}

/**
 * Admin page callback
 */
function custom_plugin_admin_page() {
    ?>
    <div class="wrap">
        <h1><?php echo esc_html( get_admin_page_title() ); ?></h1>
        <p><?php _e( 'Welcome to your custom plugin settings page!', 'custom-plugin' ); ?></p>
        
        <form method="post" action="options.php">
            <?php
            // Output security fields
            settings_fields( 'custom_plugin_settings' );
            
            // Output setting sections and fields
            do_settings_sections( 'custom_plugin_settings' );
            
            // Submit button
            submit_button();
            ?>
        </form>
    </div>
    <?php
}

/**
 * Register settings
 */
add_action( 'admin_init', 'custom_plugin_register_settings' );
function custom_plugin_register_settings() {
    register_setting( 'custom_plugin_settings', 'custom_plugin_option' );
    
    add_settings_section(
        'custom_plugin_main_section',
        __( 'Main Settings', 'custom-plugin' ),
        'custom_plugin_main_section_callback',
        'custom_plugin_settings'
    );
    
    add_settings_field(
        'custom_plugin_field',
        __( 'Custom Field', 'custom-plugin' ),
        'custom_plugin_field_callback',
        'custom_plugin_settings',
        'custom_plugin_main_section'
    );
}

function custom_plugin_main_section_callback() {
    echo '<p>' . __( 'Configure your plugin settings below.', 'custom-plugin' ) . '</p>';
}

function custom_plugin_field_callback() {
    $option = get_option( 'custom_plugin_option' );
    ?>
    <input type="text" 
           name="custom_plugin_option" 
           value="<?php echo esc_attr( $option ); ?>" 
           class="regular-text" />
    <?php
}

/**
 * Add a simple shortcode
 */
add_shortcode( 'custom_plugin_hello', 'custom_plugin_hello_shortcode' );
function custom_plugin_hello_shortcode( $atts ) {
    $atts = shortcode_atts( array(
        'name' => 'World'
    ), $atts );
    
    return sprintf( 
        '<div class="custom-plugin-hello">%s</div>', 
        esc_html__( 'Hello, ', 'custom-plugin' ) . esc_html( $atts['name'] ) . '!' 
    );
}

/**
 * AJAX handler example
 */
add_action( 'wp_ajax_custom_plugin_action', 'custom_plugin_ajax_handler' );
add_action( 'wp_ajax_nopriv_custom_plugin_action', 'custom_plugin_ajax_handler' );
function custom_plugin_ajax_handler() {
    // Verify nonce
    if ( ! wp_verify_nonce( $_POST['nonce'], 'custom_plugin_nonce' ) ) {
        wp_die( __( 'Security check failed', 'custom-plugin' ) );
    }
    
    // Process AJAX request
    $response = array(
        'success' => true,
        'message' => __( 'AJAX request processed successfully!', 'custom-plugin' )
    );
    
    wp_send_json( $response );
}

// Include additional plugin files
require_once CUSTOM_PLUGIN_PATH . 'includes/class-custom-plugin.php';