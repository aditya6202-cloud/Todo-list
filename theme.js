// theme.js
(function() {
  // Theme check
  const savedTheme = localStorage.getItem('dn_theme');
  if (savedTheme === 'dark') {
    document.documentElement.classList.add('dark-mode');
  }
  
  // Animations check (default is true, so we only apply class if explicitly 'false')
  const savedAnim = localStorage.getItem('dn_animations');
  if (savedAnim === 'false') {
    document.documentElement.classList.add('no-animations');
  }
})();

window.toggleTheme = function(forceVal) {
  let isDark;
  if (forceVal !== undefined) {
    isDark = forceVal;
    document.documentElement.classList.toggle('dark-mode', isDark);
  } else {
    isDark = document.documentElement.classList.toggle('dark-mode');
  }
  localStorage.setItem('dn_theme', isDark ? 'dark' : 'light');
  
  // Optional chart update note
  if (typeof Chart !== 'undefined' && (document.getElementById('miniChart') || document.getElementById('priorityChart'))) {
    // Refreshing charts for dark mode can be done by reloading or manual .update()
  }
  return isDark;
};

window.toggleAnimations = function(forceVal) {
  let noAnim;
  if (forceVal !== undefined) {
    noAnim = !forceVal; // true means yes animations, so false for no-animations
    document.documentElement.classList.toggle('no-animations', noAnim);
  } else {
    noAnim = document.documentElement.classList.toggle('no-animations');
  }
  localStorage.setItem('dn_animations', noAnim ? 'false' : 'true');
  return !noAnim;
};
