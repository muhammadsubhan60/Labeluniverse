import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { blogPosts } from '../data/blogPosts';
import './Blog.css';

const getHeroByCategoryAndIntent = (category?: string, intent?: string, title?: string) => {
  const t = (title || '').toLowerCase();
  const i = (intent || '').toLowerCase();
  const c = (category || '').toLowerCase();
  if (t.includes(' vs ') || t.includes('compare') || t.includes('alternatives')) {
    return { hero: '/blog-assets/hero-carrier.svg', rule: 'title:compare' };
  }
  if (i === 'transactional' || i === 'commercial') {
    return { hero: '/blog-assets/hero-software.svg', rule: 'intent:commercial' };
  }
  if (i === 'informational' && (c.includes('operations') || c.includes('packaging') || c.includes('templates'))) {
    return { hero: '/blog-assets/hero-operations.svg', rule: 'intent+category:operations' };
  }
  if (c.includes('marketplace')) return { hero: '/blog-assets/hero-marketplace.svg', rule: 'category:marketplace' };
  if (c.includes('operations') || c.includes('packaging') || c.includes('templates')) {
    return { hero: '/blog-assets/hero-operations.svg', rule: 'category:operations' };
  }
  if (c.includes('usps') || c.includes('ups') || c.includes('cost')) {
    return { hero: '/blog-assets/hero-carrier.svg', rule: 'category:carrier' };
  }
  if (c.includes('software') || c.includes('analytics') || c.includes('strategy') || c.includes('tools')) {
    return { hero: '/blog-assets/hero-software.svg', rule: 'category:software' };
  }
  return { hero: '/blog-assets/labelflow-blog-hero.svg', rule: 'fallback:default' };
};

const BlogIndex: React.FC = () => {
  const [query, setQuery] = useState('');
  const [selectedIntent, setSelectedIntent] = useState('All');

  useEffect(() => {
    document.title = 'LabelFlow Blog | Shipping Tips for US Ecommerce Sellers';
    const meta = document.querySelector('meta[name="description"]');
    if (meta) {
      meta.setAttribute(
        'content',
        'Actionable shipping guides for ecommerce sellers: discounted labels, USPS and UPS comparisons, and cost-saving workflows.'
      );
    }
  }, []);

  const intents = useMemo(() => ['All', ...Array.from(new Set(blogPosts.map((p) => p.searchIntent)))], []);

  const filteredPosts = useMemo(() => {
    const q = query.trim().toLowerCase();
    return blogPosts.filter((post) => {
      const intentMatch = selectedIntent === 'All' || post.searchIntent === selectedIntent;
      const queryMatch =
        q.length === 0 ||
        post.title.toLowerCase().includes(q) ||
        post.targetKeyword.toLowerCase().includes(q) ||
        (post.category || '').toLowerCase().includes(q);
      return intentMatch && queryMatch;
    });
  }, [query, selectedIntent]);

  return (
    <div className="blog-shell">
      <div className="blog-container">
        <div style={{ marginBottom: '1rem' }}>
          <Link to="/" className="blog-back-link">
            {'<- Back to LabelFlow'}
          </Link>
        </div>

        <header className="blog-index-hero">
          <p style={{ color: '#93c5fd', fontWeight: 700, marginBottom: 8, letterSpacing: '0.04em' }}>
            LABELFLOW BLOG
          </p>
          <h1>
            Shipping Growth Playbooks for US Ecommerce Sellers
          </h1>
          <p style={{ color: '#dbeafe', marginTop: 10, maxWidth: 760, lineHeight: 1.65 }}>
            Practical content built for small-to-medium sellers who want lower shipping costs, better margins,
            and faster fulfillment operations.
          </p>
          <div className="blog-filter-row">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by keyword, title, or topic..."
              className="blog-input"
            />
            <select
              value={selectedIntent}
              onChange={(e) => setSelectedIntent(e.target.value)}
              className="blog-select"
            >
              {intents.map((intent) => (
                <option key={intent} value={intent}>
                  {intent}
                </option>
              ))}
            </select>
          </div>
        </header>

        <section className="blog-index-grid">
          {filteredPosts.map((post) => {
            const heroDecision = getHeroByCategoryAndIntent(post.category, post.searchIntent, post.title);
            return (
            <article key={post.slug} className="blog-card">
              <img
                src={heroDecision.hero}
                alt={post.heroAlt}
                className="blog-card-image"
                loading="lazy"
              />
              {process.env.NODE_ENV !== 'production' ? (
                <div className="hero-debug-chip">
                  {heroDecision.rule}
                </div>
              ) : null}
              <div className="blog-card-body">
                <div className="chip-row">
                  <span className="chip">{post.searchIntent}</span>
                  <span className="chip chip-muted">{post.readMinutes} min read</span>
                  {post.category ? <span className="chip chip-muted">{post.category}</span> : null}
                  <span className="chip chip-muted">{post.targetKeyword}</span>
                </div>
                <h2 style={{ margin: '0 0 8px', fontSize: '1.2rem', lineHeight: 1.3 }}>
                  <Link to={`/blog/${post.slug}`} style={{ textDecoration: 'none', color: '#0F172A' }}>
                    {post.title}
                  </Link>
                </h2>
                <p style={{ margin: 0, color: '#475569', lineHeight: 1.6 }}>{post.metaDescription}</p>
              </div>
            </article>
            );
          })}
          {filteredPosts.length === 0 ? (
            <p style={{ margin: 0, color: '#64748B' }}>No posts match your current filter.</p>
          ) : null}
        </section>
      </div>
    </div>
  );
};

export default BlogIndex;
