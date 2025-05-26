<?php
/**
 * Main plugin class
 *
 * @package CustomPlugin
 */

// Prevent direct access
if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

/**
 * Main Custom Plugin Class
 */
class Custom_Plugin {
    
    /**
     * Single instance of the class
     *
     * @var Custom_Plugin
     */
    protected static $instance = null;
    
    /**
     * Main Custom_Plugin Instance
     *
     * Ensures only one instance of Custom_Plugin is loaded or can be loaded.
     *
     * @return Custom_Plugin - Main instance
     */
    public static function instance() {
        if ( is_null( self::$instance ) ) {
            self::$instance = new self();
        }
        return self::$instance;
    }
    
    /**
     * Constructor
     */
    public function __construct() {
        $this->init_hooks();
    }
    
    /**
     * Hook into actions and filters
     */
    private function init_hooks() {
        add_action( 'init', array( $this, 'init' ) );
    }
    
    /**
     * Init the plugin after WordPress has loaded
     */
    public function init() {
        // Initialize plugin functionality here
        $this->register_post_types();
        $this->register_taxonomies();
    }
    
    /**
     * Register custom post types
     */
    private function register_post_types() {
        // Example custom post type
        register_post_type( 'custom_item', array(
            'labels' => array(
                'name'               => __( 'Custom Items', 'custom-plugin' ),
                'singular_name'      => __( 'Custom Item', 'custom-plugin' ),
                'add_new'           => __( 'Add New', 'custom-plugin' ),
                'add_new_item'      => __( 'Add New Item', 'custom-plugin' ),
                'edit_item'         => __( 'Edit Item', 'custom-plugin' ),
                'new_item'          => __( 'New Item', 'custom-plugin' ),
                'view_item'         => __( 'View Item', 'custom-plugin' ),
                'search_items'      => __( 'Search Items', 'custom-plugin' ),
                'not_found'         => __( 'No items found', 'custom-plugin' ),
                'not_found_in_trash' => __( 'No items found in trash', 'custom-plugin' ),
            ),
            'public'             => true,
            'publicly_queryable' => true,
            'show_ui'           => true,
            'show_in_menu'      => true,
            'query_var'         => true,
            'rewrite'           => array( 'slug' => 'custom-items' ),
            'capability_type'   => 'post',
            'has_archive'       => true,
            'hierarchical'      => false,
            'menu_position'     => null,
            'supports'          => array( 'title', 'editor', 'thumbnail', 'excerpt' ),
            'menu_icon'         => 'dashicons-star-filled',
        ) );
    }
    
    /**
     * Register custom taxonomies
     */
    private function register_taxonomies() {
        // Example custom taxonomy
        register_taxonomy( 'custom_category', 'custom_item', array(
            'labels' => array(
                'name'              => __( 'Item Categories', 'custom-plugin' ),
                'singular_name'     => __( 'Item Category', 'custom-plugin' ),
                'search_items'      => __( 'Search Categories', 'custom-plugin' ),
                'all_items'         => __( 'All Categories', 'custom-plugin' ),
                'parent_item'       => __( 'Parent Category', 'custom-plugin' ),
                'parent_item_colon' => __( 'Parent Category:', 'custom-plugin' ),
                'edit_item'         => __( 'Edit Category', 'custom-plugin' ),
                'update_item'       => __( 'Update Category', 'custom-plugin' ),
                'add_new_item'      => __( 'Add New Category', 'custom-plugin' ),
                'new_item_name'     => __( 'New Category Name', 'custom-plugin' ),
                'menu_name'         => __( 'Categories', 'custom-plugin' ),
            ),
            'hierarchical' => true,
            'show_ui'      => true,
            'show_admin_column' => true,
            'query_var'    => true,
            'rewrite'      => array( 'slug' => 'item-category' ),
        ) );
    }
}

// Initialize the plugin
Custom_Plugin::instance();