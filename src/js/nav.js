// Renders the same top nav on every page, with the current page highlighted.
// Called once at the top of each page's own script with that page's key.

export function renderNav(activePage){
  const root = document.getElementById("site-nav");
  if(!root) return;
  root.innerHTML = `
    <a href="/index.html" class="site-nav-logo">
      <span class="logo-orb" style="width:22px;height:22px;"></span>
      <span class="site-nav-title">VibroSomatics</span>
    </a>
    <div class="site-nav-links">
      <a href="/index.html" data-page="index">Home</a>
      <a href="/session.html" data-page="session">Session</a>
      <a href="/settings.html" data-page="settings">Settings</a>
      <a href="/about.html" data-page="about">About</a>
    </div>
  `;
  root.querySelectorAll("[data-page]").forEach(a => {
    if(a.dataset.page === activePage) a.classList.add("active");
  });
}
