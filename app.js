// ─────────────────────────────────────────────
//  STEP 1: Paste your Supabase credentials here
//  (you'll get these from supabase.com — see README)
// ─────────────────────────────────────────────
const SUPABASE_URL  = 'PASTE_YOUR_SUPABASE_URL_HERE';
const SUPABASE_ANON = 'PASTE_YOUR_SUPABASE_ANON_KEY_HERE';

// ─────────────────────────────────────────────
//  Setup — don't touch this part
// ─────────────────────────────────────────────
const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_ANON);

// ─────────────────────────────────────────────
//  On page load: check if user is already logged in
// ─────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', async () => {
  const { data: { session } } = await db.auth.getSession();
  if (session) {
    showDashboard(session.user);
  }
});

// Watch for auth changes (login / logout)
db.auth.onAuthStateChange((_event, session) => {
  if (session) {
    showDashboard(session.user);
  } else {
    showLogin();
  }
});

// ─────────────────────────────────────────────
//  Sign In
// ─────────────────────────────────────────────
async function signIn() {
  const email    = document.getElementById('signin-email').value.trim();
  const password = document.getElementById('signin-password').value;
  const btn      = document.getElementById('signin-btn');

  clearMessages('signin');

  if (!email || !password) {
    showError('signin', 'Please enter your email and password.');
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Signing in…';

  const { error } = await db.auth.signInWithPassword({ email, password });

  btn.disabled = false;
  btn.textContent = 'Sign in';

  if (error) {
    showError('signin', error.message);
  }
  // success is handled by onAuthStateChange above
}

// ─────────────────────────────────────────────
//  Sign Up
// ─────────────────────────────────────────────
async function signUp() {
  const name     = document.getElementById('signup-name').value.trim();
  const email    = document.getElementById('signup-email').value.trim();
  const password = document.getElementById('signup-password').value;
  const btn      = document.getElementById('signup-btn');

  clearMessages('signup');

  if (!name || !email || !password) {
    showError('signup', 'Please fill in all fields.');
    return;
  }
  if (password.length < 6) {
    showError('signup', 'Password must be at least 6 characters.');
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Creating account…';

  const { error } = await db.auth.signUp({
    email,
    password,
    options: { data: { full_name: name } }
  });

  btn.disabled = false;
  btn.textContent = 'Create account';

  if (error) {
    showError('signup', error.message);
  } else {
    showSuccess('signup', 'Account created! Check your email to confirm, then sign in.');
    setTimeout(() => showSignin(), 3000);
  }
}

// ─────────────────────────────────────────────
//  Google OAuth
// ─────────────────────────────────────────────
async function signInGoogle() {
  await db.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.href }
  });
}

// ─────────────────────────────────────────────
//  Sign Out
// ─────────────────────────────────────────────
async function signOut() {
  await db.auth.signOut();
}

// ─────────────────────────────────────────────
//  Show / Hide pages
// ─────────────────────────────────────────────
function showDashboard(user) {
  const name = user.user_metadata?.full_name || user.email.split('@')[0];
  const initials = name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);

  const hour = new Date().getHours();
  const greet = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  document.getElementById('dash-greeting').textContent = `${greet}, ${name.split(' ')[0]} 👋`;
  document.getElementById('dash-username').textContent = user.email;
  document.getElementById('dash-avatar').textContent = initials;

  document.getElementById('login-page').style.display = 'none';
  document.getElementById('dashboard-page').style.display = 'flex';
}

function showLogin() {
  document.getElementById('login-page').style.display = 'flex';
  document.getElementById('dashboard-page').style.display = 'none';
}

function showSignup() {
  document.getElementById('signin-box').style.display = 'none';
  document.getElementById('signup-box').style.display = 'block';
}

function showSignin() {
  document.getElementById('signup-box').style.display = 'none';
  document.getElementById('signin-box').style.display = 'block';
}

// ─────────────────────────────────────────────
//  UI helpers
// ─────────────────────────────────────────────
function showError(prefix, msg) {
  const el = document.getElementById(`${prefix}-error`);
  el.textContent = msg;
  el.style.display = 'block';
}

function showSuccess(prefix, msg) {
  const el = document.getElementById(`${prefix}-success`);
  el.textContent = msg;
  el.style.display = 'block';
}

function clearMessages(prefix) {
  document.getElementById(`${prefix}-error`).style.display = 'none';
  document.getElementById(`${prefix}-success`).style.display = 'none';
}

function togglePw(inputId, btn) {
  const input = document.getElementById(inputId);
  if (input.type === 'password') {
    input.type = 'text';
    btn.style.opacity = '1';
  } else {
    input.type = 'password';
    btn.style.opacity = '0.5';
  }
}

function toggleTask(el) {
  el.classList.toggle('done');
  el.textContent = el.classList.contains('done') ? '✓' : '';
  el.nextElementSibling.classList.toggle('done');
}

// Allow Enter key to submit
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter') return;
  if (document.getElementById('signup-box').style.display !== 'none') {
    signUp();
  } else {
    signIn();
  }
});
