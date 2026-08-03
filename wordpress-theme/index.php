<?php
/**
 * 最小主题入口 — 此主题提供的是后端功能而非前端样式。
 * 如需自定义前端页面，请创建子主题。
 */
get_header();
echo '<p>' . esc_html__('此主题不提供前端页面，请使用子主题或搭配 Astro 前端使用。', 'astropress-bridge') . '</p>';
get_footer();
