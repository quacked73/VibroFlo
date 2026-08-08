import { renderNav } from "./nav.js";
import { brandHeroHTML, companyMarkSVG } from "./logo.js";

renderNav("about");
document.getElementById("brand-hero-root").innerHTML = brandHeroHTML();
document.getElementById("company-mark-root").innerHTML = companyMarkSVG(14);

const tabs = document.querySelectorAll(".tab-row .pill");
const panels = {
  about: document.getElementById("panel-about"),
  support: document.getElementById("panel-support"),
};

tabs.forEach(tab => {
  tab.addEventListener("click", () => {
    tabs.forEach(t => t.classList.remove("active"));
    tab.classList.add("active");
    Object.entries(panels).forEach(([key, el]) => {
      el.style.display = key === tab.dataset.tab ? "block" : "none";
    });
  });
});
