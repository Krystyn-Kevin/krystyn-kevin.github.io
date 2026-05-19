// ══ FIREBASE CONFIG ═══════════════════════════════════════════════
// IMPORTANT: authDomain must be plain text — no markdown, no brackets
const firebaseConfig = {
  apiKey:            "AIzaSyCPlB-HjpQPfBQbkvH8gApsyBY-ju5l2G4",
  authDomain:        "expense-manager-d42e0.firebaseapp.com",
  projectId:         "expense-manager-d42e0",
  storageBucket:     "expense-manager-d42e0.appspot.com",
  messagingSenderId: "777494191910",
  appId:             "1:777494191910:web:4860b0e50889ec703901b0"
};

firebase.initializeApp(firebaseConfig);
const auth     = firebase.auth();
const provider = new firebase.auth.GoogleAuthProvider();

// ══ SKIP LOGIN IF ALREADY SIGNED IN ═══════════════════════════════
auth.onAuthStateChanged(user => {
  if (user) window.location.replace('index.html');
});

// ══ THEME ══════════════════════════════════════════════════════════
(function() {
  const saved = localStorage.getItem('spendex_theme') || 'light';
  document.documentElement.setAttribute('data-theme', saved);
})();

function toggleTheme() {
  const cur  = document.documentElement.getAttribute('data-theme');
  const next = cur === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('spendex_theme', next);
}

// ══ MODE SWITCH (Login ↔ Sign Up) ══════════════════════════════════
let mode = 'login';

function switchMode(newMode) {
  mode = newMode;
  const isSignup = mode === 'signup';
  document.getElementById('tab-login').classList.toggle('active', !isSignup);
  document.getElementById('tab-signup').classList.toggle('active', isSignup);
  document.getElementById('form-title').textContent        = isSignup ? 'Create account'  : 'Welcome back';
  document.getElementById('btn-text').textContent          = isSignup ? 'Create Account'   : 'Sign In';
  document.getElementById('forgot-link').style.display     = isSignup ? 'none'             : 'block';
  document.getElementById('confirm-group').style.display   = isSignup ? 'block'            : 'none';
  document.getElementById('footer-note').innerHTML         = isSignup
    ? 'Already have an account? <a onclick="switchMode(\'login\')">Sign In</a>'
    : 'Don\'t have an account? <a onclick="switchMode(\'signup\')">Sign Up</a>';
  hideMessages();
}

// ══ HELPERS ════════════════════════════════════════════════════════
function showError(msg) {
  const el = document.getElementById('error-msg');
  el.textContent = msg; el.classList.add('visible');
  document.getElementById('success-msg').classList.remove('visible');
}
function showSuccess(msg) {
  const el = document.getElementById('success-msg');
  el.textContent = msg; el.classList.add('visible');
  document.getElementById('error-msg').classList.remove('visible');
}
function hideMessages() {
  document.getElementById('error-msg').classList.remove('visible');
  document.getElementById('success-msg').classList.remove('visible');
}
function setLoading(on) {
  document.getElementById('submit-btn').disabled  = on;
  document.getElementById('google-btn').disabled  = on;
  document.getElementById('btn-text').style.display = on ? 'none'   : 'inline';
  document.getElementById('btn-spin').style.display = on ? 'inline' : 'none';
}
function friendlyError(code) {
  const map = {
    'auth/invalid-email':          'Please enter a valid email address.',
    'auth/user-not-found':         'No account found with that email.',
    'auth/wrong-password':         'Incorrect password. Try again.',
    'auth/invalid-credential':     'Incorrect email or password. Try again.',
    'auth/email-already-in-use':   'An account with this email already exists.',
    'auth/weak-password':          'Password must be at least 6 characters.',
    'auth/too-many-requests':      'Too many attempts. Please wait a moment.',
    'auth/network-request-failed': 'Network error. Check your connection.',
    'auth/popup-closed-by-user':   'Sign-in was cancelled.',
    'auth/popup-blocked':          'Popup was blocked by your browser. Please allow popups for this site.',
    'auth/unauthorized-domain':    'This domain is not authorised in Firebase. Add it in Firebase Console → Authentication → Authorized Domains.',
  };
  return map[code] || 'Something went wrong (' + code + '). Please try again.';
}
function togglePwd(id, btn) {
  const inp = document.getElementById(id);
  const show = inp.type === 'password';
  inp.type   = show ? 'text' : 'password';
  btn.textContent = show ? '-.-' : 'O.O';
}

// ══ EMAIL / PASSWORD SUBMIT ════════════════════════════════════════
function handleSubmit(e) {
  e.preventDefault();
  const email    = document.getElementById('inp-email').value.trim();
  const password = document.getElementById('inp-password').value;
  const confirm  = document.getElementById('inp-confirm').value;

  if (!email || !password)                      { showError('Please fill in all fields.');      return; }
  if (mode === 'signup' && password !== confirm) { showError('Passwords do not match.');         return; }
  if (mode === 'signup' && password.length < 6)  { showError('Password must be at least 6 characters.'); return; }

  setLoading(true);

  const action = mode === 'login'
    ? auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL)
        .then(() => auth.signInWithEmailAndPassword(email, password))
    : auth.createUserWithEmailAndPassword(email, password);

  action
    .then(() => window.location.replace('index.html'))
    .catch(err => { setLoading(false); showError(friendlyError(err.code)); });
}

// ══ FORGOT PASSWORD ════════════════════════════════════════════════
function handleForgot() {
  const email = document.getElementById('inp-email').value.trim();
  if (!email) { showError('Enter your email address first, then click Forgot Password.'); return; }
  auth.sendPasswordResetEmail(email)
    .then(() => showSuccess('Password reset email sent! Check your inbox.'))
    .catch(err => showError(friendlyError(err.code)));
}

// ══ GOOGLE SIGN-IN ══════════════════════════════════════════════════
// Uses signInWithPopup — requires your GitHub Pages domain to be added
// in Firebase Console → Authentication → Settings → Authorized Domains
function handleGoogle() {
  setLoading(true);
  auth.signInWithPopup(provider)
    .then(() => window.location.replace('index.html'))
    .catch(err => {
      setLoading(false);
      // Special handling for unauthorized domain — most common cause of black popup
      if (err.code === 'auth/unauthorized-domain') {
        showError(
          'Domain not authorised. Go to Firebase Console → Authentication → ' +
          'Settings → Authorized Domains → Add Domain → add your GitHub Pages URL.'
        );
      } else {
        showError(friendlyError(err.code));
      }
    });
}