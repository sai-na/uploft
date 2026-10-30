// Marks the section being read in the "On this page" list. The list works without this script.
(function () {
  var toc = document.querySelector('.toc');
  if (!toc || !('IntersectionObserver' in window)) return;
  var links = {};
  toc.querySelectorAll('a[href^="#"]').forEach(function (a) { links[decodeURIComponent(a.getAttribute('href').slice(1))] = a; });
  var heads = Object.keys(links).map(function (id) { return document.getElementById(id); }).filter(Boolean);
  var current = null;
  function mark(id) {
    if (id === current) return;
    if (current && links[current]) links[current].removeAttribute('aria-current');
    if (id && links[id]) links[id].setAttribute('aria-current', 'location');
    current = id;
  }
  function update() {
    var line = 140, id = heads.length ? heads[0].id : null;
    for (var i = 0; i < heads.length; i++) {
      if (heads[i].getBoundingClientRect().top - line <= 0) id = heads[i].id; else break;
    }
    mark(id);
  }
  var io = new IntersectionObserver(update, { rootMargin: '-120px 0px -60% 0px' });
  heads.forEach(function (h) { io.observe(h); });
  window.addEventListener('scroll', function () { window.requestAnimationFrame(update); }, { passive: true });
  update();
})();
