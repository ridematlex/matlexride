/* =============================================
   MATLEX RIDE — Landing Page JS
   ============================================= */

const navbar = document.getElementById('navbar');
const backToTop = document.querySelector('.back-to-top');
const hamburger = document.getElementById('hamburger');
const mobileNav = document.getElementById('mobileNav');

window.addEventListener('scroll', () => {
  navbar.classList.toggle('scrolled', window.scrollY > 40);
  backToTop.classList.toggle('visible', window.scrollY > 400);
});

hamburger.addEventListener('click', () => {
  hamburger.classList.toggle('open');
  mobileNav.classList.toggle('open');
});

document.querySelectorAll('.mobile-nav a').forEach(a => {
  a.addEventListener('click', () => {
    hamburger.classList.remove('open');
    mobileNav.classList.remove('open');
  });
});

const pageLinks = document.querySelectorAll('.nav-links a');

document.querySelectorAll('a[href^="#"]').forEach(anchor => {
  anchor.addEventListener('click', e => {
    const target = document.querySelector(anchor.getAttribute('href'));
    if (target) {
      e.preventDefault();
      const offset = 80;
      window.scrollTo({ top: target.offsetTop - offset, behavior: 'smooth' });
    }
  });
});

function setActiveNavLink() {
  const currentPath = window.location.pathname.split('/').pop() || 'index.html';
  pageLinks.forEach(link => {
    const linkPath = link.getAttribute('href').split('/').pop() || 'index.html';
    const isActive = linkPath === currentPath || (linkPath === 'index.html' && currentPath === '');
    link.classList.toggle('active', isActive);
    if (isActive) {
      link.setAttribute('aria-current', 'page');
    } else {
      link.removeAttribute('aria-current');
    }
  });
}

setActiveNavLink();

backToTop.addEventListener('click', () => {
  window.scrollTo({ top: 0, behavior: 'smooth' });
});

const revealObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.add('visible');
      revealObserver.unobserve(entry.target);
    }
  });
}, { threshold: 0.15 });

document.querySelectorAll('.reveal').forEach(el => revealObserver.observe(el));

function animateCounter(el) {
  const target = parseInt(el.dataset.target, 10) || 0;
  const duration = 1700;
  const step = Math.max(1, Math.floor(target / (duration / 16)));
  let current = 0;
  const timer = setInterval(() => {
    current = Math.min(current + step, target);
    el.textContent = current.toLocaleString();
    if (current >= target) clearInterval(timer);
  }, 16);
}

const counterObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      animateCounter(entry.target);
      counterObserver.unobserve(entry.target);
    }
  });
}, { threshold: 0.4 });

document.querySelectorAll('[data-target]').forEach(el => counterObserver.observe(el));

const carouselTrack = document.querySelector('.carousel-track');
const prevButton = document.querySelector('.carousel-btn.prev');
const nextButton = document.querySelector('.carousel-btn.next');
const testimonials = document.querySelectorAll('.testimonial-card');
let currentIndex = 0;

function updateCarousel() {
  const width = testimonials[0]?.offsetWidth || 0;
  const gap = 24;
  carouselTrack.style.transform = `translateX(calc(-${currentIndex} * (${width}px + ${gap}px)))`;
}

prevButton?.addEventListener('click', () => {
  currentIndex = Math.max(0, currentIndex - 1);
  updateCarousel();
});
nextButton?.addEventListener('click', () => {
  currentIndex = Math.min(testimonials.length - 1, currentIndex + 1);
  updateCarousel();
});

window.addEventListener('resize', updateCarousel);

