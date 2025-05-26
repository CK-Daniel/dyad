<?php
/**
 * The template for displaying the footer
 *
 * @package Custom_Theme
 */
?>

    <footer id="colophon" class="site-footer">
        <div class="container">
            <div class="site-info">
                <?php
                /* translators: 1: Theme name, 2: Theme author. */
                printf( esc_html__( 'Theme: %1$s by %2$s.', 'custom-theme' ), 'Custom Theme', '<a href="https://dyad.sh">Dyad</a>' );
                ?>
                <span class="sep"> | </span>
                <?php
                /* translators: %s: CMS name, i.e. WordPress. */
                printf( esc_html__( 'Proudly powered by %s', 'custom-theme' ), '<a href="https://wordpress.org/">WordPress</a>' );
                ?>
            </div><!-- .site-info -->
        </div><!-- .container -->
    </footer><!-- #colophon -->
</div><!-- #page -->

<?php wp_footer(); ?>

</body>
</html>