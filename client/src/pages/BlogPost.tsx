import React, { useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { blogPostMap, blogPosts } from '../data/blogPosts';
import './Blog.css';

const upsertMetaTag = (selector: string, attrs: Record<string, string>) => {
  let el = document.head.querySelector(selector) as HTMLMetaElement | null;
  if (!el) {
    el = document.createElement('meta');
    document.head.appendChild(el);
  }
  Object.entries(attrs).forEach(([key, value]) => el!.setAttribute(key, value));
};

const upsertCanonical = (href: string) => {
  let canonical = document.head.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
  if (!canonical) {
    canonical = document.createElement('link');
    canonical.setAttribute('rel', 'canonical');
    document.head.appendChild(canonical);
  }
  canonical.setAttribute('href', href);
};

const resolveVisualType = (category?: string, heading?: string): 'process' | 'compare' | 'chart' | 'table' => {
  const hay = `${category || ''} ${heading || ''}`.toLowerCase();
  if (hay.includes('compare') || hay.includes('vs') || hay.includes('alternatives')) return 'compare';
  if (hay.includes('kpi') || hay.includes('cost') || hay.includes('analytics') || hay.includes('rates')) return 'chart';
  if (hay.includes('template') || hay.includes('checklist') || hay.includes('table')) return 'table';
  return 'process';
};

const visualPathMap = {
  process: '/blog-assets/visual-process.svg',
  compare: '/blog-assets/visual-compare.svg',
  chart: '/blog-assets/visual-chart.svg',
  table: '/blog-assets/visual-table.svg',
} as const;

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
  return { hero: '/blog-assets/LABELUNIVERSE-blog-hero.svg', rule: 'fallback:default' };
};

const BlogPost: React.FC = () => {
  const { slug } = useParams<{ slug: string }>();
  const post = slug ? blogPostMap.get(slug) : undefined;
  const [progress, setProgress] = useState(0);
  const [doneItems, setDoneItems] = useState<string[]>([]);
  const [briefCopied, setBriefCopied] = useState(false);

  useEffect(() => {
    if (!post) return;
    document.title = `${post.title} | LABELUNIVERSE Blog`;
    const origin = window.location.origin;
    const url = `${origin}/blog/${post.slug}`;
    const imageUrl = `${origin}/og-LABELUNIVERSE-blog.png`;

    upsertMetaTag('meta[name="description"]', { name: 'description', content: post.metaDescription });
    upsertMetaTag('meta[property="og:type"]', { property: 'og:type', content: 'article' });
    upsertMetaTag('meta[property="og:title"]', { property: 'og:title', content: post.title });
    upsertMetaTag('meta[property="og:description"]', { property: 'og:description', content: post.metaDescription });
    upsertMetaTag('meta[property="og:url"]', { property: 'og:url', content: url });
    upsertMetaTag('meta[property="og:image"]', { property: 'og:image', content: imageUrl });
    upsertMetaTag('meta[name="twitter:card"]', { name: 'twitter:card', content: 'summary_large_image' });
    upsertMetaTag('meta[name="twitter:title"]', { name: 'twitter:title', content: post.title });
    upsertMetaTag('meta[name="twitter:description"]', { name: 'twitter:description', content: post.metaDescription });
    upsertMetaTag('meta[name="twitter:image"]', { name: 'twitter:image', content: imageUrl });
    upsertCanonical(url);

    let schemaScript = document.getElementById('blog-article-schema') as HTMLScriptElement | null;
    if (!schemaScript) {
      schemaScript = document.createElement('script');
      schemaScript.id = 'blog-article-schema';
      schemaScript.type = 'application/ld+json';
      document.head.appendChild(schemaScript);
    }

    const articleSchema = {
      '@context': 'https://schema.org',
      '@type': 'Article',
      headline: post.title,
      description: post.metaDescription,
      datePublished: post.publishedAt,
      dateModified: post.publishedAt,
      author: {
        '@type': 'Organization',
        name: 'LABELUNIVERSE',
      },
      publisher: {
        '@type': 'Organization',
        name: 'LABELUNIVERSE',
      },
      mainEntityOfPage: url,
    };

    const faqSchema = {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: post.faqs.map((faq) => ({
        '@type': 'Question',
        name: faq.question,
        acceptedAnswer: {
          '@type': 'Answer',
          text: faq.answer,
        },
      })),
    };

    schemaScript.textContent = JSON.stringify([articleSchema, faqSchema]);
  }, [post]);

  useEffect(() => {
    const onScroll = () => {
      const total = document.documentElement.scrollHeight - window.innerHeight;
      if (total <= 0) {
        setProgress(0);
        return;
      }
      setProgress(Math.min(100, Math.max(0, (window.scrollY / total) * 100)));
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const actionItems = useMemo(() => {
    const firstBullets = (post?.sections || [])
      .flatMap((s) => s.bullets || [])
      .slice(0, 5);
    if (firstBullets.length > 0) return firstBullets;
    return [
      'Audit top shipment profiles from the last 30 days.',
      'Compare USPS and UPS rates for each profile.',
      'Set default service rules by package type.',
      'Track weekly cost per order and iterate.',
    ];
  }, [post]);

  useEffect(() => {
    if (!post) return;
    const key = `LABELUNIVERSE_blog_checklist_${post.slug}`;
    try {
      const raw = localStorage.getItem(key);
      setDoneItems(raw ? JSON.parse(raw) : []);
    } catch {
      setDoneItems([]);
    }
  }, [post]);

  const toggleAction = (item: string) => {
    if (!post) return;
    const key = `LABELUNIVERSE_blog_checklist_${post.slug}`;
    setDoneItems((prev) => {
      const next = prev.includes(item) ? prev.filter((x) => x !== item) : [...prev, item];
      localStorage.setItem(key, JSON.stringify(next));
      return next;
    });
  };

  const relatedPosts = post
    ? blogPosts
        .filter((candidate) => candidate.slug !== post.slug && candidate.searchIntent === post.searchIntent)
        .slice(0, 3)
    : [];
  const tocItems = useMemo(
    () =>
      (post?.sections || []).map((section) => ({
        id: section.heading.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
        label: section.heading,
      })),
    [post]
  );
  const heroDecision = getHeroByCategoryAndIntent(post?.category, post?.searchIntent, post?.title);
  if (!post) return <Navigate to="/blog" replace />;
  const checklistProgress = Math.round((doneItems.length / Math.max(actionItems.length, 1)) * 100);
  const strategyBrief = `Title: ${post.title}
Primary keyword: ${post.targetKeyword}
Intent: ${post.searchIntent}
Quick win actions:
${actionItems.map((item, idx) => `${idx + 1}. ${item}`).join('\n')}`;

  const copyStrategyBrief = async () => {
    try {
      await navigator.clipboard.writeText(strategyBrief);
      setBriefCopied(true);
      window.setTimeout(() => setBriefCopied(false), 1400);
    } catch {
      setBriefCopied(false);
    }
  };

  return (
    <div className="blog-shell">
      <div className="blog-progress" style={{ width: `${progress}%` }} />
      <article className="blog-container article-wrap">
        <div style={{ padding: '1rem 0 0' }}>
          <Link to="/blog" className="blog-back-link">
            {'<- Back to Blog'}
          </Link>
        </div>

        <header className="article-hero">
          <img src={heroDecision.hero} alt={post.heroAlt} />
          <div className="article-hero-overlay" />
          {process.env.NODE_ENV !== 'production' ? (
            <div className="hero-debug-chip">{heroDecision.rule}</div>
          ) : null}
          <div className="article-hero-content">
            <div className="chip-row">
              <span className="chip">{post.searchIntent}</span>
              <span className="chip chip-muted">{post.targetKeyword}</span>
              <span className="chip chip-muted">{post.readMinutes} min read</span>
            </div>
            <h1 style={{ margin: '0 0 6px', lineHeight: 1.12 }}>{post.title}</h1>
            <p style={{ margin: 0, lineHeight: 1.6, color: '#dbeafe', maxWidth: 900 }}>{post.metaDescription}</p>
          </div>
        </header>

        <div className="article-content">
        <div className="article-meta-row">
          <span className="article-meta-pill">By LABELUNIVERSE Editorial Team</span>
          <span className="article-meta-pill">Published {post.publishedAt}</span>
          <span className="article-meta-pill">{post.readMinutes} min read</span>
        </div>
        <section className="innovation-panel">
          <div className="innovation-head">
            <div>
              <h2>Executive Brief</h2>
              <p>Fast-tracked action block for operators who want results, not long reading loops.</p>
            </div>
            <button className="brief-copy-btn" onClick={copyStrategyBrief}>
              {briefCopied ? 'Copied' : 'Copy Strategy Brief'}
            </button>
          </div>
          <div className="innovation-grid">
            <div className="innovation-card">
              <h3>What this article helps you do</h3>
              <p>{post.metaDescription}</p>
              <div className="chip-row" style={{ marginTop: 8 }}>
                <span className="chip">{post.searchIntent}</span>
                <span className="chip chip-muted">{post.targetKeyword}</span>
                <span className="chip chip-muted">{post.estimatedWordCount} words</span>
              </div>
            </div>
            <div className="innovation-card">
              <h3>Implementation Checklist ({checklistProgress}%)</h3>
              <div className="checklist-progress-track">
                <div className="checklist-progress-fill" style={{ width: `${checklistProgress}%` }} />
              </div>
              <ul className="action-list">
                {actionItems.map((item) => (
                  <li key={item}>
                    <label>
                      <input
                        type="checkbox"
                        checked={doneItems.includes(item)}
                        onChange={() => toggleAction(item)}
                      />
                      <span>{item}</span>
                    </label>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>
        <div className="article-layout">
        <div className="article-main">
        {post.intro.map((p) => (
          <p key={p} style={{ color: '#1E293B', lineHeight: 1.75 }}>
            {p}
          </p>
        ))}

        {post.sections.map((section, idx) => {
          const visualType = resolveVisualType(post.category, section.heading);
          const visualPath = visualPathMap[visualType];
          return (
          <section
            key={section.heading}
            id={section.heading.toLowerCase().replace(/[^a-z0-9]+/g, '-')}
            className="article-section"
            style={{ marginTop: 24, scrollMarginTop: 18 }}
          >
            <h2 style={{ color: '#0F172A', marginBottom: 10 }}>{section.heading}</h2>
            {section.paragraphs?.map((p) => (
              <p key={p} style={{ color: '#334155', lineHeight: 1.75 }}>
                {p}
              </p>
            ))}
            {section.bullets && (
              <ul style={{ color: '#334155', lineHeight: 1.75, paddingLeft: 22 }}>
                {section.bullets.map((bullet) => (
                  <li key={bullet} style={{ marginBottom: 6 }}>
                    {bullet}
                  </li>
                ))}
              </ul>
            )}
            {idx % 2 === 0 ? (
              <figure className={`article-visual visual-${visualType}`}>
                <img src={visualPath} alt={`${section.heading} ${visualType} visual`} loading="lazy" />
                <figcaption>
                  {visualType.toUpperCase()} visual: {section.heading} for US ecommerce shipping operations.
                </figcaption>
              </figure>
            ) : null}
          </section>
          );
        })}

        <section style={{ marginTop: 22 }}>
          <h2>Quick Decision Table</h2>
          <div className="corporate-table-wrap">
            <table className="corporate-table">
              <thead>
                <tr>
                  <th>Scenario</th>
                  <th>Recommended Action</th>
                  <th>Why It Matters</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>High shipping spend week</td>
                  <td>Re-check rate comparisons by profile</td>
                  <td>Keeps carrier defaults aligned to current pricing</td>
                </tr>
                <tr>
                  <td>Frequent DIM adjustments</td>
                  <td>Right-size packaging and presets</td>
                  <td>Prevents avoidable billed-weight increases</td>
                </tr>
                <tr>
                  <td>Late-day fulfillment rush</td>
                  <td>Use batch printing workflow</td>
                  <td>Reduces handling time and manual errors</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section style={{ marginTop: 26 }}>
          <h2 style={{ color: '#0F172A', marginBottom: 10 }}>FAQ</h2>
          {post.faqs.map((faq) => (
            <details
              key={faq.question}
              className="faq-item"
              style={{ padding: '0.75rem 0.9rem' }}
            >
              <summary style={{ fontWeight: 700, cursor: 'pointer', color: '#0F172A' }}>{faq.question}</summary>
              <p style={{ color: '#475569', lineHeight: 1.7, marginBottom: 0 }}>{faq.answer}</p>
            </details>
          ))}
        </section>

        <section style={{ marginTop: 26 }}>
          <h2 style={{ color: '#0F172A', marginBottom: 10 }}>Recommended links</h2>
          <h3 style={{ color: '#1E293B', fontSize: '1rem', marginBottom: 8 }}>Internal</h3>
          <ul style={{ paddingLeft: 22, marginTop: 0 }}>
            {post.internalLinks.map((link) => (
              <li key={link.label} style={{ marginBottom: 6 }}>
                <Link to={link.href} style={{ color: '#2563EB', textDecoration: 'none' }}>
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>

          <h3 style={{ color: '#1E293B', fontSize: '1rem', marginBottom: 8 }}>Authority sources</h3>
          <ul style={{ paddingLeft: 22, marginTop: 0 }}>
            {post.externalLinks.map((link) => (
              <li key={link.label} style={{ marginBottom: 6 }}>
                <a href={link.href} target="_blank" rel="noreferrer" style={{ color: '#2563EB', textDecoration: 'none' }}>
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
        </section>

        <section style={{ marginTop: 26 }}>
          <h2 style={{ color: '#0F172A', marginBottom: 10 }}>Visual Content Pack</h2>
          <ul style={{ color: '#334155', lineHeight: 1.75, paddingLeft: 22, marginTop: 0 }}>
            <li>
              Hero image concept: modern ecommerce shipping desk with carrier comparison UI focused on{' '}
              <strong>{post.targetKeyword}</strong>.
            </li>
            <li>Alt text: {post.heroAlt}</li>
            <li>
              Supporting infographic: decision flow (weight {'->'} dimensions {'->'} zone {'->'} best carrier/service).
            </li>
            <li>
              Social preview card: 1200x630 with headline "{post.title}" and LABELUNIVERSE blue accents.
            </li>
            <li>
              SEO filename suggestion: {post.slug}-LABELUNIVERSE-us-{post.publishedAt.replaceAll('-', '')}.webp
            </li>
          </ul>
        </section>

        <section className="cta-panel">
          <h2 style={{ margin: '0 0 8px', color: '#1E3A8A' }}>Ready to reduce shipping costs?</h2>
          <p style={{ margin: '0 0 10px', color: '#1E40AF', lineHeight: 1.7 }}>{post.cta}</p>
          <Link
            to="/signup"
            style={{
              display: 'inline-block',
              background: '#2563EB',
              color: '#fff',
              textDecoration: 'none',
              fontWeight: 700,
              borderRadius: 8,
              padding: '0.55rem 0.9rem',
            }}
          >
            Start free
          </Link>
        </section>

        {relatedPosts.length > 0 ? (
          <section style={{ marginTop: 26 }}>
            <h2 style={{ color: '#0F172A', marginBottom: 10 }}>Related articles</h2>
            <ul style={{ margin: 0, paddingLeft: 22 }}>
              {relatedPosts.map((related) => (
                <li key={related.slug} style={{ marginBottom: 8 }}>
                  <Link to={`/blog/${related.slug}`} style={{ color: '#2563EB', textDecoration: 'none' }}>
                    {related.title}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        </div>
        <aside className="article-toc">
          <h3>On this page</h3>
          <ul>
            {tocItems.map((item) => (
              <li key={item.id}>
                <a href={`#${item.id}`}>{item.label}</a>
              </li>
            ))}
          </ul>
        </aside>
        </div>
        </div>
      </article>
    </div>
  );
};

export default BlogPost;
