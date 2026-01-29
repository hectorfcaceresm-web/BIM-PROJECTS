/*
  Portafolio BIM (vanilla)
  - Menú hamburguesa accesible (móvil)
  - Scroll suave
  - Tecnología: anillo % + nivel (Básico/Intermedio/Avanzado)
  - Modal de proyectos con galería (click en tarjetas)
*/

(function () {
  // ===== Helpers =====
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const $  = (sel, root = document) => root.querySelector(sel);

  // ===== Scroll suave (anclas internas) =====
  $$('a[href^="#"]').forEach(a => {
    a.addEventListener('click', (e) => {
      const href = a.getAttribute('href');
      if (!href || href === '#') return;
      const target = document.querySelector(href);
      if (!target) return;
      e.preventDefault();
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      // Cierra menú móvil si estaba abierto
      closeMenu();
    });
  });

  // ===== Menú móvil accesible =====
  const burger = $('.nav__burger');
  const mobileMenu = $('#navMobile');
  const backdrop = $('.nav-mobile__backdrop', mobileMenu || document);
  const closeBtn = $('.nav-mobile__close', mobileMenu || document);
  let lastFocused = null;

  function openMenu() {
    if (!mobileMenu) return;
    lastFocused = document.activeElement;
    mobileMenu.hidden = false;
    document.body.classList.add('no-scroll');
    burger?.setAttribute('aria-expanded', 'true');
    // enfoca el primer link
    const firstLink = $('a', mobileMenu);
    firstLink?.focus();
  }

  function closeMenu() {
    if (!mobileMenu) return;
    if (mobileMenu.hidden) return;
    mobileMenu.hidden = true;
    document.body.classList.remove('no-scroll');
    burger?.setAttribute('aria-expanded', 'false');
    (lastFocused instanceof HTMLElement) && lastFocused.focus();
  }

  burger?.addEventListener('click', () => {
    if (mobileMenu?.hidden) openMenu();
    else closeMenu();
  });

  closeBtn?.addEventListener('click', closeMenu);
  backdrop?.addEventListener('click', closeMenu);

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeMenu();
      closeProjectModal();
    }
  });

  // ===== Tecnología: anillo % + nivel =====
  const techCards = $$('.tech[data-percent]');
  techCards.forEach(card => {
    const pRaw = card.getAttribute('data-percent') || '0';
    const p = Math.max(0, Math.min(100, Number(pRaw)));
    const ring = $('.ring', card);
    const value = $('.ring__value', card);
    const lvl = $('.tech__levelValue', card);

    ring?.style.setProperty('--p', String(p));
    if (value) value.textContent = `${p}%`;

    let levelText = 'Básico';
    if (p >= 70) levelText = 'Avanzado';
    else if (p >= 40) levelText = 'Intermedio';
    if (lvl) lvl.textContent = levelText;
  });

  // ===== Modal de proyectos (galería) =====
  const modal = document.createElement('div');
  modal.className = 'modal';
  modal.hidden = true;
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.innerHTML = `
    <div class="modal__backdrop" data-modal-backdrop></div>
    <div class="modal__panel" role="document" aria-label="Detalle del proyecto">
      <div class="modal__head">
        <div>
          <h3 class="modal__title" data-modal-title></h3>
          <p class="modal__meta" data-modal-meta></p>
        </div>
        <button class="modal__close" type="button" aria-label="Cerrar" data-modal-close>✕</button>
      </div>

      <div class="modal__body">
        <div class="viewer" data-viewer>
          <div class="viewer__canvas" data-viewer-canvas>
            <img class="viewer__img" src="" alt="" data-modal-img draggable="false" />
          </div>

          <div class="viewer__controls" aria-label="Controles de galería">
            <button class="viewer__btn" type="button" data-prev aria-label="Anterior">←</button>
            <button class="viewer__btn" type="button" data-next aria-label="Siguiente">→</button>
          </div>

          <div class="viewer__zoom" role="group" aria-label="Controles de zoom">
            <button class="viewer__zbtn" type="button" data-zoom-out aria-label="Alejar">−</button>
            <button class="viewer__zbtn" type="button" data-zoom-reset aria-label="Restablecer zoom">↺</button>
            <button class="viewer__zbtn" type="button" data-zoom-in aria-label="Acercar">+</button>
            <div class="viewer__zoomValue" aria-live="polite" data-zoom-value>100%</div>
          </div>
        </div>

        <div>
          <div class="thumbs" data-thumbs></div>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  const modalTitle = $('[data-modal-title]', modal);
  const modalMeta = $('[data-modal-meta]', modal);
  const modalImg = $('[data-modal-img]', modal);
  const thumbsWrap = $('[data-thumbs]', modal);
  const modalCloseBtn = $('[data-modal-close]', modal);
  const modalBackdrop = $('[data-modal-backdrop]', modal);
  const prevBtn = $('[data-prev]', modal);
  const nextBtn = $('[data-next]', modal);

  // ===== Zoom + Pan (rueda / pinch) para planos =====
  const viewerEl = $('[data-viewer]', modal);
  const canvasEl = $('[data-viewer-canvas]', modal);
  const zoomValueEl = $('[data-zoom-value]', modal);
  const zoomInBtn = $('[data-zoom-in]', modal);
  const zoomOutBtn = $('[data-zoom-out]', modal);
  const zoomResetBtn = $('[data-zoom-reset]', modal);

  const Z_MIN = 1;
  const Z_MAX = 4;

  let z = 1;       // scale
  let tx = 0;      // translate x
  let ty = 0;      // translate y

  // pointer tracking for pinch
  const pointers = new Map();
  let pinchStartDist = 0;
  let pinchStartZ = 1;
  let pinchStartTx = 0;
  let pinchStartTy = 0;
  let isPanning = false;
  let panStartX = 0;
  let panStartY = 0;
  let panStartTx = 0;
  let panStartTy = 0;

  function clamp(n, a, b){ return Math.max(a, Math.min(b, n)); }

  function setZoomValue(){
    if (!zoomValueEl) return;
    zoomValueEl.textContent = `${Math.round(z * 100)}%`;
  }

  function applyTransform(){
    if (!modalImg) return;
    // Only show grab cursor when zoomed
    const zoomed = z > 1.001;
    viewerEl?.classList.toggle('viewer--zoomed', zoomed);

    // keep transforms
    modalImg.style.transformOrigin = '0 0';
    modalImg.style.transform = `translate(${tx}px, ${ty}px) scale(${z})`;
    setZoomValue();
  }

  function resetZoom(){
    z = 1; tx = 0; ty = 0;
    applyTransform();
  }

  function zoomAt(px, py, nextZ){
    const prevZ = z;
    const nz = clamp(nextZ, Z_MIN, Z_MAX);
    if (Math.abs(nz - prevZ) < 1e-6) return;

    // Keep point under cursor stable
    tx = px - (px - tx) * (nz / prevZ);
    ty = py - (py - ty) * (nz / prevZ);
    z = nz;
    applyTransform();
  }

  function canvasPointFromClient(clientX, clientY){
    const rect = canvasEl?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return { x: clientX - rect.left, y: clientY - rect.top };
  }

  // Wheel zoom (only over the canvas)
  canvasEl?.addEventListener('wheel', (e) => {
    // allow normal scroll if modal is not open
    if (modal.hidden) return;
    // If cursor is over the canvas, zoom. Prevent page scroll.
    e.preventDefault();

    const p = canvasPointFromClient(e.clientX, e.clientY);
    const dir = e.deltaY > 0 ? -1 : 1;
    const step = dir > 0 ? 1.12 : 0.89; // smooth-ish
    zoomAt(p.x, p.y, z * step);
  }, { passive: false });

  // Buttons
  zoomInBtn?.addEventListener('click', () => {
    const rect = canvasEl?.getBoundingClientRect();
    const px = rect ? rect.width / 2 : 0;
    const py = rect ? rect.height / 2 : 0;
    zoomAt(px, py, z * 1.2);
  });
  zoomOutBtn?.addEventListener('click', () => {
    const rect = canvasEl?.getBoundingClientRect();
    const px = rect ? rect.width / 2 : 0;
    const py = rect ? rect.height / 2 : 0;
    zoomAt(px, py, z / 1.2);
  });
  zoomResetBtn?.addEventListener('click', resetZoom);

  // Prevent native image drag "prohibido"
  modalImg?.addEventListener('dragstart', (e) => e.preventDefault());

  // Pointer events (pan + pinch)
  canvasEl?.addEventListener('pointerdown', (e) => {
    if (modal.hidden) return;
    // Do not steal interactions from buttons
    if ((e.target instanceof Element) && (e.target.closest('.viewer__controls') || e.target.closest('.viewer__zoom'))) return;

    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointers.size === 1) {
      // pan only if zoomed
      if (z <= 1.001) return;

      isPanning = true;
      panStartX = e.clientX;
      panStartY = e.clientY;
      panStartTx = tx;
      panStartTy = ty;
      canvasEl.setPointerCapture(e.pointerId);
    } else if (pointers.size === 2) {
      // start pinch
      const pts = Array.from(pointers.values());
      const dx = pts[1].x - pts[0].x;
      const dy = pts[1].y - pts[0].y;
      pinchStartDist = Math.hypot(dx, dy);
      pinchStartZ = z;
      pinchStartTx = tx;
      pinchStartTy = ty;
      isPanning = false;
    }
  });

  canvasEl?.addEventListener('pointermove', (e) => {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointers.size === 2) {
      const pts = Array.from(pointers.values());
      const dx = pts[1].x - pts[0].x;
      const dy = pts[1].y - pts[0].y;
      const dist = Math.max(1, Math.hypot(dx, dy));

      const midX = (pts[0].x + pts[1].x) / 2;
      const midY = (pts[0].y + pts[1].y) / 2;
      const mid = canvasPointFromClient(midX, midY);

      const nz = clamp(pinchStartZ * (dist / pinchStartDist), Z_MIN, Z_MAX);

      // zoom around midpoint, based on pinch start transform
      tx = mid.x - (mid.x - pinchStartTx) * (nz / pinchStartZ);
      ty = mid.y - (mid.y - pinchStartTy) * (nz / pinchStartZ);
      z = nz;
      applyTransform();
      return;
    }

    if (isPanning && z > 1.001) {
      const dx = e.clientX - panStartX;
      const dy = e.clientY - panStartY;
      tx = panStartTx + dx;
      ty = panStartTy + dy;
      applyTransform();
    }
  });

  function endPointer(e){
    pointers.delete(e.pointerId);
    if (pointers.size < 2) {
      pinchStartDist = 0;
    }
    if (pointers.size === 0) {
      isPanning = false;
    }
  }

  canvasEl?.addEventListener('pointerup', endPointer);
  canvasEl?.addEventListener('pointercancel', endPointer);
  canvasEl?.addEventListener('pointerleave', endPointer);


  let gallery = [];
  let index = 0;
  let modalLastFocus = null;

  function renderGallery() {
    if (!modalImg) return;
    const src = gallery[index];
    modalImg.src = src;
    // reset zoom when switching image
    resetZoom();
    modalImg.alt = modalTitle?.textContent ? `${modalTitle.textContent} — imagen ${index + 1}` : `Imagen ${index + 1}`;
    // thumbs
    if (thumbsWrap) {
      thumbsWrap.innerHTML = '';
      gallery.forEach((g, i) => {
        const b = document.createElement('button');
        b.className = 'thumb';
        b.type = 'button';
        b.setAttribute('aria-label', `Ver imagen ${i + 1}`);
        b.setAttribute('aria-current', i === index ? 'true' : 'false');
        b.innerHTML = `<img src="${g}" alt="" loading="lazy" decoding="async" />`;
        b.addEventListener('click', () => { index = i; renderGallery(); });
        thumbsWrap.appendChild(b);
      });
    }
  }

  function openProjectModal(card) {
    if (!card) return;
    modalLastFocus = document.activeElement;

    const title = card.getAttribute('data-title') || 'Proyecto';
    const meta = card.getAttribute('data-meta') || '';
    const role = card.getAttribute('data-role') || '';
    const galleryRaw = card.getAttribute('data-gallery') || '';

    gallery = galleryRaw.split('|').filter(Boolean);
    index = 0;

    if (modalTitle) modalTitle.textContent = title;
    if (modalMeta) modalMeta.textContent = role ? `Rol: ${role} • ${meta}` : meta;

    modal.hidden = false;
    document.body.classList.add('no-scroll');
    resetZoom();
    renderGallery();
    modalCloseBtn?.focus();
  }

  function closeProjectModal() {
    if (modal.hidden) return;
    modal.hidden = true;
    document.body.classList.remove('no-scroll');
    (modalLastFocus instanceof HTMLElement) && modalLastFocus.focus();
  }

  // expose for Escape close
  window.closeProjectModal = closeProjectModal;

  // click cards
  $$('.project[data-project]').forEach(card => {
    const hit = $('.project__hit', card);
    hit?.addEventListener('click', () => openProjectModal(card));
  });

  modalCloseBtn?.addEventListener('click', closeProjectModal);
  modalBackdrop?.addEventListener('click', closeProjectModal);

  prevBtn?.addEventListener('click', () => {
    if (!gallery.length) return;
    index = (index - 1 + gallery.length) % gallery.length;
    renderGallery();
  });
  nextBtn?.addEventListener('click', () => {
    if (!gallery.length) return;
    index = (index + 1) % gallery.length;
    renderGallery();
  });
})();
