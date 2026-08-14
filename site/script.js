(() => {
  const body = document.body;
  const video = document.querySelector('.hero-video');
  const hero = document.querySelector('.hero-scroll');
  const projectsList = document.querySelector('#projects-list');
  const contactTriggers = document.querySelectorAll('[data-contact-trigger]');
  const modal = document.querySelector('#site-modal');
  const modalTitle = document.querySelector('#modal-title');
  const modalContent = modal.querySelector('.modal-content');
  const modalClose = modal.querySelector('.modal-close');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let modalReturnFocus = null;
  let logoFrame = null;

  function updateLogoOpacity() {
    const heroHeight = Math.max(1, hero.offsetHeight);
    const opacity = Math.min(1, Math.max(0, window.scrollY / heroHeight));
    body.style.setProperty('--logo-opacity', opacity.toFixed(3));
    logoFrame = null;
  }

  function requestLogoUpdate() {
    if (!logoFrame) logoFrame = requestAnimationFrame(updateLogoOpacity);
  }

  window.addEventListener('scroll', requestLogoUpdate, { passive: true });
  window.addEventListener('resize', requestLogoUpdate, { passive: true });
  updateLogoOpacity();

  function videoReady() {
    body.classList.add('video-available');
    if (reduceMotion.matches) {
      video.pause();
      video.currentTime = Math.max(0, video.duration - 0.04);
    } else {
      video.play().catch(() => {});
    }
  }

  function videoFailed() {
    body.classList.remove('video-available');
    body.classList.add('video-failed');
  }

  video.addEventListener('loadedmetadata', videoReady, { once: true });
  video.addEventListener('error', videoFailed, { once: true });
  video.addEventListener('ended', () => {
    video.pause();
    video.currentTime = Math.max(0, video.duration - 0.04);
  });

  window.setTimeout(() => body.classList.add('interface-visible'), reduceMotion.matches ? 0 : 2000);

  async function loadProjects() {
    try {
      const response = await fetch('./joints/joints.json', { cache: 'no-store' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const data = await response.json();
      if (!Array.isArray(data)) throw new Error('The database root must be an array.');

      const projects = data
        .filter(isVisibleProject)
        .sort((a, b) => Number(b.visibility === 'flagman') - Number(a.visibility === 'flagman'));

      if (projects.length === 0) {
        projectsList.innerHTML = '<p class="projects-status">No visible projects.</p>';
        return;
      }

      projectsList.innerHTML = projects.map(renderProject).join('');
      projectsList.querySelectorAll('.shot-card img').forEach(image => {
        image.addEventListener('error', () => image.closest('.shot-card').classList.add('is-missing'), { once: true });
        if (image.complete && image.naturalWidth === 0) image.closest('.shot-card').classList.add('is-missing');
      });
    } catch (error) {
      projectsList.innerHTML = `<p class="projects-status error">Could not load projects. ${escapeHtml(error.message)}</p>`;
    }
  }

  function isVisibleProject(project) {
    return project &&
      typeof project.name === 'string' &&
      typeof project.typetag === 'string' &&
      typeof project.description === 'string' &&
      (project.visibility === 'shown' || project.visibility === 'flagman') &&
      Array.isArray(project.shots);
  }

  function renderProject(project) {
    const youtubeEmbed = getYouTubeEmbed(project.youtube);
    const shots = project.shots.slice(0, 5);
    const videoMarkup = youtubeEmbed
      ? `<div class="project-video">
          <iframe src="${escapeHtml(youtubeEmbed)}" title="${escapeHtml(project.name)} video" loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>
        </div>`
      : '<div class="project-video media-placeholder">video unavailable</div>';

    return `
      <article class="project-entry ${project.visibility === 'flagman' ? 'flagman' : ''}">
        <div class="featured-project">
          <div class="project-copy">
            <p class="eyebrow">${escapeHtml(project.typetag)}</p>
            <h3>${escapeHtml(project.name)}</h3>
            <p>${escapeHtml(project.description)}</p>
          </div>
          ${videoMarkup}
        </div>
        <div class="shots">
          <p class="eyebrow">Shots</p>
          <div class="shots-grid">
            ${shots.map((shot, index) => renderShot(project.name, shot, index)).join('')}
          </div>
        </div>
      </article>`;
  }

  function renderShot(projectName, shot, index) {
    const path = safeAssetPath(shot?.path) || '#';
    const thumbnail = safeAssetPath(shot?.thumbnail);
    const label = `${projectName} shot ${index + 1}`;

    return `<button class="shot-card" type="button" data-full-image="${escapeHtml(path)}" data-label="${escapeHtml(`shot_${index + 1}`)}" aria-label="Open ${escapeHtml(label)}">
      <img src="${escapeHtml(thumbnail)}" alt="${escapeHtml(label)}" loading="lazy">
    </button>`;
  }

  function openModal(content, title) {
    modalReturnFocus = document.activeElement;
    modalTitle.textContent = title;
    modalContent.innerHTML = content;
    modal.hidden = false;
    modal.setAttribute('aria-hidden', 'false');
    body.classList.add('modal-open');
    requestAnimationFrame(() => modal.classList.add('is-open'));
    modalClose.focus();
  }

  function closeModal() {
    if (modal.hidden) return;
    modal.classList.remove('is-open');
    modal.setAttribute('aria-hidden', 'true');
    body.classList.remove('modal-open');
    window.setTimeout(() => {
      modal.hidden = true;
      modalContent.replaceChildren();
    }, 250);
    modalReturnFocus?.focus();
  }

  function renderShotModal(path, alt) {
    const safePath = safeAssetPath(path);
    if (!safePath || safePath === '#') return;
    openModal(`<div class="modal-shot"><img src="${escapeHtml(safePath)}" alt="${escapeHtml(alt)}"></div>`, alt);
  }

  function renderContactModal() {
    openModal(`
      <div class="contact-links">
        <a href="#">Telegram</a>
        <a href="#">Instagram</a>
        <a href="#">YouTube</a>
        <a href="#">Email</a>
      </div>`, 'Contact Oganes Office');
  }

  projectsList.addEventListener('click', event => {
    const shot = event.target.closest('.shot-card');
    if (!shot) return;
    renderShotModal(shot.dataset.fullImage, shot.querySelector('img')?.alt || 'Project shot');
  });

  contactTriggers.forEach(contactTrigger => {
    contactTrigger.addEventListener('click', event => {
      event.preventDefault();
      renderContactModal();
    });
  });

  modalClose.addEventListener('click', closeModal);
  modal.addEventListener('click', event => {
    if (event.target === modal || event.target === modalContent) closeModal();
  });
  modalContent.addEventListener('click', event => {
    if (event.target.closest('a[href="#"]')) event.preventDefault();
  });
  document.addEventListener('keydown', event => {
    if (modal.hidden) return;
    if (event.key === 'Escape') {
      closeModal();
      return;
    }
    if (event.key === 'Tab') {
      const focusable = [...modal.querySelectorAll('button, a[href]')];
      const first = focusable[0];
      const last = focusable.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
  });

  function getYouTubeEmbed(value) {
    try {
      const url = new URL(value);
      const host = url.hostname.replace(/^www\./, '');
      let id = '';

      if (url.protocol !== 'https:') return '';

      if (host === 'youtu.be') id = url.pathname.slice(1).split('/')[0];
      if (host === 'youtube.com' || host.endsWith('.youtube.com')) {
        id = url.searchParams.get('v') || url.pathname.match(/^\/(?:embed|shorts)\/([^/]+)/)?.[1] || '';
      }

      return /^[\w-]{6,}$/.test(id) ? `https://www.youtube-nocookie.com/embed/${id}` : '';
    } catch {
      return '';
    }
  }

  function safeAssetPath(value) {
    if (typeof value !== 'string') return '';
    const path = value.trim();
    return path.startsWith('./') || (path.startsWith('/') && !path.startsWith('//')) || path.startsWith('https://')
      ? path
      : '';
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  loadProjects();
})();
