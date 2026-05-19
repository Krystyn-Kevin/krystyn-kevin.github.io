# Expense Manager - Quick Edit Cheat Sheet

Use this as your "where to edit what" reference.

## Where To Edit What

- **Login/Signup page structure** -> `login.html`
- **Login page design (colors, spacing, card, buttons)** -> `css/login-style.css`
- **Auth behavior (email login, signup, Google login, forgot password)** -> `js/login-script.js`
- **Post-login dashboard layout/sections** -> `index.html`
- **Dashboard look and feel (cards, nav, pills, analytics UI)** -> `css/dashboard-style.css`
- **All app logic (expenses, bank, analytics, PDF, Firestore sync)** -> `js/dashboard-script.js`
- **Project write-up / portfolio narrative** -> `Project Evolution AI-Augmented Expe.txt`

## Task-Based Mapping

- **Add/remove form fields in expense or bank forms** -> `index.html` + `js/dashboard-script.js` (+ CSS if styling needed)
- **Change default categories/subcategories** -> `js/dashboard-script.js` (`DEFAULTS`, `DEFAULT_SUBCATS`)
- **Change bank list behavior (add/delete/persist)** -> `js/dashboard-script.js` (`DEFAULT_BANKS`, `renderBankOptions`, `confirmAddBank`, `deleteBank`)
- **Adjust how data is stored in Firestore** -> `js/dashboard-script.js` (`configRef`, save/listen functions, collection paths)
- **Modify analytics calculations or filters** -> `js/dashboard-script.js` (`renderAnalytics`, period/filter helpers)
- **Change chart style or chart data** -> `js/dashboard-script.js` (Chart.js section in `renderAnalytics`)
- **Change PDF format/content** -> `js/dashboard-script.js` (`runExportPDF` and related helper functions)
- **Theme behavior (dark/light toggle logic)** -> `js/login-script.js` and `js/dashboard-script.js`
- **Theme colors/tokens** -> `css/login-style.css` and `css/dashboard-style.css`

## Safe Edit Rule

- **HTML** = what appears
- **CSS** = how it looks
- **JS** = how it behaves
- **Firestore section in JS** = where data persists/syncs

## Can I Paste The Above Cheat Sheet Here?

Yes. You can paste the same cheat sheet text here anytime and update it as your app grows.

