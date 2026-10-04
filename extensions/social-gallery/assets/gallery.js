(() => {
  if (customElements.get('social-gallery')) return;
  const el = (tag, text, css) => { const e = document.createElement(tag); if (text) e.textContent = text; if (css) e.className = css; return e; };
  const socialURL = value => { try { const u = new URL(value); return u.protocol === 'https:' && ['instagram.com', 'facebook.com', 'fb.com'].some(d => u.hostname === d || u.hostname.endsWith('.' + d)) ? u.href : ''; } catch { return ''; } };
  class Gallery extends HTMLElement {
    connectedCallback() { this.load(); }
    disconnectedCallback() { this.abort?.abort(); this.clearCarousel(); }
    clearCarousel() {
      this.events?.abort();
      this.resize?.disconnect();
      cancelAnimationFrame(this.frame);
      const controls = this.querySelector('.sg-controls');
      if (controls) controls.hidden = true;
    }
    setupCarousel(grid) {
      this.events = new AbortController();
      const { signal } = this.events;
      let controls = this.querySelector('.sg-controls');
      if (!controls) {
        controls = el('div', '', 'sg-controls');
        for (const [direction, symbol] of [['previous', '←'], ['next', '→']]) {
          const button = el('button', '', `sg-arrow sg-${direction}`);
          button.type = 'button';
          button.setAttribute('aria-label', this.dataset[direction] || (direction === 'previous' ? 'Previous posts' : 'Next posts'));
          const icon = el('span', symbol); icon.setAttribute('aria-hidden', 'true'); button.append(icon);
          controls.append(button);
        }
        const position = el('p', '', 'sg-position');
        position.setAttribute('role', 'status'); position.setAttribute('aria-live', 'polite'); position.setAttribute('aria-atomic', 'true');
        controls.insertBefore(position, controls.lastElementChild);
        this.append(controls);
      }
      grid.setAttribute('role', 'region');
      grid.setAttribute('aria-roledescription', this.dataset.carousel || 'carousel');
      if (!grid.hasAttribute('aria-labelledby')) grid.setAttribute('aria-label', this.querySelector('h2')?.textContent || 'Social gallery');
      const previous = controls.querySelector('.sg-previous'), next = controls.querySelector('.sg-next'), position = controls.querySelector('.sg-position');
      const geometry = () => {
        const gap = parseFloat(getComputedStyle(grid).columnGap) || 0;
        const step = grid.firstElementChild.getBoundingClientRect().width + gap;
        return { gap, step, max: Math.max(0, grid.scrollWidth - grid.clientWidth), sign: getComputedStyle(grid).direction === 'rtl' ? -1 : 1 };
      };
      const update = () => {
        const { step, gap, max } = geometry();
        const offset = Math.min(max, Math.abs(grid.scrollLeft));
        const total = grid.children.length;
        const first = Math.min(total, Math.round(offset / Math.max(1, step)) + 1);
        const visible = Math.max(1, Math.round((grid.clientWidth + gap) / Math.max(1, step)));
        const last = Math.min(total, first + visible - 1);
        controls.hidden = max <= 2;
        grid.tabIndex = max <= 2 ? -1 : 0;
        previous.disabled = offset <= 2;
        next.disabled = offset >= max - 2;
        const template = first === last ? this.dataset.positionSingle || '__FIRST__ of __TOTAL__' : this.dataset.position || '__FIRST__–__LAST__ of __TOTAL__';
        const label = template.replaceAll('__FIRST__', first).replaceAll('__LAST__', last).replaceAll('__TOTAL__', total);
        if (position.textContent !== label) position.textContent = label;
      };
      const go = direction => {
        const { step, max, sign } = geometry();
        const current = Math.abs(grid.scrollLeft);
        const offset = direction === 'start' ? 0 : direction === 'end' ? max : current + direction * step;
        grid.scrollTo({ left: sign * Math.max(0, Math.min(max, offset)), behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
      };
      previous.addEventListener('click', () => go(-1), { signal });
      next.addEventListener('click', () => go(1), { signal });
      grid.addEventListener('keydown', event => {
        if (event.target !== grid || event.altKey || event.ctrlKey || event.metaKey) return;
        const { sign } = geometry();
        const direction = { ArrowLeft: -sign, ArrowRight: sign, Home: 'start', End: 'end' }[event.key];
        if (direction === undefined) return;
        event.preventDefault(); go(direction);
      }, { signal });
      grid.addEventListener('scroll', () => {
        cancelAnimationFrame(this.frame); this.frame = requestAnimationFrame(update);
      }, { passive: true, signal });
      this.resize = new ResizeObserver(update); this.resize.observe(grid);
      grid.scrollLeft = 0;
      update();
    }
    async load() {
      this.abort?.abort(); this.abort = new AbortController();
      const { signal } = this.abort;
      this.clearCarousel();
      const message = this.querySelector('.sg-message'), grid = this.querySelector('.sg-grid');
      if (!message || !grid) return;
      try {
        const url = new URL(this.dataset.endpoint, location.origin);
        if (url.origin !== location.origin) throw new Error('Invalid gallery URL');
        url.searchParams.set('limit', this.dataset.limit || '12');
        url.searchParams.set('platform', this.dataset.platform || 'all');
        url.searchParams.set('product', this.dataset.product || '');
        const response = await fetch(url, { signal, credentials: 'same-origin' });
        if (!response.ok) throw new Error('Gallery unavailable');
        const { posts } = await response.json();
        if (signal.aborted) return;
        grid.replaceChildren();
        if (!Array.isArray(posts) || !posts.length) {
          if (this.dataset.designMode === 'true') { this.hidden = false; message.textContent = this.dataset.empty; message.hidden = false; }
          else this.hidden = true;
          return;
        }
        this.hidden = false; message.hidden = true;
        for (const post of posts.slice(0, 48)) {
          const card = el('article', '', 'sg-card');
          if (post.image) {
            const img = el('img', '', 'sg-image'); img.src = post.image; img.alt = this.dataset.photo || ''; img.loading = 'lazy'; img.decoding = 'async'; img.width = 600; img.height = 600;
            img.addEventListener('error', () => img.remove(), { once: true }); card.append(img);
          }
          const body = el('div', '', 'sg-body');
          const head = el('div', '', 'sg-meta'); head.append(el('strong', post.author), el('span', post.platform === 'instagram' ? 'Instagram' : 'Facebook', 'sg-platform'));
          body.append(head, el('p', post.text, post.image ? 'sg-caption' : 'sg-quote'));
          const url = socialURL(post.url);
          if (post.demo) body.append(el('span', this.dataset.demo, 'sg-source'));
          else if (url) { const link = el('a', this.dataset.original || 'View original', 'sg-source'); link.href = url; link.target = '_blank'; link.rel = 'noopener noreferrer'; body.append(link); }
          card.append(body); grid.append(card);
        }
        this.setupCarousel(grid);
      } catch (e) {
        if (signal.aborted || e.name === 'AbortError') return;
        this.clearCarousel(); grid.replaceChildren();
        if (this.dataset.designMode === 'true') { this.hidden = false; message.textContent = this.dataset.error; message.hidden = false; }
        else this.hidden = true;
      }
    }
  }
  customElements.define('social-gallery', Gallery);
})();
