<?php
/**
 * The main template file
 *
 * This is the most generic template file in a WordPress theme
 * and one of the two required files for a theme (the other being style.css).
 *
 * @package Custom_Theme
 */

get_header(); ?>

<div class="container">
    <main id="primary" class="site-main">
        <?php
        if ( have_posts() ) :
            
            if ( is_home() && ! is_front_page() ) :
                ?>
                <header>
                    <h1 class="page-title screen-reader-text"><?php single_post_title(); ?></h1>
                </header>
                <?php
            endif;

            /* Start the Loop */
            while ( have_posts() ) :
                the_post();

                ?>
                <article id="post-<?php the_ID(); ?>" <?php post_class(); ?>>
                    <header class="entry-header">
                        <?php
                        if ( is_singular() ) :
                            the_title( '<h1 class="entry-title">', '</h1>' );
                        else :
                            the_title( '<h2 class="entry-title"><a href="' . esc_url( get_permalink() ) . '" rel="bookmark">', '</a></h2>' );
                        endif;
                        ?>
                        
                        <div class="entry-meta">
                            <?php
                            printf(
                                esc_html__( 'Posted on %s by %s', 'custom-theme' ),
                                '<time datetime="' . esc_attr( get_the_date( DATE_W3C ) ) . '">' . esc_html( get_the_date() ) . '</time>',
                                '<a href="' . esc_url( get_author_posts_url( get_the_author_meta( 'ID' ) ) ) . '">' . esc_html( get_the_author() ) . '</a>'
                            );
                            ?>
                        </div>
                    </header>

                    <div class="entry-content">
                        <?php
                        if ( is_singular() ) :
                            the_content();
                        else :
                            the_excerpt();
                        endif;

                        wp_link_pages(
                            array(
                                'before' => '<div class="page-links">' . esc_html__( 'Pages:', 'custom-theme' ),
                                'after'  => '</div>',
                            )
                        );
                        ?>
                    </div>

                    <?php if ( ! is_singular() ) : ?>
                        <footer class="entry-footer">
                            <a href="<?php the_permalink(); ?>" class="read-more">
                                <?php esc_html_e( 'Continue reading', 'custom-theme' ); ?>
                            </a>
                        </footer>
                    <?php endif; ?>
                </article>
                <?php

            endwhile;

            the_posts_navigation();

        else :
            ?>
            <p><?php esc_html_e( 'Sorry, no posts matched your criteria.', 'custom-theme' ); ?></p>
            <?php
        endif;
        ?>
    </main><!-- #main -->
</div><!-- .container -->

<?php
get_sidebar();
get_footer();